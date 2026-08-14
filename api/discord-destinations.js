const API = "https://discord.com/api/v10";

const VIEW_CHANNEL = 1n << 10n;
const SEND_MESSAGES = 1n << 11n;
const ATTACH_FILES = 1n << 15n;
const ADMINISTRATOR = 1n << 3n;
const SEND_MESSAGES_IN_THREADS = 1n << 38n;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
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

  if ((permissions & ADMINISTRATOR) === ADMINISTRATOR) {
    return (1n << 63n) - 1n;
  }

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

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const instanceId = String(req.query?.instance_id || "");
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const clientId = String(process.env.DISCORD_CLIENT_ID || "1532302380237066271");

  if (!botToken) return res.status(500).json({ error: "Missing DISCORD_BOT_TOKEN on Vercel." });
  if (!/^\d{16,22}$/.test(clientId)) return res.status(500).json({ error: "Invalid DISCORD_CLIENT_ID on Vercel." });
  if (!validInstanceId(instanceId)) return res.status(400).json({ error: "No valid Discord Activity instance was supplied." });

  const instance = await resolveActivityInstance(instanceId, clientId, botToken);
  if (!instance.ok) return res.status(instance.status || 403).json({ error: instance.error });

  const guildId = instance.guildId;
  const [botUserRes, channelsRes, threadsRes, rolesRes, guildRes] = await Promise.all([
    discordJson(`${API}/users/@me`, `Bot ${botToken}`),
    discordJson(`${API}/guilds/${guildId}/channels`, `Bot ${botToken}`),
    discordJson(`${API}/guilds/${guildId}/threads/active`, `Bot ${botToken}`),
    discordJson(`${API}/guilds/${guildId}/roles`, `Bot ${botToken}`),
    discordJson(`${API}/guilds/${guildId}`, `Bot ${botToken}`)
  ]);

  if (!botUserRes.ok) return res.status(403).json({ error: "The Tactical Centre bot token is invalid." });

  const realBotMemberRes = await discordJson(
    `${API}/guilds/${guildId}/members/${botUserRes.data.id}`,
    `Bot ${botToken}`
  );

  if (!realBotMemberRes.ok) {
    return res.status(403).json({ error: "The Tactical Centre bot is not installed in this server." });
  }

  if (!channelsRes.ok || !rolesRes.ok) {
    return res.status(403).json({ error: "The Tactical Centre bot could not read this server's channels or roles." });
  }

  realBotMemberRes.data.user = realBotMemberRes.data.user || botUserRes.data;

  const allChannels = Array.isArray(channelsRes.data) ? channelsRes.data : [];
  const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
  const categories = new Map(
    allChannels.filter((c) => Number(c.type) === 4).map((c) => [c.id, c.name || "Category"])
  );

  const textChannels = allChannels
    .filter((c) => c && [0, 5, 15, 16].includes(Number(c.type)))
    .map((c) => {
      const perms = effectiveChannelPermissions(c, guildId, realBotMemberRes.data, roles);
      const type = Number(c.type);
      const isForumLike = type === 15 || type === 16;
      const canView = has(perms, VIEW_CHANNEL);
      const canAttach = has(perms, ATTACH_FILES);
      const canSend = !isForumLike && has(perms, SEND_MESSAGES) && canAttach;
      const canSendThreads = has(perms, SEND_MESSAGES_IN_THREADS) && canAttach;
      return {
        id: c.id,
        name: c.name || c.id,
        type,
        parent_id: c.parent_id || null,
        category: c.parent_id ? (categories.get(c.parent_id) || "") : "",
        position: Number.isFinite(c.position) ? c.position : 0,
        can_send: canSend,
        can_send_threads: canSendThreads,
        can_view: canView
      };
    })
    .filter((c) => c.can_view && (c.can_send || c.can_send_threads || c.type === 15 || c.type === 16))
    .sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.position - b.position || a.name.localeCompare(b.name));

  const allowedParentIds = new Set(
    textChannels.filter((c) => c.can_send_threads || c.type === 15 || c.type === 16).map((c) => c.id)
  );

  const activeThreads = threadsRes.ok && Array.isArray(threadsRes.data?.threads)
    ? threadsRes.data.threads
        .filter((t) => t && [10, 11].includes(Number(t.type)) && allowedParentIds.has(t.parent_id))
        .map((t) => ({
          id: t.id,
          name: t.name || t.id,
          parent_id: t.parent_id || null,
          type: Number(t.type),
          archived: !!t.thread_metadata?.archived,
          locked: !!t.thread_metadata?.locked
        }))
        .filter((t) => !t.archived && !t.locked)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return res.status(200).json({
    guild_id: guildId,
    guild_name: guildRes.ok ? (guildRes.data?.name || "Discord Server") : "Discord Server",
    activity_channel_id: instance.data?.location?.channel_id || null,
    channels: textChannels,
    threads: activeThreads
  });
}
