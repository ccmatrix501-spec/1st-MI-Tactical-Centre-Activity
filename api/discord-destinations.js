const API = "https://discord.com/api/v10";

const VIEW_CHANNEL = 1n << 10n;
const SEND_MESSAGES = 1n << 11n;
const ATTACH_FILES = 1n << 15n;
const READ_MESSAGE_HISTORY = 1n << 16n;
const ADMINISTRATOR = 1n << 3n;
const MANAGE_THREADS = 1n << 34n;
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


function validSnowflake(value) {
  return /^\d{16,22}$/.test(String(value || ""));
}

function requestedChannelIds(req) {
  return String(req.query?.channel_ids || "")
    .split(",")
    .map((value) => value.trim())
    .filter(validSnowflake)
    .slice(0, 25);
}

async function listArchivedThreads(channelId, botToken, kind) {
  const threads = [];
  let before = "";
  let pages = 0;

  while (pages < 100) {
    const params = new URLSearchParams({ limit: "100" });
    if (before) params.set("before", before);

    let path;
    if (kind === "public") {
      path = `/channels/${channelId}/threads/archived/public`;
    } else if (kind === "private") {
      path = `/channels/${channelId}/threads/archived/private`;
    } else {
      path = `/channels/${channelId}/users/@me/threads/archived/private`;
    }

    const page = await discordJson(`${API}${path}?${params.toString()}`, `Bot ${botToken}`);
    if (!page.ok) return { ok: false, status: page.status, data: page.data, threads };

    const pageThreads = Array.isArray(page.data?.threads) ? page.data.threads : [];
    threads.push(...pageThreads);
    pages += 1;

    if (!page.data?.has_more || pageThreads.length === 0) break;

    const oldest = pageThreads[pageThreads.length - 1];
    if (kind === "joined-private") {
      before = String(oldest?.id || "");
    } else {
      before = String(oldest?.thread_metadata?.archive_timestamp || "");
    }
    if (!before) break;
  }

  return { ok: true, status: 200, threads };
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
  const requestedIds = requestedChannelIds(req);
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
      const canReadHistory = has(perms, READ_MESSAGE_HISTORY);
      const canManageThreads = has(perms, MANAGE_THREADS);
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
        can_read_history: canReadHistory,
        can_manage_threads: canManageThreads,
        can_view: canView
      };
    })
    .filter((c) => c.can_view && (c.can_send || c.can_send_threads || c.type === 15 || c.type === 16))
    .sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.position - b.position || a.name.localeCompare(b.name));

  const visibleTextChannels = requestedIds.length
    ? textChannels.filter((c) => requestedIds.includes(String(c.id)))
    : textChannels;

  const allowedParentIds = new Set(
    visibleTextChannels.filter((c) => c.can_send_threads || c.type === 15 || c.type === 16).map((c) => c.id)
  );

  const threadMap = new Map();
  const threadWarnings = [];

  const addThreads = (items) => {
    for (const t of Array.isArray(items) ? items : []) {
      if (!t || ![10, 11, 12].includes(Number(t.type)) || !allowedParentIds.has(t.parent_id)) continue;
      const parent = visibleTextChannels.find((c) => c.id === t.parent_id);
      const archived = !!t.thread_metadata?.archived;
      const locked = !!t.thread_metadata?.locked;

      // Locked threads can only be used by a bot with Manage Threads.
      if (locked && !parent?.can_manage_threads) continue;

      threadMap.set(String(t.id), {
        id: t.id,
        name: t.name || t.id,
        parent_id: t.parent_id || null,
        type: Number(t.type),
        archived,
        locked,
        private: Number(t.type) === 12
      });
    }
  };

  if (threadsRes.ok) addThreads(threadsRes.data?.threads);

  // Discord's active-thread endpoint intentionally omits archived threads.
  // Enumerate archived public/forum threads and accessible private threads per parent.
  for (const channel of visibleTextChannels) {
    if (!allowedParentIds.has(channel.id)) continue;

    if (!channel.can_read_history) {
      threadWarnings.push(`${channel.name}: archived threads require Read Message History.`);
      continue;
    }

    const publicArchived = await listArchivedThreads(channel.id, botToken, "public");
    if (publicArchived.ok) {
      addThreads(publicArchived.threads);
    } else if (![400, 404].includes(publicArchived.status)) {
      threadWarnings.push(`${channel.name}: Discord would not return archived public/forum threads.`);
    }

    // Private threads only exist under normal text channels. With Manage Threads,
    // Discord exposes all archived private threads; otherwise it exposes only joined ones.
    if (Number(channel.type) === 0) {
      const privateKind = channel.can_manage_threads ? "private" : "joined-private";
      const privateArchived = await listArchivedThreads(channel.id, botToken, privateKind);
      if (privateArchived.ok) {
        addThreads(privateArchived.threads);
      } else if (![400, 404].includes(privateArchived.status)) {
        threadWarnings.push(
          channel.can_manage_threads
            ? `${channel.name}: Discord would not return archived private threads.`
            : `${channel.name}: only private threads the bot has joined can be listed without Manage Threads.`
        );
      }
    }
  }

  const allThreads = Array.from(threadMap.values()).sort((a, b) => {
    if (a.parent_id !== b.parent_id) return String(a.parent_id).localeCompare(String(b.parent_id));
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return res.status(200).json({
    guild_id: guildId,
    guild_name: guildRes.ok ? (guildRes.data?.name || "Discord Server") : "Discord Server",
    activity_channel_id: instance.data?.location?.channel_id || null,
    channels: visibleTextChannels,
    threads: allThreads,
    thread_warnings: Array.from(new Set(threadWarnings))
  });
}
