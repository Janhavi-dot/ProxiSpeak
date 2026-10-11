
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const API_URL = "http://localhost:5000";

const WIDTH = 900;
const HEIGHT = 500;
const SPEED = 3;
const HEARING_RADIUS = 100;
const PLAYER_RADIUS = 13;

// Desk positions
const DESKS = [
  [70, 75],
  [230, 75],
  [70, 200],
  [230, 200],
  [70, 325],
  [230, 325],
  [480, 220],
  [480, 325],
];

const DESK_WIDTH = 95;
const DESK_HEIGHT = 48;

// Meeting room
const ROOM = {
  left: 640,
  top: 35,
  right: 860,
  bottom: 160,
};

// Doorway in the bottom wall
const DOORWAY = {
  left: 720,
  right: 780,
};

const WALL_THICKNESS = 6;

const ROOM_WALLS = [
  [ROOM.left, ROOM.top, ROOM.right, ROOM.top],
  [ROOM.left, ROOM.top, ROOM.left, ROOM.bottom],
  [ROOM.right, ROOM.top, ROOM.right, ROOM.bottom],
  [ROOM.left, ROOM.bottom, DOORWAY.left, ROOM.bottom],
  [DOORWAY.right, ROOM.bottom, ROOM.right, ROOM.bottom],
];

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

// Check collision between a player and a wall segment
const pointHitsSegment = (x, y, x1, y1, x2, y2, radius) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  const t =
    lengthSquared === 0
      ? 0
      : clamp(
          ((x - x1) * dx + (y - y1) * dy) / lengthSquared,
          0,
          1
        );

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const distanceX = x - closestX;
  const distanceY = y - closestY;
  const collisionRadius = radius + WALL_THICKNESS / 2;

  return (
    distanceX * distanceX + distanceY * distanceY <
    collisionRadius * collisionRadius
  );
};

// Check desk and meeting-room wall collisions
const collidesWithObstacle = (x, y) => {
  const hitsDesk = DESKS.some(([deskX, deskY]) => {
    const closestX = clamp(x, deskX, deskX + DESK_WIDTH);
    const closestY = clamp(y, deskY, deskY + DESK_HEIGHT);
    const dx = x - closestX;
    const dy = y - closestY;

    return dx * dx + dy * dy < PLAYER_RADIUS * PLAYER_RADIUS;
  });

  const hitsRoomWall = ROOM_WALLS.some(([x1, y1, x2, y2]) =>
    pointHitsSegment(
      x,
      y,
      x1,
      y1,
      x2,
      y2,
      PLAYER_RADIUS
    )
  );

  return hitsDesk || hitsRoomWall;
};

