const API = "https://discord.com/api/v10";

const VIEW_CHANNEL = 1n << 10n;
const SEND_MESSAGES = 1n << 11n;
const ADMINISTRATOR = 1n << 3n;
const SEND_MESSAGES_IN_THREADS = 1n << 38n;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

async function discordJson(url, auth, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { Authorization: auth, ...(options.headers || {}) }
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  return { ok: r.ok, status: r.status, data };
}

function bits(value) {
  try { return BigInt(String(value || "0")); } catch { return 0n; }
}

function effectiveChannelPermissions(channel, guildId, member, roles) {
  const everyone = roles.find((r) => r.id === guildId);
  let permissions = bits(everyone?.permissions);
  const memberRoleIds = new Set(Array.isArray(member?.roles) ? member.roles : []);

  for (const role of roles) {
    if (memberRoleIds.has(role.id)) permissions |= bits(role.permissions);
  }

  if ((permissions & ADMINISTRATOR) === ADMINISTRATOR) return (1n << 63n) - 1n;

  const overwrites = Array.isArray(channel?.permission_overwrites) ? channel.permission_overwrites : [];
  const everyoneOverwrite = overwrites.find((o) => o.id === guildId && Number(o.type) === 0);
  if (everyoneOverwrite) {
    permissions &= ~bits(everyoneOverwrite.deny);
    permissions |= bits(everyoneOverwrite.allow);
  }

  let roleDeny = 0n;
  let roleAllow = 0n;
  for (const overwrite of overwrites) {
    if (Number(overwrite.type) !== 0 || !memberRoleIds.has(overwrite.id)) continue;
    roleDeny |= bits(overwrite.deny);
    roleAllow |= bits(overwrite.allow);
  }
  permissions &= ~roleDeny;
  permissions |= roleAllow;

  const memberOverwrite = overwrites.find((o) => o.id === member?.user?.id && Number(o.type) === 1);
  if (memberOverwrite) {
    permissions &= ~bits(memberOverwrite.deny);
    permissions |= bits(memberOverwrite.allow);
  }

  return permissions;
}

function has(perms, permission) {
  return (perms & permission) === permission;
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

  const [meRes, memberRes, destinationRes, channelsRes, rolesRes] = await Promise.all([
    discordJson(`${API}/users/@me`, `Bearer ${accessToken}`),
    discordJson(`${API}/users/@me/guilds/${guildId}/member`, `Bearer ${accessToken}`),
    discordJson(`${API}/channels/${destinationId}`, `Bot ${botToken}`),
    discordJson(`${API}/guilds/${guildId}/channels`, `Bot ${botToken}`),
    discordJson(`${API}/guilds/${guildId}/roles`, `Bot ${botToken}`)
  ]);

  if (!meRes.ok || !memberRes.ok) {
    return res.status(403).json({ error: "You are not an authenticated member of this Discord server." });
  }
  memberRes.data.user = memberRes.data.user || meRes.data;

  if (!destinationRes.ok || destinationRes.data?.guild_id !== guildId) {
    return res.status(403).json({ error: "That channel/thread is not available to the Tactical Centre bot." });
  }
  if (!channelsRes.ok || !rolesRes.ok) {
    return res.status(403).json({ error: "The Tactical Centre bot could not verify channel permissions." });
  }

  const destinationType = Number(destinationRes.data?.type);
  if (![0, 5, 10, 11].includes(destinationType)) {
    return res.status(400).json({ error: "That Discord destination cannot receive this export. Select a text channel or an active public/news thread." });
  }

  const allChannels = Array.isArray(channelsRes.data) ? channelsRes.data : [];
  const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
  const permissionChannel = destinationType === 10 || destinationType === 11
    ? allChannels.find((c) => c.id === destinationRes.data?.parent_id)
    : allChannels.find((c) => c.id === destinationId);

  if (!permissionChannel) {
    return res.status(403).json({ error: "Could not verify your permissions for that Discord destination." });
  }

  const perms = effectiveChannelPermissions(permissionChannel, guildId, memberRes.data, roles);
  const maySend = has(perms, VIEW_CHANNEL) && (
    destinationType === 10 || destinationType === 11
      ? has(perms, SEND_MESSAGES_IN_THREADS)
      : has(perms, SEND_MESSAGES)
  );

  if (!maySend) {
    return res.status(403).json({ error: "You do not have permission to send exports to that Discord channel/thread." });
  }

  const outputName = safeFilename(filename);
  const jsonText = JSON.stringify(payload, null, 2);
  if (Buffer.byteLength(jsonText, "utf8") > 8 * 1024 * 1024) {
    return res.status(413).json({ error: "This JSON export is too large to send through the Tactical Centre endpoint." });
  }

  const content = [
    "**1st M.I. Tactical Centre Export**",
    `**Exported by:** ${meRes.data?.global_name || meRes.data?.username || "Discord user"}`,
    `📎 ${outputName}`
  ].join("\n");

  const form = new FormData();
  form.append("payload_json", JSON.stringify({
    content,
    allowed_mentions: { parse: [] },
    attachments: [{ id: 0, filename: outputName, description: "Tactical Centre JSON export" }]
  }));
  form.append("files[0]", new Blob([jsonText], { type: "application/json" }), outputName);

  const sendRes = await fetch(`${API}/channels/${destinationId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}` },
    body: form
  });

  const sendText = await sendRes.text();
  let sendData = null;
  try { sendData = sendText ? JSON.parse(sendText) : null; } catch { sendData = { message: sendText }; }

  if (!sendRes.ok) {
    return res.status(sendRes.status).json({
      error: "Discord rejected the export. Check the bot's View Channel, Send Messages, Attach Files, and Send Messages in Threads permissions.",
      discord: sendData
    });
  }

  return res.status(200).json({
    ok: true,
    message_id: sendData?.id || null,
    channel_id: sendData?.channel_id || destinationId,
    filename: outputName
  });
}
