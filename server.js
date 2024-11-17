const express = require("express");
const WebSocket = require("ws");
const Redis = require("redis");

// Create Redis client
const redisClient = Redis.createClient();

redisClient.on("error", (err) => console.error("Redis Error:", err));
redisClient.connect();

// Express app setup
const app = express();
const PORT = 4000;

// WebSocket Server setup
const wss = new WebSocket.Server({ noServer: true });

// Key in Redis for viewer count
const VIEWER_COUNT_KEY = "viewer_count";

// Reset viewer count when the server starts
(async () => {
  await redisClient.set(VIEWER_COUNT_KEY, 0);
})();

// WebSocket connection handling
wss.on("connection", (ws) => {
  console.log("New WebSocket connection established.");

  // Increment viewer count in Redis
  redisClient.incr(VIEWER_COUNT_KEY).then(async () => {
    const viewerCount = await redisClient.get(VIEWER_COUNT_KEY);
    broadcastViewerCount(viewerCount);
  });

  // Handle disconnection
  ws.on("close", async () => {
    console.log("WebSocket connection closed.");

    redisClient.decr(VIEWER_COUNT_KEY).then(async () => {
      const viewerCount = await redisClient.get(VIEWER_COUNT_KEY);
      broadcastViewerCount(viewerCount);
    });
  });
});

// Broadcast viewer count to all connected clients
function broadcastViewerCount(count) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ viewers: count }));
    }
  });
}

// Express API endpoint for viewer count
app.get("/viewers", async (req, res) => {
  try {
    const count = await redisClient.get(VIEWER_COUNT_KEY);
    res.json({ viewers: parseInt(count, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching viewer count.");
  }
});

// Handle WebSocket upgrades
app.server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});