export default function App() {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);

  const peerConnectionsRef = useRef(new Map());
  const audioElementsRef = useRef(new Map());
  const audioNodesRef = useRef(new Map());
  const voiceReadyIdsRef = useRef(new Set());
  const positionsRef = useRef(new Map());

  const playerRef = useRef({ x: 180, y: 180 });
  const keysRef = useRef(new Set());
  const localIdRef = useRef(null);

  const [player, setPlayer] = useState({ x: 180, y: 180 });
  const [users, setUsers] = useState([]);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Voice is off");
  const [error, setError] = useState("");

  // Update player position and send it to the server
  const updatePosition = useCallback((next) => {
    playerRef.current = next;
    setPlayer(next);

    const id = localIdRef.current;

    if (id) {
      positionsRef.current.set(id, next);
    }

    socketRef.current?.emit("player:move", next);
  }, []);

  // Clean up remote audio
  const cleanupPeerAudio = useCallback((peerId) => {
    const audio = audioElementsRef.current.get(peerId);

    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audioElementsRef.current.delete(peerId);
    }

    const nodes = audioNodesRef.current.get(peerId);

    if (nodes) {
      try {
        nodes.source.disconnect();
        nodes.panner.disconnect();
        nodes.gain.disconnect();
      } catch {
        // Nodes may already be disconnected.
      }

      nodes.audioContext.close().catch(() => {});
      audioNodesRef.current.delete(peerId);
    }
  }, []);

  // Create a WebRTC connection
  const createPeerConnection = useCallback((peerId) => {
    const existing = peerConnectionsRef.current.get(peerId);

    if (existing) return existing;

    const socket = socketRef.current;

    if (!socket || !localStreamRef.current) {
      return null;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
      ],
    });

    localStreamRef.current.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc:ice-candidate", {
          to: peerId,
          candidate: event.candidate,
        });
      }
    };

    // FIXED REMOTE AUDIO CONNECTION
    pc.ontrack = (event) => {
      if (event.track.kind !== "audio") return;

      const remoteStream = event.streams[0];

      if (!remoteStream) {
        console.error("No remote audio stream received.");
        return;
      }

      let nodes = audioNodesRef.current.get(peerId);

      if (!nodes) {
        const audioContext = new AudioContext();

        const source =
          audioContext.createMediaStreamSource(remoteStream);

        const panner = audioContext.createStereoPanner();
        const gain = audioContext.createGain();

        // Initial volume; proximity logic adjusts it.
        gain.gain.value = 1;

        source.connect(panner);
        panner.connect(gain);
        gain.connect(audioContext.destination);

        nodes = {
          audioContext,
          source,
          panner,
          gain,
        };

        audioNodesRef.current.set(peerId, nodes);
      }

      // Create a separate audio element for tracking/cleanup.
      // Actual playback is through the Web Audio graph above.
      let audio = audioElementsRef.current.get(peerId);

      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audio.playsInline = true;
        audio.volume = 1;

        audioElementsRef.current.set(peerId, audio);
      }

      nodes.audioContext.resume().catch((err) => {
        console.error("Could not start audio playback:", err);
      });

      setVoiceStatus("Remote audio stream received.");
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        setVoiceStatus(
          "Voice connection failed. Check your network."
        );
      }
    };

    peerConnectionsRef.current.set(peerId, pc);

    return pc;
  }, []);

  // Connect to another user who has enabled voice
  const connectToReadyPeer = useCallback(async (peerId) => {
    const socket = socketRef.current;
    const localId = localIdRef.current;

    if (
      !socket ||
      !localId ||
      !localStreamRef.current ||
      !voiceReadyIdsRef.current.has(peerId)
    ) {
      return;
    }

    const pc = createPeerConnection(peerId);

    if (!pc) return;

    // Only one peer creates the offer.
    if (
      localId.localeCompare(peerId) < 0 &&
      !pc.localDescription
    ) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("webrtc:offer", {
          to: peerId,
          description: pc.localDescription,
        });
      } catch (err) {
        console.error("Could not create WebRTC offer:", err);
      }
    }
  }, [createPeerConnection]);

  // Start microphone
  const startVoice = async () => {
    if (localStreamRef.current) return;

    setError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Microphone access requires localhost or HTTPS."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localStreamRef.current = stream;

      setVoiceOn(true);
      setVoiceStatus(
        "Microphone on. Waiting for nearby users with voice."
      );

      const socket = socketRef.current;

      if (!socket) {
        stream.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setVoiceOn(false);

        throw new Error(
          "The ProxiSpeak server is not connected."
        );
      }

      socket.emit("voice:ready");
    } catch (err) {
      setError(err.message || "Could not access the microphone.");
      setVoiceStatus("Microphone unavailable");
    }
  };

  // Stop microphone and close audio connections
  const stopVoice = () => {
    socketRef.current?.emit("voice:stop");

    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    localStreamRef.current = null;

    for (const pc of peerConnectionsRef.current.values()) {
      pc.close();
    }

    peerConnectionsRef.current.clear();

    for (const peerId of [...audioElementsRef.current.keys()]) {
      cleanupPeerAudio(peerId);
    }

    voiceReadyIdsRef.current.clear();

    setVoiceOn(false);
    setVoiceStatus("Voice is off");
  };

  // Socket.IO and WebRTC event handling
  useEffect(() => {
    const socket = io(API_URL);
    socketRef.current = socket;

    socket.on("connect", () => {
      localIdRef.current = socket.id;

      positionsRef.current.set(
        socket.id,
        playerRef.current
      );
    });

    socket.on("connect_error", (err) => {
      setError(`Server connection failed: ${err.message}`);
    });

    socket.on("users:update", (list) => {
      setUsers(list);

      list.forEach((user) => {
        positionsRef.current.set(user.id, {
          x: user.x,
          y: user.y,
        });
      });
    });

    socket.on("user:joined", (user) => {
      setUsers((previous) => [
        ...previous.filter((item) => item.id !== user.id),
        user,
      ]);

      positionsRef.current.set(user.id, {
        x: user.x,
        y: user.y,
      });
    });

    socket.on("player:moved", ({ id, x, y }) => {
      positionsRef.current.set(id, { x, y });

      setUsers((previous) =>
        previous.map((user) =>
          user.id === id ? { ...user, x, y } : user
        )
      );
    });

    socket.on("user:left", (id) => {
      setUsers((previous) =>
        previous.filter((user) => user.id !== id)
      );

      positionsRef.current.delete(id);
      voiceReadyIdsRef.current.delete(id);

      peerConnectionsRef.current.get(id)?.close();
      peerConnectionsRef.current.delete(id);

      cleanupPeerAudio(id);
    });

    socket.on("proximity:update", setNearbyUsers);

    socket.on("voice:ready-users", async (ids) => {
      ids.forEach((id) => voiceReadyIdsRef.current.add(id));

      for (const id of ids) {
        await connectToReadyPeer(id);
      }
    });

    socket.on("voice:user-ready", async ({ id }) => {
      voiceReadyIdsRef.current.add(id);
      await connectToReadyPeer(id);
    });

    socket.on("voice:user-stopped", ({ id }) => {
      voiceReadyIdsRef.current.delete(id);

      peerConnectionsRef.current.get(id)?.close();
      peerConnectionsRef.current.delete(id);

      cleanupPeerAudio(id);
    });

    socket.on("webrtc:offer", async ({ from, description }) => {
      if (
        !localStreamRef.current ||
        !voiceReadyIdsRef.current.has(from)
      ) {
        return;
      }

      try {
        const pc = createPeerConnection(from);

        if (!pc) return;

        await pc.setRemoteDescription(description);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("webrtc:answer", {
          to: from,
          description: pc.localDescription,
        });
      } catch (err) {
        console.error("Could not handle WebRTC offer:", err);
      }
    });

    socket.on("webrtc:answer", async ({ from, description }) => {
      const pc = peerConnectionsRef.current.get(from);

      if (!pc) return;

      try {
        await pc.setRemoteDescription(description);
      } catch (err) {
        console.error("Could not handle WebRTC answer:", err);
      }
    });

    socket.on(
      "webrtc:ice-candidate",
      async ({ from, candidate }) => {
        const pc = peerConnectionsRef.current.get(from);

        if (!pc || !candidate) return;

        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          console.error("Could not add ICE candidate:", err);
        }
      }
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;

      localStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      localStreamRef.current = null;

      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();

      for (const peerId of [...audioElementsRef.current.keys()]) {
        cleanupPeerAudio(peerId);
      }
    };
  }, [
    connectToReadyPeer,
    createPeerConnection,
    cleanupPeerAudio,
  ]);

  // Keyboard movement and collision detection
  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();

      if (
        [
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "w",
          "a",
          "s",
          "d",
        ].includes(key)
      ) {
        event.preventDefault();
        keysRef.current.add(key);
      }
    };

    const onKeyUp = (event) => {
      keysRef.current.delete(event.key.toLowerCase());
    };

    const onBlur = () => keysRef.current.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    let frame;

    const move = () => {
      const keys = keysRef.current;
      const current = playerRef.current;

      let dx = 0;
      let dy = 0;

      if (keys.has("arrowup") || keys.has("w")) dy -= SPEED;
      if (keys.has("arrowdown") || keys.has("s")) dy += SPEED;
      if (keys.has("arrowleft") || keys.has("a")) dx -= SPEED;
      if (keys.has("arrowright") || keys.has("d")) dx += SPEED;

      // Normalize diagonal movement
      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }

      const nextX = clamp(
        current.x + dx,
        PLAYER_RADIUS + 8,
        WIDTH - PLAYER_RADIUS - 8
      );

      const nextY = clamp(
        current.y + dy,
        PLAYER_RADIUS + 8,
        HEIGHT - PLAYER_RADIUS - 8
      );

      // Check axes independently so players can slide along obstacles
      const canMoveX = !collidesWithObstacle(nextX, current.y);
      const canMoveY = !collidesWithObstacle(current.x, nextY);

      const next = {
        x: canMoveX ? nextX : current.x,
        y: canMoveY ? nextY : current.y,
      };

      if (next.x !== current.x || next.y !== current.y) {
        updatePosition(next);
      }

      frame = requestAnimationFrame(move);
    };

    frame = requestAnimationFrame(move);

    return () => {
      cancelAnimationFrame(frame);

      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [updatePosition]);

  // Draw office and update audio volume and stereo position
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let frame;

    const draw = () => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      // Office background
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Outer office boundary
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 3;
      ctx.strokeRect(8, 8, WIDTH - 16, HEIGHT - 16);

      // Meeting-room floor
      ctx.fillStyle = "#e0f2fe";
      ctx.fillRect(
        ROOM.left,
        ROOM.top,
        ROOM.right - ROOM.left,
        ROOM.bottom - ROOM.top
      );

      // Meeting-room walls with an open doorway
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = WALL_THICKNESS;
      ctx.lineCap = "square";

      ROOM_WALLS.forEach(([x1, y1, x2, y2]) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });

      ctx.lineWidth = 1;
      ctx.lineCap = "butt";

      // Meeting-room labels
      ctx.fillStyle = "#075985";
      ctx.font = "bold 15px Arial";
      ctx.fillText("Meeting Room", 690, 58);

      ctx.font = "11px Arial";
      ctx.fillText(
        "Doorway",
        DOORWAY.left + 4,
        ROOM.bottom - 8
      );

      // Draw desks
      DESKS.forEach(([x, y]) => {
        ctx.fillStyle = "#d6b58c";
        ctx.fillRect(x, y, DESK_WIDTH, DESK_HEIGHT);

        ctx.strokeStyle = "#9a7046";
        ctx.strokeRect(x, y, DESK_WIDTH, DESK_HEIGHT);

        ctx.fillStyle = "#64748b";
        ctx.fillRect(x + 34, y + 7, 28, 20);
      });

      const local = playerRef.current;

      const allPlayers = users.filter(
        (user) => user.id !== localIdRef.current
      );

      // Distance-based audio and stereo panning
      audioNodesRef.current.forEach((nodes, id) => {
        const remote = positionsRef.current.get(id);

        if (!remote || !localStreamRef.current) {
          nodes.gain.gain.setTargetAtTime(
            0,
            nodes.audioContext.currentTime,
            0.08
          );
          return;
        }

        const dx = remote.x - local.x;
        const dy = remote.y - local.y;
        const distance = Math.hypot(dx, dy);

        const withinRange = distance < HEARING_RADIUS;

        const volume = withinRange
          ? Math.max(0, 1 - distance / HEARING_RADIUS)
          : 0;

        const pan = withinRange
          ? Math.max(-1, Math.min(1, dx / HEARING_RADIUS))
          : 0;

        nodes.gain.gain.setTargetAtTime(
          volume,
          nodes.audioContext.currentTime,
          0.08
        );

        nodes.panner.pan.setTargetAtTime(
          pan,
          nodes.audioContext.currentTime,
          0.08
        );
      });

      // Local hearing-radius circle
      ctx.beginPath();
      ctx.arc(
        local.x,
        local.y,
        HEARING_RADIUS,
        0,
        Math.PI * 2
      );

      ctx.fillStyle = "rgba(34, 197, 94, 0.08)";
      ctx.fill();

      ctx.strokeStyle = "#22c55e";
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Other connected users
      allPlayers.forEach((user) => {
        const position =
          positionsRef.current.get(user.id) || user;

        ctx.beginPath();
        ctx.arc(position.x, position.y, 12, 0, Math.PI * 2);

        ctx.fillStyle = "#f97316";
        ctx.fill();

        ctx.fillStyle = "#7c2d12";
        ctx.font = "12px Arial";
        ctx.fillText(
          user.name,
          position.x - 25,
          position.y - 18
        );
      });

      // Local avatar
      ctx.beginPath();
      ctx.arc(
        local.x,
        local.y,
        PLAYER_RADIUS,
        0,
        Math.PI * 2
      );

      ctx.fillStyle = "#2563eb";
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px Arial";
      ctx.fillText("YOU", local.x - 10, local.y + 4);

      frame = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(frame);
  }, [users, player]);

  return (
    <main className="app">
      <header className="app-header">
        <h1>ProxiSpeak</h1>
        <p>Proximity-based virtual office</p>
      </header>

      <section className="stats">
        <span>
          Connected users:{" "}
          {users.length || (localIdRef.current ? 1 : 0)}
        </span>

        <span>
          Position: X {Math.round(player.x)}, Y{" "}
          {Math.round(player.y)}
        </span>

        <span>Hearing radius: {HEARING_RADIUS}px</span>
      </section>

      <div className="office-wrap">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          aria-label="ProxiSpeak virtual office"
        />
      </div>

      <section className="voice-panel">
        <h2>Voice Chat</h2>
        <p>{voiceStatus}</p>

        {!voiceOn ? (
          <button onClick={startVoice}>Start Voice</button>
        ) : (
          <button
            onClick={stopVoice}
            className="stop-button"
          >
            Stop Voice
          </button>
        )}

        {error && (
          <p className="error-message">{error}</p>
        )}

        <p className="help-text">
          Keep your microphone enabled only when you want
          to participate. Audio volume decreases with distance
          and is muted beyond 100 pixels.
        </p>
      </section>

      <section className="proximity-panel">
        <h3>Proximity Detection</h3>

        {nearbyUsers.length === 0 ? (
          <p>No users within your 100-pixel hearing radius.</p>
        ) : (
          <ul>
            {nearbyUsers.map((user) => (
              <li key={user.id}>
                <span className="nearby-indicator">●</span>{" "}
                {user.name} — {user.distance} pixels away
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="keyboard-help">
        Move with arrow keys or W, A, S, D.
      </p>
    </main>
  );
}
