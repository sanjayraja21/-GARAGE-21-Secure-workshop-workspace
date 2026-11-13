import { getToken } from "./api";


export function connectWebSocket(onMessage) {
  const socket = new WebSocket(`ws://127.0.0.1:8000/ws?token=${encodeURIComponent(getToken() || "")}`);

  socket.addEventListener("open", () => {
    console.log("Garage Pro WebSocket connected");
  });

  socket.addEventListener("message", (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch (error) {
      console.error("Invalid WebSocket message:", error);
    }
  });

  socket.addEventListener("error", () => {
    console.warn("WebSocket connection error");
  });

  return socket;
}
