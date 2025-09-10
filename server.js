const express = require("express");
const axios = require("axios");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = (process.env.MONDAY_CLIENT_ID || "").trim();
const CLIENT_SECRET = (process.env.MONDAY_CLIENT_SECRET || "").trim();
const REDIRECT_URI = (process.env.MONDAY_REDIRECT_URI || "http://localhost:3000/callback").trim();
const BOARD_ID = (process.env.BOARD_ID || "").trim();
const SCOPES = (process.env.MONDAY_SCOPES || "").trim();

let mondayAccessToken = null;

app.use(express.static(path.join(__dirname, "public")));

function buildAuthorizeUrl() {
  const u = new URL("https://auth.monday.com/oauth2/authorize");
  u.searchParams.set("client_id", CLIENT_ID);
  u.searchParams.set("redirect_uri", REDIRECT_URI);
  u.searchParams.set("response_type", "code");
  if (SCOPES) u.searchParams.set("scope", SCOPES);
  u.searchParams.set("state", "monday-demo");
  return u.toString();
}

// Start OAuth login
app.get("/auth", (req, res) => {
  res.redirect(buildAuthorizeUrl());
});

// OAuth callback
app.get("/callback", async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error("OAuth error:", error, error_description);
    return res.status(400).send(`OAuth error: ${error_description || error}`);
  }

  if (!code) return res.status(400).send("No code received");

  try {
    const response = await axios.post("https://auth.monday.com/oauth2/token", {
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    });

    mondayAccessToken = response.data.access_token;
    console.log("✅ Got Monday access token");

    res.send("Authentication successful! <a href='/'>Go to Dashboard</a>");
  } catch (err) {
    console.error("OAuth token exchange error:", err.response?.data || err.message);
    res.status(500).send("Failed to authenticate (see logs).");
  }
});

// API route to fetch board data (columns + groups + items)
app.get("/api/board", async (req, res) => {
  if (!mondayAccessToken) {
    return res.status(401).json({ error: "Not authenticated. Visit /auth first." });
  }
  if (!BOARD_ID) {
    return res.status(400).json({ error: "BOARD_ID is not set." });
  }

  try {
    const query = `
      query {
        boards(ids: ${BOARD_ID}) {
          id
          name
          state
          columns {
            id
            title
          }
          groups {
            id
            title
            items_page {
              items {
                id
                name
                column_values {
                  id
                  text
                  type
                }
              }
            }
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
});
