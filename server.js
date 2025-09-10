const express = require("express");
const axios = require("axios");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Monday app credentials from .env
const CLIENT_ID = process.env.MONDAY_CLIENT_ID;
const CLIENT_SECRET = process.env.MONDAY_CLIENT_SECRET;
const REDIRECT_URI = process.env.MONDAY_REDIRECT_URI || "http://localhost:3000/callback";
const BOARD_ID = process.env.BOARD_ID;

// In-memory storage for access token (for demo). In production, store in DB.
let mondayAccessToken = null;

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// Start OAuth login
app.get("/auth", (req, res) => {
  const authUrl = `https://auth.monday.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}`;

  // Debug logs
  console.log("🔑 Redirecting to Monday OAuth URL:", authUrl);
  console.log("CLIENT_ID:", CLIENT_ID);
  console.log("REDIRECT_URI:", REDIRECT_URI);

  res.redirect(authUrl);
});

// OAuth callback
app.get("/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("No code received");

  try {
    const response = await axios.post("https://auth.monday.com/oauth2/token", {
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    });

    mondayAccessToken = response.data.access_token;
    console.log("✅ Got Monday access token:", mondayAccessToken);

    res.send("Authentication successful! You can now <a href='/'>go to the dashboard</a>.");
  } catch (err) {
    console.error("OAuth error:", err.response?.data || err.message);
    res.status(500).send("Failed to authenticate");
  }
});

// API route to fetch board data
app.get("/api/board", async (req, res) => {
  if (!mondayAccessToken) {
    return res.status(401).json({ error: "Not authenticated. Visit /auth first." });
  }

  try {
    const query = `
      query {
        boards(ids: ${BOARD_ID}) {
          id
          name
          state
          items {
            id
            name
          }
        }
      }
    `;

    const response = await axios.post(
      "https://api.monday.com/v2",
      { query },
      {
        headers: {
          Authorization: mondayAccessToken,
          "Content-Type": "application/json",
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error("Error fetching board:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch board" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);

  if (process.env.RAILWAY_STATIC_URL) {
    console.log(`👉 Visit ${process.env.RAILWAY_STATIC_URL}/auth to start OAuth`);
  } else {
    console.log(`👉 Visit http://localhost:${PORT}/auth to start OAuth`);
  }
});
