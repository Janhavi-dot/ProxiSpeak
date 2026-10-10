
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

// Save a user's virtual-office position in MongoDB.
async function savePosition(user) {
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

// Find users within the 100-pixel hearing radius.
async function updateProximity(user) {
  const nearbyUsers = await positionsCollection
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
    nearbyUsers.map((other) => ({
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

// Refresh proximity information for every connected user.
async function refreshAllProximity() {
  for (const user of users.values()) {
    try {
      await updateProximity(user);
    } catch (error) {
      console.error(
        `Proximity update failed for ${user.name}:`,
        error.message
      );
    }
  }
}

io.on("connection", (socket) => {
  const user = {
    id: socket.id,
    name: `User-${socket.id.slice(0, 4)}`,
    x: 180,
    y: 180,
  };

  users.set(socket.id, user);

  console.log(`Connected: ${user.name} (${socket.id})`);

  socket.emit("users:update", Array.from(users.values()));
  socket.broadcast.emit("user:joined", user);

  // Persist the initial position.
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

    // Broadcast movement to other connected users.
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

  socket.on("disconnect", async (reason) => {
    users.delete(socket.id);

    try {
      await positionsCollection.deleteOne({ _id: socket.id });
      await refreshAllProximity();
    } catch (error) {
      console.error("Could not remove disconnected user:", error.message);
    }

    io.emit("user:left", socket.id);

    console.log(`Disconnected: ${user.name}; reason: ${reason}`);
  });
});

async function startServer() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is missing from your server .env file.");
    process.exitCode = 1;
    return;
  }

  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();

    const database = mongoClient.db("proxispeak");
    positionsCollection = database.collection("user_positions");

    // The virtual office uses planar canvas coordinates.
    // MongoDB's 2d index is appropriate for this coordinate system.
    const existingIndexes = await positionsCollection.indexes();

const positionIndex = existingIndexes.find(
  (index) => index.name === "position_2d"
);

if (positionIndex) {
  await positionsCollection.dropIndex("position_2d");
}

await positionsCollection.createIndex(
  { position: "2d" },
  { min: 0, max: 900 }
);
    

    console.log("MongoDB connected successfully.");

    httpServer.listen(PORT, () => {
      console.log(`ProxiSpeak backend running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Could not start ProxiSpeak:", error.message);
    process.exitCode = 1;
  }
}

startServer();
