const API = "https://discord.com/api/v10";

const VIEW_CHANNEL = 1n << 10n;
const SEND_MESSAGES = 1n << 11n;
const ATTACH_FILES = 1n << 15n;
const ADMINISTRATOR = 1n << 3n;
const MANAGE_THREADS = 1n << 34n;
const SEND_MESSAGES_IN_THREADS = 1n << 38n;

const CHANNEL_ROLE_PINGS = {
  "1291511308625117265": [
    "1257443553358123110",
    "1258867174232166400",
    "1257452177660706918"
  ],
  "1285429568747995136": [
    "1257444092431044691",
    "1258867171358933113",
    "1257452237093998703"
  ],
  "1284616138965258341": [
    "1257444166711902372",
    "1258867177356922962",
    "1257452279552933889"
  ],
  "1287139624464154747": [
    "1257444253685256313",
    "1258867158935666688",
    "1257452317276377143"
  ]
};

function rolesForDestination(parentChannelId) {
  const key = String(parentChannelId || "");
  const list = CHANNEL_ROLE_PINGS[key];
  if (!Array.isArray(list)) return [];
  return list.map(String).filter((id) => /^\d{16,22}$/.test(id));
}

function clipMessage(text, maxLen = 1500) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1) + "…";
}


function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
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

function has(perms, permission) {
  return (perms & permission) === permission;
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

function safeFilename(value) {
  const cleaned = String(value || "Tactical-Centre-Export.json")
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return (/\.json$/i.test(cleaned) ? cleaned : `${cleaned}.json`) || "Tactical-Centre-Export.json";
}

function validInstanceId(value) {
  const text = String(value || "");
  return text.length >= 8 && text.length <= 220 && /^[A-Za-z0-9._:-]+$/.test(text);
}

async function resolveActivityInstance(instanceId, clientId, botToken) {
  const result = await discordJson(
    `${API}/applications/${encodeURIComponent(clientId)}/activity-instances/${encodeURIComponent(instanceId)}`,
    `Bot ${botToken}`
  );

  if (!result.ok) {
    return { ok: false, status: result.status, error: "Discord could not verify this Activity session. Close the Activity and launch it again." };
  }

  if (String(result.data?.application_id || "") !== String(clientId)) {
    return { ok: false, status: 403, error: "This Activity session belongs to a different Discord application." };
  }

  const guildId = String(result.data?.location?.guild_id || "");
  if (!/^\d{16,22}$/.test(guildId)) {
    return { ok: false, status: 400, error: "Discord export is only available when the Activity is launched inside a server channel." };
  }

  return { ok: true, guildId, data: result.data };
}

function exportSummary(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const lines = [];
  const info = payload.info || {};
  const saveType = payload.certificationType || payload.saveType || payload.type;
  const trainee = payload.traineeName || payload.candidate || payload.recipient || info["Trainee Name"] || info.Candidate;
  const trainer = payload.trainerName || payload.presentedBy || info["Trainer Name"];
  const company = payload.traineeCompany || payload.company || info["Trainee Company"];
  const mapName = payload.mapName || payload.map || info.Map || info["Map Name"];
  if (saveType) lines.push(`**Type:** ${String(saveType)}`);
  if (trainee) lines.push(`**Trainee/Recipient:** ${String(trainee)}`);
  if (trainer) lines.push(`**Trainer/Presenter:** ${String(trainer)}`);
  if (company) lines.push(`**Company:** ${String(company)}`);
  if (mapName) lines.push(`**Map:** ${String(mapName)}`);
  return lines.slice(0, 6);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const clientId = String(process.env.DISCORD_CLIENT_ID || "1532302380237066271");
  const { instance_id, destination_id, filename, payload, message } = req.body || {};
  const instanceId = String(instance_id || "");
  const destinationId = String(destination_id || "");

  if (!botToken) return res.status(500).json({ error: "Missing DISCORD_BOT_TOKEN on Vercel." });
  if (!/^\d{16,22}$/.test(clientId)) return res.status(500).json({ error: "Invalid DISCORD_CLIENT_ID on Vercel." });
  if (!validInstanceId(instanceId)) return res.status(400).json({ error: "No valid Discord Activity instance was supplied." });
  if (!/^\d{16,22}$/.test(destinationId)) return res.status(400).json({ error: "Invalid Discord destination." });
  if (payload === undefined) return res.status(400).json({ error: "No JSON payload provided." });

  const instance = await resolveActivityInstance(instanceId, clientId, botToken);
  if (!instance.ok) return res.status(instance.status || 403).json({ error: instance.error });
  const guildId = instance.guildId;

  const [botUserRes, destinationRes, channelsRes, rolesRes] = await Promise.all([
    discordJson(`${API}/users/@me`, `Bot ${botToken}`),
    discordJson(`${API}/channels/${destinationId}`, `Bot ${botToken}`),
    discordJson(`${API}/guilds/${guildId}/channels`, `Bot ${botToken}`),
    discordJson(`${API}/guilds/${guildId}/roles`, `Bot ${botToken}`)
  ]);

  if (!botUserRes.ok) return res.status(403).json({ error: "The Tactical Centre bot token is invalid." });

  const botMemberRes = await discordJson(
    `${API}/guilds/${guildId}/members/${botUserRes.data.id}`,
    `Bot ${botToken}`
  );

  if (!botMemberRes.ok) return res.status(403).json({ error: "The Tactical Centre bot is not installed in this server." });

  if (!destinationRes.ok || String(destinationRes.data?.guild_id || "") !== guildId) {
    return res.status(403).json({ error: "That channel/thread is not in the server where this Activity is running." });
  }
  if (!channelsRes.ok || !rolesRes.ok) {
    return res.status(403).json({ error: "The Tactical Centre bot could not verify its Discord permissions." });
  }

  botMemberRes.data.user = botMemberRes.data.user || botUserRes.data;

  const destinationType = Number(destinationRes.data?.type);
  if (![0, 5, 10, 11, 12].includes(destinationType)) {
    return res.status(400).json({ error: "Select a text channel or an accessible Discord thread." });
  }

  const allChannels = Array.isArray(channelsRes.data) ? channelsRes.data : [];
  const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
  const isThread = destinationType === 10 || destinationType === 11 || destinationType === 12;
  const permissionChannel = isThread
    ? allChannels.find((c) => c.id === destinationRes.data?.parent_id)
    : allChannels.find((c) => c.id === destinationId);

  if (!permissionChannel) {
    return res.status(403).json({ error: "Could not verify the bot's permissions for that Discord destination." });
  }

  const perms = effectiveChannelPermissions(permissionChannel, guildId, botMemberRes.data, roles);
  const maySend = has(perms, VIEW_CHANNEL) && has(perms, ATTACH_FILES) && (
    isThread ? has(perms, SEND_MESSAGES_IN_THREADS) : has(perms, SEND_MESSAGES)
  );

  if (!maySend) {
    return res.status(403).json({
      error: "The Tactical Centre bot needs View Channel, Attach Files, and the appropriate Send Messages permission for that destination."
    });
  }

  if (isThread && destinationRes.data?.thread_metadata?.locked && !has(perms, MANAGE_THREADS)) {
    return res.status(400).json({ error: "That Discord thread is locked. Give the Tactical Centre bot Manage Threads or choose another thread." });
  }

  // Discord automatically unarchives an archived thread when a message is sent,
  // provided the bot can access the thread and it is not locked against the bot.

  const outputName = safeFilename(filename);
  const jsonText = JSON.stringify(payload, null, 2);
  if (Buffer.byteLength(jsonText, "utf8") > 8 * 1024 * 1024) {
    return res.status(413).json({ error: "This JSON export is too large to send through the Tactical Centre endpoint." });
  }

  const parentIdForRoles = isThread
    ? String(destinationRes.data?.parent_id || permissionChannel?.id || "")
    : String(destinationId);
  const pingRoleIds = rolesForDestination(parentIdForRoles);
  const roleMentions = pingRoleIds.map((id) => `<@&${id}>`).join(" ");
  const userMessage = clipMessage(message);

  const content = [
    roleMentions || null,
    "**1st M.I. Tactical Centre Export**",
    ...exportSummary(payload),
    userMessage ? "" : null,
    userMessage || null,
    `📎 ${outputName}`
  ].filter((line) => line !== null && line !== undefined).join("\n");

  const form = new FormData();
  form.append("payload_json", JSON.stringify({
    content,
    allowed_mentions: {
      parse: [],
      roles: pingRoleIds,
      users: [],
      replied_user: false
    },
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
