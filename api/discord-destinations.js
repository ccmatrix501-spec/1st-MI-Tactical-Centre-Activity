const API = "https://discord.com/api/v10";

const VIEW_CHANNEL = 1n << 10n;
const SEND_MESSAGES = 1n << 11n;
const ADMINISTRATOR = 1n << 3n;
const SEND_MESSAGES_IN_THREADS = 1n << 38n;

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

function has(perms, permission) {
  return (perms & permission) === permission;
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

  const [meRes, memberRes, channelsRes, threadsRes, rolesRes] = await Promise.all([
    discordJson(`${API}/users/@me`, `Bearer ${accessToken}`),
    discordJson(`${API}/users/@me/guilds/${guildId}/member`, `Bearer ${accessToken}`),
    discordJson(`${API}/guilds/${guildId}/channels`, `Bot ${botToken}`),
    discordJson(`${API}/guilds/${guildId}/threads/active`, `Bot ${botToken}`),
    discordJson(`${API}/guilds/${guildId}/roles`, `Bot ${botToken}`)
  ]);

  if (!meRes.ok || !memberRes.ok) {
    return res.status(403).json({
      error: "Discord could not confirm your membership in this server. Relaunch the Activity and approve the requested server-member permission."
    });
  }
  memberRes.data.user = memberRes.data.user || meRes.data;

  if (!channelsRes.ok || !rolesRes.ok) {
    return res.status(channelsRes.ok ? rolesRes.status : channelsRes.status).json({
      error: "The Tactical Centre bot could not read this server's channels/roles."
    });
  }

  const allChannels = Array.isArray(channelsRes.data) ? channelsRes.data : [];
  const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];

  const textChannels = allChannels
    .filter((c) => c && [0, 5, 15].includes(Number(c.type)))
    .map((c) => {
      const perms = effectiveChannelPermissions(c, guildId, memberRes.data, roles);
      const canView = has(perms, VIEW_CHANNEL);
      const canSend = Number(c.type) === 15 ? false : has(perms, SEND_MESSAGES);
      const canSendThreads = has(perms, SEND_MESSAGES_IN_THREADS);
      return {
        id: c.id,
        name: c.name || c.id,
        type: Number(c.type),
        parent_id: c.parent_id || null,
        position: Number.isFinite(c.position) ? c.position : 0,
        can_send: canSend,
        can_send_threads: canSendThreads,
        can_view: canView
      };
    })
    .filter((c) => c.can_view && (c.can_send || c.can_send_threads || c.type === 15))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

  const allowedParentIds = new Set(textChannels.filter((c) => c.can_send_threads || c.type === 15).map((c) => c.id));
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
    user: { id: meRes.data?.id || null, username: meRes.data?.username || null },
    channels: textChannels,
    threads: activeThreads
  });
}
