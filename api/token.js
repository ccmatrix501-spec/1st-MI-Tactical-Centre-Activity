// Vercel Serverless Function – Discord OAuth token exchange

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code } = req.body || {};

  if (!code) {
    return res.status(400).json({ error: "No authorization code provided" });
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: "Missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET environment variables",
    });
  }

  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: code,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error("Discord token error:", data);
      return res.status(400).json(data);
    }

    return res.status(200).json({
      access_token: data.access_token,
    });
  } catch (err) {
    console.error("Token exchange failed:", err);
    return res.status(500).json({ error: "Token exchange failed" });
  }
}
