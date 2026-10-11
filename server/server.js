
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { MongoClient } from "mongodb";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5182",
      "http://127.0.0.1:5182",
    ],
    methods: ["GET", "POST"],
  },
});

const MONGODB_URI = process.env.MONGODB_URI;
const users = new Map();
const voiceReadyUsers = new Set();

let mongoClient;
let positionsCollection;

app.get("/", (req, res) => {
  res.send("Welcome to ProxiSpeak Backend!");
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    project: "ProxiSpeak",
    message: "Backend is running successfully",
    database: positionsCollection ? "connected" : "disconnected",
  });
});

async function savePosition(user) {
  if (!positionsCollection) return;

  await positionsCollection.updateOne(
    { _id: user.id },
    {
      $set: {
        name: user.name,
        position: [user.x, user.y],
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

async function updateProximity(user) {
  if (!positionsCollection) return;

  const nearby = await positionsCollection
    .find({
      _id: { $ne: user.id },
      position: {
        $near: [user.x, user.y],
        $maxDistance: 100,
      },
    })
    .toArray();

  io.to(user.id).emit(
    "proximity:update",
    nearby.map((other) => ({
      id: other._id,
      name: other.name,
      distance: Math.round(
        Math.hypot(
          user.x - other.position[0],
          user.y - other.position[1]
        )
      ),
    }))
  );
}

async function refreshAllProximity() {
  for (const user of users.values()) {
    try {
      await updateProximity(user);
    } catch (error) {
      console.error("Proximity update failed:", error.message);
    }
  }
}

// Relay WebRTC messages with explicit logs.
function relaySignal(socket, eventName, payload) {
  if (!payload || typeof payload.to !== "string" || !payload.to) {
    console.warn(`[VOICE] Invalid ${eventName} payload from ${socket.id}`);
    return;
  }

  if (!users.has(payload.to)) {
    console.warn(
      `[VOICE] Cannot relay ${eventName}: recipient is disconnected`,
      payload.to
    );
    return;
  }

  const message = { from: socket.id };

  if (eventName === "webrtc:offer" ||
      eventName === "webrtc:answer") {
    if (!payload.description) {
      console.warn(`[VOICE] Missing description in ${eventName}`);
      return;
    }
    message.description = payload.description;
  }

  if (eventName === "webrtc:ice-candidate") {
    if (!payload.candidate) return;
    message.candidate = payload.candidate;
  }

  console.log(
    `[VOICE] Relaying ${eventName}: ${socket.id} -> ${payload.to}`
  );

  io.to(payload.to).emit(eventName, message);
}

io.on("connection", (socket) => {
  const user = {
    id: socket.id,
    name: `User-${socket.id.slice(0, 4)}`,
    x: 180,
    y: 180,
  };

  users.set(socket.id, user);

  console.log(`[SOCKET] Connected: ${user.name} (${socket.id})`);

  socket.emit("users:update", Array.from(users.values()));
  socket.broadcast.emit("user:joined", user);

  savePosition(user)
    .then(refreshAllProximity)
    .catch((error) => {
      console.error("Could not save initial position:", error.message);
    });

  socket.on("player:move", async (position) => {
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return;
    }

    user.x = Math.max(16, Math.min(884, position.x));
    user.y = Math.max(16, Math.min(484, position.y));

    socket.broadcast.emit("player:moved", {
      id: socket.id,
      x: user.x,
      y: user.y,
    });

    try {
      await savePosition(user);
      await refreshAllProximity();
    } catch (error) {
      console.error("Could not update user position:", error.message);
    }
  });

  // Register this user as voice-ready before notifying peers.
  socket.on("voice:ready", () => {
    console.log("[VOICE] voice:ready received from", socket.id);
    const alreadyReady = voiceReadyUsers.has(socket.id);

    voiceReadyUsers.add(socket.id);

    const otherReadyUsers = Array.from(voiceReadyUsers).filter(
      (id) => id !== socket.id
    );

    console.log(
      `[VOICE] ${socket.id} enabled voice. Ready peers: ${otherReadyUsers.length}`
    );

    socket.emit("voice:ready-users", otherReadyUsers);

    if (!alreadyReady) {
      socket.broadcast.emit("voice:user-ready", { id: socket.id });
    }
  });

  socket.on("voice:stop", () => {
    voiceReadyUsers.delete(socket.id);

    console.log(`[VOICE] ${socket.id} stopped voice`);

    socket.broadcast.emit("voice:user-stopped", { id: socket.id });
  });

  socket.on("webrtc:offer", (payload) => {
    relaySignal(socket, "webrtc:offer", payload);
  });

  socket.on("webrtc:answer", (payload) => {
    relaySignal(socket, "webrtc:answer", payload);
  });

  socket.on("webrtc:ice-candidate", (payload) => {
    relaySignal(socket, "webrtc:ice-candidate", payload);
  });

  socket.on("disconnect", async (reason) => {
    users.delete(socket.id);
    voiceReadyUsers.delete(socket.id);

    socket.broadcast.emit("voice:user-stopped", { id: socket.id });

    try {
      if (positionsCollection) {
        await positionsCollection.deleteOne({ _id: socket.id });
      }
      await refreshAllProximity();
    } catch (error) {
      console.error("Disconnect cleanup failed:", error.message);
    }

    io.emit("user:left", socket.id);

    console.log(
      `[SOCKET] Disconnected: ${user.name}; reason: ${reason}`
    );
  });
});

async function startServer() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is missing from server .env");
    process.exitCode = 1;
    return;
  }

  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();

    positionsCollection = mongoClient
      .db("proxispeak")
      .collection("user_positions");

      const indexes = await positionsCollection.indexes();

      const positionIndex = indexes.find(
        (index) =>
          index.key?.position === "2d" &&
          index.name !== "_id_"
      );
      
      if (!positionIndex) {
        await positionsCollection.createIndex(
          { position: "2d" },
          {
            min: 0,
            max: 900,
            name: "position_2d",
          }
        );
      
        console.log("[DB] Created position_2d index.");
      } else {
        console.log(
          "[DB] Position index already exists:",
          positionIndex.name
        );
      }

    console.log("[DB] MongoDB connected successfully.");

    httpServer.on("error", (error) => {
      console.error("[SERVER] Error:", error.message);
    });

    httpServer.listen(PORT, () => {
      console.log(
        `ProxiSpeak backend running at http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error("Could not start ProxiSpeak:", error.message);
    await mongoClient?.close().catch(() => {});
    process.exitCode = 1;
  }
}

startServer();
