
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const WIDTH = 900;
const HEIGHT = 500;
const SPEED = 3;
const API_URL = "http://localhost:5000";
const HEARING_RADIUS = 100;

function App() {
  const canvasRef = useRef(null);
  const position = useRef({ x: 180, y: 180 });
  const keys = useRef({});
  const remoteUsers = useRef(new Map());

  const [connection, setConnection] = useState("Connecting...");
  const [connectionError, setConnectionError] = useState("");
  const [userCount, setUserCount] = useState(1);
  const [coordinates, setCoordinates] = useState({ x: 180, y: 180 });
  const [nearbyUsers, setNearbyUsers] = useState([]);

  useEffect(() => {
    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    socket.on("connect", () => {
      console.log("Socket.io connected:", socket.id);
      setConnection("Connected");
      setConnectionError("");
    });

    socket.on("connect_error", (error) => {
      console.error("Socket.io connection error:", error.message);
      setConnection("Connection failed");
      setConnectionError(error.message);
    });

    socket.on("disconnect", (reason) => {
      console.warn("Socket.io disconnected:", reason);
      setConnection("Disconnected");
    });

    socket.on("users:update", (users) => {
      remoteUsers.current.clear();

      users.forEach((user) => {
        if (user.id !== socket.id) {
          remoteUsers.current.set(user.id, user);
        }
      });

      setUserCount(remoteUsers.current.size + 1);
    });

    socket.on("user:joined", (user) => {
      if (user.id !== socket.id) {
        remoteUsers.current.set(user.id, user);
        setUserCount(remoteUsers.current.size + 1);
      }
    });

    // Update other users' positions.
    socket.on("player:moved", (data) => {
      const user = remoteUsers.current.get(data.id);

      if (user) {
        user.x = data.x;
        user.y = data.y;
      }
    });

    // Receive the list of nearby users from the backend.
    socket.on("proximity:update", (users) => {
      setNearbyUsers(users);
    });

    socket.on("user:left", (id) => {
      remoteUsers.current.delete(id);
      setUserCount(remoteUsers.current.size + 1);
    });

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    let animationId;
    let lastPositionUpdate = 0;
    let lastUIUpdate = 0;

    function handleKeyDown(event) {
      const key = event.key.toLowerCase();

      if (
        ["arrowup", "arrowdown", "arrowleft", "arrowright",
          "w", "a", "s", "d"].includes(key)
      ) {
        event.preventDefault();
        keys.current[key] = true;
      }
    }

    function handleKeyUp(event) {
      keys.current[event.key.toLowerCase()] = false;
    }

    function drawDesk(x, y, label) {
      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(x, y, 120, 55);

      ctx.fillStyle = "#475569";
      ctx.font = "13px Arial";
      ctx.textAlign = "center";
      ctx.fillText(label, x + 60, y + 32);
    }

    function drawAvatar(x, y, name, color) {
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      ctx.fillStyle = "#172033";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.fillText(name, x, y - 25);
    }

    function drawOffice() {
      const p = position.current;
      const k = keys.current;

      if (k.arrowup || k.w) p.y -= SPEED;
      if (k.arrowdown || k.s) p.y += SPEED;
      if (k.arrowleft || k.a) p.x -= SPEED;
      if (k.arrowright || k.d) p.x += SPEED;

      p.x = Math.max(20, Math.min(WIDTH - 20, p.x));
      p.y = Math.max(20, Math.min(HEIGHT - 20, p.y));

      // Office floor and grid.
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;

      for (let x = 0; x <= WIDTH; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }

      for (let y = 0; y <= HEIGHT; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }

      // Office desks.
      drawDesk(60, 60, "Desk 1");
      drawDesk(350, 60, "Desk 2");
      drawDesk(650, 60, "Desk 3");
      drawDesk(60, 380, "Desk 4");
      drawDesk(650, 380, "Desk 5");

      // Meeting area.
      ctx.fillStyle = "#d1fae5";
      ctx.fillRect(370, 350, 150, 70);

      ctx.fillStyle = "#065f46";
      ctx.font = "13px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Meeting Area", 445, 390);

      // Hearing radius.
      ctx.beginPath();
      ctx.arc(p.x, p.y, HEARING_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(79, 70, 229, 0.08)";
      ctx.fill();

      ctx.strokeStyle = "#818cf8";
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Other users.
      for (const user of remoteUsers.current.values()) {
        drawAvatar(user.x, user.y, user.name, "#0d9488");
      }

      // Your avatar.
      drawAvatar(p.x, p.y, "You", "#4f46e5");

      const now = performance.now();

      // Send your position to the backend.
      if (socket.connected && now - lastPositionUpdate >= 50) {
        socket.emit("player:move", { x: p.x, y: p.y });
        lastPositionUpdate = now;
      }

      // Update the displayed coordinates.
      if (now - lastUIUpdate >= 100) {
        setCoordinates({
          x: Math.round(p.x),
          y: Math.round(p.y),
        });

        lastUIUpdate = now;
      }

      animationId = requestAnimationFrame(drawOffice);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    drawOffice();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      socket.disconnect();
    };
  }, []);

  return (
    <main className="app">
      <header className="hero">
        <p className="eyebrow">VIRTUAL COLLABORATION PLATFORM</p>
        <h1>ProxiSpeak</h1>
        <p>Move around your virtual office and meet other users.</p>
      </header>

      <section className="office">
        <div className="office-title">
          <div>
            <h2>Virtual Office</h2>
            <p>Real-time multiplayer environment</p>
          </div>

          <span className={connection === "Connected" ? "online" : "offline"}>
            ● {connection}
          </span>
        </div>

        {connectionError && (
          <p className="connection-error">
            Connection detail: {connectionError}
          </p>
        )}

        <div className="canvas-container">
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            aria-label="ProxiSpeak virtual office"
          />
        </div>

        <div className="stats">
          <span>Connected users: {userCount}</span>
          <span>X: {coordinates.x}</span>
          <span>Y: {coordinates.y}</span>
          <span>Hearing radius: {HEARING_RADIUS} px</span>
        </div>

        {/* Proximity Detection panel */}
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

        <p className="instructions">
          Use arrow keys or W, A, S, D to move your avatar.
          Open a second browser window to test multiplayer.
        </p>
      </section>
    </main>
  );
}

export default App;
