import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:5000";

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
  }
  return socket;
}

export function identifySocketUser(profile) {
  const s = getSocket();
  if (s && s.connected) {
    s.emit("user:identify", profile);
  }
}

export function emitLocation(latitude, longitude) {
  const s = getSocket();
  if (s && s.connected) {
    s.emit("user:location", { latitude, longitude });
  }
}

export function emitOfficeMove(pos) {
  const s = getSocket();
  if (s && s.connected) {
    s.emit("user:move", pos);
  }
}
