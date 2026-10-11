import { calculateHaversineDistance, isValidCoordinate } from "../utils/distance.js";
import { OfficeLayout } from "../models/OfficeLayout.js";

// In-memory registry of live active colleagues in the office
const liveUsers = new Map();

// Track active earshot pairs: key `${min(id1, id2)}:${max(id1, id2)}`
const activeEarshotPairs = new Set();

const DEFAULT_EARSHOT_RADIUS = 160; // pixels

function getPairKey(id1, id2) {
  return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

export function setupProximitySocket(io) {
  io.on("connection", (socket) => {
    const user = {
      id: socket.id,
      name: `Colleague-${socket.id.slice(0, 4)}`,
      x: 220, // default Reception Lobby position
      y: 190,
      zone: "Modern Reception Lobby",
      latitude: null,
      longitude: null,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${socket.id}`,
      isSpeaking: false,
      joinedAt: new Date(),
    };

    liveUsers.set(socket.id, user);

    // Send active live users count
    io.emit("live:count", liveUsers.size);

    /**
     * User identifies with their logged-in profile
     */
    socket.on("user:identify", (profile) => {
      if (profile && profile.name) {
        user.name = profile.name;
        if (profile.avatar) user.avatar = profile.avatar;
        if (profile.id) user.userId = profile.id;
        socket.broadcast.emit("user:joined", {
          id: socket.id,
          name: user.name,
          avatar: user.avatar,
          x: user.x,
          y: user.y,
          zone: user.zone,
        });
      }
    });

    /**
     * Colleague moves across the virtual office floor plan
     * Evaluates spatial clustering under 20ms and triggers WebRTC earshot handshakes
     */
    socket.on("user:move", (pos) => {
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
        return;
      }

      const startTime = performance.now();

      user.x = Math.round(pos.x);
      user.y = Math.round(pos.y);
      if (pos.zone) user.zone = pos.zone;
      const earshotRadius = Number(pos.radius) || DEFAULT_EARSHOT_RADIUS;

      const nearbyPeers = [];

      for (const [otherId, other] of liveUsers.entries()) {
        if (otherId === socket.id) continue;
        if (other.x === null || other.y === null) continue;

        const dist = Math.round(Math.hypot(user.x - other.x, user.y - other.y));
        const occlusion = OfficeLayout.calculateOcclusion(user.x, user.y, other.x, other.y);
        const pairKey = getPairKey(socket.id, otherId);

        // Within earshot radius: WebRTC peer connection is established
        if (dist <= earshotRadius) {
          nearbyPeers.push({
            id: other.id,
            name: other.name,
            avatar: other.avatar,
            x: other.x,
            y: other.y,
            zone: other.zone,
            distance: dist,
            occlusion,
            isSpeaking: other.isSpeaking,
          });

          if (!activeEarshotPairs.has(pairKey)) {
            activeEarshotPairs.add(pairKey);

            // Inform current user that other peer entered earshot
            socket.emit("webrtc:peer-in-range", {
              peerId: other.id,
              name: other.name,
              avatar: other.avatar,
              distance: dist,
              occlusion,
              x: other.x,
              y: other.y,
            });

            // Inform other peer that current user entered earshot
            io.to(other.id).emit("webrtc:peer-in-range", {
              peerId: socket.id,
              name: user.name,
              avatar: user.avatar,
              distance: dist,
              occlusion,
              x: user.x,
              y: user.y,
            });
          } else {
            // Send dynamic distance update for spatial audio attenuation
            socket.emit("webrtc:distance-update", {
              peerId: other.id,
              distance: dist,
              occlusion,
              dx: other.x - user.x,
              dy: other.y - user.y,
            });
            io.to(other.id).emit("webrtc:distance-update", {
              peerId: socket.id,
              distance: dist,
              occlusion,
              dx: user.x - other.x,
              dy: user.y - other.y,
            });
          }
        } else {
          // Beyond earshot radius: WebRTC peer connection is closed
          if (activeEarshotPairs.has(pairKey)) {
            activeEarshotPairs.delete(pairKey);

            socket.emit("webrtc:peer-out-of-range", { peerId: other.id });
            io.to(other.id).emit("webrtc:peer-out-of-range", { peerId: socket.id });
          }
        }
      }

      const clusteringTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

      socket.emit("proximity:peers", nearbyPeers);
      socket.emit("proximity:audit", {
        peersCount: nearbyPeers.length,
        executionMs: clusteringTimeMs,
        under20msBenchmark: clusteringTimeMs < 20,
      });

      // Broadcast position update to other colleagues
      socket.broadcast.emit("peer:moved", {
        id: socket.id,
        name: user.name,
        avatar: user.avatar,
        x: user.x,
        y: user.y,
        zone: user.zone,
      });
    });

    /**
     * WebRTC P2P Signaling Relay (Offers, Answers, ICE Candidates)
     */
    socket.on("webrtc:signal", ({ to, signal }) => {
      if (to && signal) {
        io.to(to).emit("webrtc:signal", {
          from: socket.id,
          fromName: user.name,
          fromAvatar: user.avatar,
          signal,
        });
      }
    });

    socket.on("webrtc:offer", ({ to, offer }) => {
      if (to && offer) {
        io.to(to).emit("webrtc:offer", {
          from: socket.id,
          fromName: user.name,
          offer,
        });
      }
    });

    socket.on("webrtc:answer", ({ to, answer }) => {
      if (to && answer) {
        io.to(to).emit("webrtc:answer", {
          from: socket.id,
          answer,
        });
      }
    });

    socket.on("webrtc:ice-candidate", ({ to, candidate }) => {
      if (to && candidate) {
        io.to(to).emit("webrtc:ice-candidate", {
          from: socket.id,
          candidate,
        });
      }
    });

    /**
     * Live Microphone Speaking Indicator Broadcast
     */
    socket.on("user:speaking", ({ isSpeaking, level = 0 }) => {
      user.isSpeaking = !!isSpeaking;
      socket.broadcast.emit("peer:speaking", {
        id: socket.id,
        isSpeaking: !!isSpeaking,
        level: Math.round(level * 100) / 100,
      });
    });

    /**
     * GPS Location Handler (Backward compatibility)
     */
    socket.on("user:location", (coords) => {
      if (!coords || !isValidCoordinate(coords.latitude, coords.longitude)) {
        return;
      }

      user.latitude = Number(coords.latitude);
      user.longitude = Number(coords.longitude);

      const nearbyPeers = [];
      for (const [otherId, other] of liveUsers.entries()) {
        if (otherId === socket.id) continue;
        if (other.latitude === null || other.longitude === null) continue;

        const distanceMeters = calculateHaversineDistance(
          user.latitude,
          user.longitude,
          other.latitude,
          other.longitude
        );

        if (distanceMeters <= 1000) {
          nearbyPeers.push({
            id: other.id,
            name: other.name,
            avatar: other.avatar,
            latitude: other.latitude,
            longitude: other.longitude,
            distance: distanceMeters,
          });
        }
      }

      socket.emit("proximity:peers", nearbyPeers);
      socket.broadcast.emit("peer:moved", {
        id: socket.id,
        name: user.name,
        avatar: user.avatar,
        latitude: user.latitude,
        longitude: user.longitude,
      });
    });

    /**
     * Disconnect Cleanup: Sever all WebRTC connections for departing user
     */
    socket.on("disconnect", () => {
      liveUsers.delete(socket.id);

      // Clean up all active earshot pairs
      for (const pair of Array.from(activeEarshotPairs)) {
        if (pair.includes(socket.id)) {
          activeEarshotPairs.delete(pair);
          const [idA, idB] = pair.split(":");
          const otherId = idA === socket.id ? idB : idA;
          io.to(otherId).emit("webrtc:peer-out-of-range", { peerId: socket.id });
        }
      }

      io.emit("live:count", liveUsers.size);
      io.emit("user:left", socket.id);
    });
  });
}
