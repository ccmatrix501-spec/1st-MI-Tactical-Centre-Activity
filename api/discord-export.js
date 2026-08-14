const API = "https://discord.com/api/v10";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

async function discordJson(url, auth, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { Authorization: auth, ...(options.headers || {}) },
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  return { ok: r.ok, status: r.status, data };
}

async function userInGuild(accessToken, guildId) {
  const r = await discordJson(`${API}/users/@me/guilds`, `Bearer ${accessToken}`);
  return r.ok && Array.isArray(r.data) && r.data.some(g => g.id === guildId);
}

function safeFilename(value) {
  const cleaned = String(value || "Tactical-Centre-Export.json")
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return (/\.json$/i.test(cleaned) ? cleaned : `${cleaned}.json`) || "Tactical-Centre-Export.json";
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization || "";
  const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const { guild_id, destination_id, filename, payload } = req.body || {};
  const guildId = String(guild_id || "");
  const destinationId = String(destination_id || "");

  if (!accessToken) return res.status(401).json({ error: "Discord user authentication is required." });
  if (!botToken) return res.status(500).json({ error: "Missing DISCORD_BOT_TOKEN on Vercel." });
  if (!/^\d{16,22}$/.test(guildId) || !/^\d{16,22}$/.test(destinationId)) {
    return res.status(400).json({ error: "Invalid Discord destination." });
  }
  if (payload === undefined) return res.status(400).json({ error: "No JSON payload provided." });

  if (!(await userInGuild(accessToken, guildId))) {
    return res.status(403).json({ error: "You are not a member of this Discord server." });
  }

  const channelRes = await discordJson(`${API}/channels/${destinationId}`, `Bot ${botToken}`);
  if (!channelRes.ok || channelRes.data?.guild_id !== guildId) {
    return res.status(403).json({ error: "That channel/thread is not available to the Tactical Centre bot." });
  }
  if (![0, 5, 10, 11, 12].includes(channelRes.data?.type)) {
    return res.status(400).json({ error: "That Discord destination cannot receive this export." });
  }

  const outputName = safeFilename(filename);
  const jsonText = JSON.stringify(payload, null, 2);
  if (Buffer.byteLength(jsonText, "utf8") > 8 * 1024 * 1024) {
    return res.status(413).json({ error: "This JSON export is too large to send through the Tactical Centre endpoint." });
  }

  const form = new FormData();
  form.append("payload_json", JSON.stringify({
    content: `**1st M.I. Tactical Centre Export**\n📎 ${outputName}`,
    allowed_mentions: { parse: [] },
    attachments: [{ id: 0, filename: outputName, description: "Tactical Centre JSON export" }],
  }));
  form.append("files[0]", new Blob([jsonText], { type: "application/json" }), outputName);

  const sendRes = await fetch(`${API}/channels/${destinationId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}` },
    body: form,
  });
  const sendText = await sendRes.text();
  let sendData = null;
  try { sendData = sendText ? JSON.parse(sendText) : null; } catch { sendData = { message: sendText }; }

  if (!sendRes.ok) {
    return res.status(sendRes.status).json({
      error: "Discord rejected the export. Check the bot's View Channel, Send Messages, Attach Files, and Send Messages in Threads permissions.",
      discord: sendData,
    });
  }

  return res.status(200).json({
    ok: true,
    message_id: sendData?.id || null,
    channel_id: sendData?.channel_id || destinationId,
    filename: outputName,
  });
}
