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

// Keys in Redis for
const VIEWER_COUNT_KEY = "viewer_count";
const LIKE_COUNT_KEY = "like_count";
const COMMENTS_KEY = "comments";

// Reset viewer count when the server starts
(async () => {
  await redisClient.set(VIEWER_COUNT_KEY, 0);
  await redisClient.set(LIKE_COUNT_KEY, 0);
})();

// WebSocket connection handling
wss.on("connection", (ws) => {
  console.log("New WebSocket connection established.");

  // Increment viewer count in Redis
  redisClient.incr(VIEWER_COUNT_KEY).then(async () => {
    const viewerCount = await redisClient.get(VIEWER_COUNT_KEY);
    broadcastViewerCount(viewerCount);
  });

  // Send the latest N comments to the newly connected client
  redisClient.lRange(COMMENTS_KEY, 0, 80).then((comments) => {
    ws.send(
      JSON.stringify({ type: "comments", comments: comments.map(JSON.parse) })
    );
  });

  // Send the initial like count to the client
  redisClient.get(LIKE_COUNT_KEY).then((likeCount) => {
    ws.send(JSON.stringify({ type: "likes", count: likeCount }));
  });

  // Listen for messages from the client
  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.action === "comment") {
        const username = data.username?.trim() || "Unknown";
        const message = data.message?.trim();

        if (!message) {
          console.error("Invalid comment data:", data);
          return; // Ignore invalid messages
        }

        const comment = {
          username,
          message,
          timestamp: Date.now(),
        };

        await redisClient.lPush(COMMENTS_KEY, JSON.stringify(comment));
        await redisClient.lTrim(COMMENTS_KEY, 0, 80);
        broadcastComment(comment);
      }

      if (data.action === "like") {
        // Increment the like count in Redis
        const newLikeCount = await redisClient.incr(LIKE_COUNT_KEY);
        broadcastLikeCount(newLikeCount);
      } else if (data.action === "dislike") {
        // Decrement the like count in Redis
        const newLikeCount = await redisClient.decr(LIKE_COUNT_KEY);
        broadcastLikeCount(newLikeCount);
      }
    } catch (err) {
      console.error("Error processing WebSocket message:", err);
    }
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
      client.send(JSON.stringify({ type: "viewers", count }));
    }
  });
}

// Broadcast like count to all connected clients
function broadcastLikeCount(count) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "likes", count }));
    }
  });
}

// Broadcast a new comment to all connected clients
function broadcastComment(comment) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "new_comment", comment }));
    }
  });
}

// Handle WebSocket upgrades
app.server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});
