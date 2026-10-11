import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "node:http";
import { Server } from "socket.io";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { connectDatabase, closeDatabase, getDb } from "./src/config/database.js";
import { setupProximitySocket } from "./src/sockets/proximitySocket.js";
import authRoutes from "./src/routes/authRoutes.js";
import audioRoutes from "./src/routes/audioRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import officeRoutes from "./src/routes/officeRoutes.js";
import { errorHandler, notFoundHandler } from "./src/middleware/errorHandler.js";
import { apiLimiter } from "./src/middleware/rateLimiter.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Permissive CORS for development across common local ports
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:5182",
  "http://127.0.0.1:5182",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, postman)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Allow dev origins dynamically
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Serve uploaded audio files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Socket.IO configuration
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Attach io to express app for controller access
app.set("io", io);

// General rate limiter on API
app.use("/api", apiLimiter);

// System health check
app.get("/api/health", (req, res) => {
  let dbStatus = "disconnected";
  try {
    if (getDb()) dbStatus = "connected";
  } catch (e) {
    dbStatus = "disconnected";
  }

  res.json({
    success: true,
    project: "ProxiSpeak",
    name: "Geospatial Proximity Audio Ecosystem",
    version: "2.0.0",
    status: "healthy",
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// Root welcome message
app.get("/", (req, res) => {
  res.json({
    project: "ProxiSpeak API",
    description: "Geospatial Proximity Audio Ecosystem Backend",
    endpoints: {
      health: "/api/health",
      auth: "/api/auth",
      audio: "/api/audio",
      users: "/api/users",
    },
  });
});

// Mount modular API routes
app.use("/api/auth", authRoutes);
app.use("/api/audio", audioRoutes);
app.use("/api/users", userRoutes);
app.use("/api/office", officeRoutes);

// 404 & Centralized Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Setup Socket.IO real-time proximity presence
setupProximitySocket(io);

// Start Server and Database Connection
async function startServer() {
  try {
    await connectDatabase();

    httpServer.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(`🎙️  ProxiSpeak Geospatial Audio Ecosystem API`);
      console.log(`🚀 Running at http://localhost:${PORT}`);
      console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
      console.log(`===============================================`);
    });
  } catch (error) {
    console.error("Critical: Could not start ProxiSpeak server:", error.message);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down ProxiSpeak server gracefully...`);
  httpServer.close(async () => {
    try {
      await closeDatabase();
      console.log("Database connections closed. Goodbye!");
      process.exit(0);
    } catch (err) {
      console.error("Error during graceful shutdown:", err.message);
      process.exit(1);
    }
  });
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

startServer();

export { app, httpServer };
