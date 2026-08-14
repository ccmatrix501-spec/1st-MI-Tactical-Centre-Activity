const API = "https://discord.com/api/v10";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

async function discordJson(url, auth) {
  const r = await fetch(url, { headers: { Authorization: auth } });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  return { ok: r.ok, status: r.status, data };
}

async function userInGuild(accessToken, guildId) {
  const r = await discordJson(`${API}/users/@me/guilds`, `Bearer ${accessToken}`);
  return r.ok && Array.isArray(r.data) && r.data.some(g => g.id === guildId);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization || "";
  const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const guildId = String(req.query?.guild_id || "");
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!accessToken) return res.status(401).json({ error: "Discord user authentication is required." });
  if (!/^\d{16,22}$/.test(guildId)) return res.status(400).json({ error: "Invalid guild_id." });
  if (!botToken) return res.status(500).json({ error: "Missing DISCORD_BOT_TOKEN on Vercel." });

  if (!(await userInGuild(accessToken, guildId))) {
    return res.status(403).json({ error: "You are not a member of this Discord server." });
  }

  const [channelsRes, threadsRes] = await Promise.all([
    discordJson(`${API}/guilds/${guildId}/channels`, `Bot ${botToken}`),
    discordJson(`${API}/guilds/${guildId}/threads/active`, `Bot ${botToken}`),
  ]);

  if (!channelsRes.ok) {
    return res.status(channelsRes.status).json({
      error: "The Tactical Centre bot could not read this server's channels.",
      discord: channelsRes.data,
    });
  }

  const allChannels = Array.isArray(channelsRes.data) ? channelsRes.data : [];
  const textChannels = allChannels
    .filter(c => c && (c.type === 0 || c.type === 5))
    .map(c => ({
      id: c.id,
      name: c.name || c.id,
      type: c.type,
      parent_id: c.parent_id || null,
      position: Number.isFinite(c.position) ? c.position : 0,
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

  const activeThreads = threadsRes.ok && Array.isArray(threadsRes.data?.threads)
    ? threadsRes.data.threads
        .filter(t => t && [10, 11, 12].includes(t.type))
        .map(t => ({
          id: t.id,
          name: t.name || t.id,
          parent_id: t.parent_id || null,
          type: t.type,
          archived: !!t.thread_metadata?.archived,
          locked: !!t.thread_metadata?.locked,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return res.status(200).json({ channels: textChannels, threads: activeThreads });
}
