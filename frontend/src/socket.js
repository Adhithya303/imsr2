import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

const socket = io(BACKEND_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

socket.on("connect", () => {
  console.log("[Socket] Connected:", socket.id);

  // Re-join session automatically after reconnect
  const token = sessionStorage.getItem("token");
  const sessionCode = sessionStorage.getItem("session_code");
  if (token && sessionCode) {
    socket.emit("join_session", { session_code: sessionCode, token });
    console.log("[Socket] Re-joined session:", sessionCode);
  }
});

socket.on("disconnect", (reason) => {
  console.log("[Socket] Disconnected:", reason);
});

socket.on("connect_error", (err) => {
  console.error("[Socket] Connection error:", err.message);
});

export default socket;
