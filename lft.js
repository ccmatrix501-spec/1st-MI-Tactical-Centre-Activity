/**
 * Looking for Troopers module — merged into the AAR bot process.
 * Config from config.json (same IDs as the Python bot).
 */
const fs = require('fs');
const path = require('path');
const {
  SlashCommandBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  Events
} = require('discord.js');

const BASE_DIR = __dirname;
let config = {};
try {
  config = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'config.json'), 'utf8'));
} catch (e) {
  console.warn('[LFT] config.json not found — Looking for Troopers disabled');
}

const LFT_GUILD_ID = String(config.GUILD_ID || '1256977709884641382');
const VOICE_CHANNEL_ID = String(config.VOICE_CHANNEL_ID || '1298348530704060426');
const TEXT_CHANNEL_ID = String(config.TEXT_CHANNEL_ID || '1257739942998577152');
const ROLE_ID = String(config.ROLE_ID || '1258530095790948422');
const RECRUIT_ROLE_ID = String(config.RECRUIT_ROLE_ID || '1257038526219030548');
const ONBOARDING_VOICE_CHANNEL_ID = String(config.ONBOARDING_VOICE_CHANNEL_ID || '1257063653300240467');
const NCO_ALERT_CHANNEL_ID = String(config.NCO_ALERT_CHANNEL_ID || '1256992177880432760');
const DROP_SHIP_SIZE = Number(config.DROP_SHIP_SIZE || 16);
const LFG_INTERVAL_MS = Number(config.CHECK_INTERVAL_MINUTES || 30) * 60 * 1000;
const RECRUIT_ALERT_INTERVAL_MS = Number(config.RECRUIT_ALERT_INTERVAL_MINUTES || 15) * 60 * 1000;
const SUPPORTED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function resolveImageDir(preferredName) {
  const name = preferredName || 'images';
  const candidates = [
    path.join(BASE_DIR, name),
    path.join(process.cwd(), name),
    path.join('/app', name),
    path.join(BASE_DIR, 'Looking for troopers', name),
    path.join(process.cwd(), 'Looking for troopers', name)
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        const files = fs.readdirSync(dir).filter((n) => SUPPORTED_EXT.has(path.extname(n).toLowerCase()));
        if (files.length > 0) {
          console.log(`[LFT] Using image folder: ${dir} (${files.length} files)`);
          return dir;
        }
      }
    } catch (e) {}
  }
  // Fall back to first existing dir even if empty (for diagnostics)
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        console.warn(`[LFT] Image folder exists but has 0 images: ${dir}`);
        return dir;
      }
    } catch (e) {}
  }
  console.warn(`[LFT] No image folder found for "${name}". Tried: ${candidates.join(' | ')}`);
  return path.join(BASE_DIR, name);
}

const IMAGE_FOLDER = resolveImageDir(config.IMAGE_FOLDER || 'images');
const RECRUIT_IMAGE_FOLDER = resolveImageDir(config.RECRUIT_IMAGE_FOLDER || 'recruit_alert_images');

let clientRef = null;
let nextLfgAt = 0;
let nextRecruitAt = 0;
let lfgTimer = null;
let recruitTimer = null;

let imageQueue = [];
let lastImage = null;
let recruitImageQueue = [];
let lastRecruitImage = null;

function listImages(folder) {
  try {
    if (!folder || !fs.existsSync(folder)) return [];
    return fs
      .readdirSync(folder)
      .filter((name) => {
        const ext = path.extname(name).toLowerCase();
        return SUPPORTED_EXT.has(ext) && !name.startsWith('.');
      })
      .map((name) => path.join(folder, name))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  } catch (e) {
    console.warn('[LFT] listImages error:', e.message);
    return [];
  }
}

function nextRotatingImage(folder, which) {
  const all = listImages(folder);
  if (!all.length) return null;

  let queue = which === 'lfg' ? imageQueue : recruitImageQueue;
  let last = which === 'lfg' ? lastImage : lastRecruitImage;

  if (!queue.length) {
    queue = [...all];
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    if (queue.length > 1 && last && queue[0] === last) {
      const swap = 1 + Math.floor(Math.random() * (queue.length - 1));
      [queue[0], queue[swap]] = [queue[swap], queue[0]];
    }
  }

  const chosen = queue.shift();
  if (which === 'lfg') {
    imageQueue = queue;
    lastImage = chosen;
  } else {
    recruitImageQueue = queue;
    lastRecruitImage = chosen;
  }
  return chosen;
}

function formatWaitingMessage(count) {
  if (count <= 0) return '';
  const fullShips = Math.floor(count / DROP_SHIP_SIZE);
  const remainder = count % DROP_SHIP_SIZE;
  const parts = Array(fullShips).fill(`${DROP_SHIP_SIZE}/${DROP_SHIP_SIZE}`);
  if (remainder > 0) parts.push(`${remainder}/${DROP_SHIP_SIZE}`);
  return `"${parts.join(' & ')} in waiting for game, lets go troopers!"`;
}

async function sendWithOptionalImage(channel, content, imagePath) {
  if (imagePath) {
    try {
      if (!fs.existsSync(imagePath)) {
        console.warn('[LFT] image path missing:', imagePath);
      } else {
        const stats = fs.statSync(imagePath);
        console.log(`[LFT] Attaching image ${path.basename(imagePath)} (${Math.round(stats.size / 1024)} KB)`);
        const file = new AttachmentBuilder(fs.createReadStream(imagePath), {
          name: path.basename(imagePath)
        });
        await channel.send({ content, files: [file] });
        return path.basename(imagePath);
      }
    } catch (e) {
      console.warn('[LFT] image send failed:', e.message);
      // fall through to text-only
    }
  } else {
    console.warn('[LFT] no imagePath provided — text only');
  }
  await channel.send({ content });
  return null;
}

async function getWaitingChannel() {
  if (!clientRef) return null;
  try {
    const ch = await clientRef.channels.fetch(VOICE_CHANNEL_ID);
    if (!ch || (ch.type !== ChannelType.GuildVoice && ch.type !== 2)) return null;
    return ch;
  } catch (e) {
    console.error('[LFT] fetch Waiting VC failed:', e.message);
    return null;
  }
}

function getWaitingMembersSync() {
  const ch = clientRef?.channels?.cache?.get(VOICE_CHANNEL_ID);
  if (!ch) return [];
  return [...ch.members.values()].filter((m) => m.user && !m.user.bot);
}

async function getWaitingMembers() {
  const ch = await getWaitingChannel();
  if (!ch) return getWaitingMembersSync();
  return [...ch.members.values()].filter((m) => m.user && !m.user.bot);
}

function isRecruitMember(member) {
  if (!member || !member.user || member.user.bot) return false;
  try {
    // Ensure roles are available
    const roles = member.roles?.cache;
    if (!roles) return true; // treat unknown as recruit-safe for alerts
    const hasRecruit = roles.has(RECRUIT_ROLE_ID) || [...roles.keys()].includes(RECRUIT_ROLE_ID);
    const nonEveryone = roles.filter((r) => r.id !== member.guild.id && r.id !== member.guild?.roles?.everyone?.id);
    const noRoles = nonEveryone.size === 0;
    return hasRecruit || noRoles;
  } catch (e) {
    console.warn('[LFT] isRecruitMember error:', e.message);
    return false;
  }
}

function getWaitingRecruits() {
  return getWaitingMembersSync().filter(isRecruitMember);
}

async function getWaitingRecruitsAsync() {
  const members = await getWaitingMembers();
  return members.filter(isRecruitMember);
}

async function postWaitingMessage(count) {
  const textChannel = await clientRef.channels.fetch(TEXT_CHANNEL_ID).catch(() => null);
  if (!textChannel) {
    console.error('[LFT] text channel not found');
    return;
  }
  const guild = textChannel.guild;
  const role = guild.roles.cache.get(ROLE_ID);
  const mention = role ? `<@&${ROLE_ID}>` : '@looking for troopers';
  const body = formatWaitingMessage(count);
  const message = `# ${mention} ${body}`;
  const imagePath = nextRotatingImage(IMAGE_FOLDER, 'lfg');
  const sent = await sendWithOptionalImage(textChannel, message, imagePath);
  console.log(`[LFT] Posted for ${count} troopers${sent ? ' + ' + sent : ''}`);
}

async function runWaitingCheck() {
  const members = await getWaitingMembers();
  const count = members.length;
  if (count <= 0) {
    console.log('[LFT] Waiting for Game empty — skip post');
    return { posted: false, count: 0 };
  }
  await postWaitingMessage(count);
  return { posted: true, count };
}

function scheduleLfg(reason) {
  nextLfgAt = Date.now() + LFG_INTERVAL_MS;
  if (lfgTimer) clearTimeout(lfgTimer);
  lfgTimer = setTimeout(async () => {
    try {
      await runWaitingCheck();
    } catch (e) {
      console.error('[LFT] LFG check error:', e);
    }
    scheduleLfg('auto cycle');
  }, LFG_INTERVAL_MS);
  console.log(`[LFT] LFG timer → ${config.CHECK_INTERVAL_MINUTES || 30} min (${reason})`);
}

async function postRecruitAlert(member) {
  const textChannel = await clientRef.channels.fetch(TEXT_CHANNEL_ID).catch(() => null);
  if (!textChannel) return;
  const role = textChannel.guild.roles.cache.get(ROLE_ID);
  const lfgMention = role ? `<@&${ROLE_ID}>` : '@Looking for Troopers';
  const alert =
    `# 🚨 RECRUIT ALERT 🚨\n` +
    `${lfgMention}\n` +
    `**${member} has joined <#${VOICE_CHANNEL_ID}> and is waiting for a game.**\n` +
    `Get them picked up, geared up, and into the fight, Troopers!`;
  const imagePath = nextRotatingImage(RECRUIT_IMAGE_FOLDER, 'recruit');
  await sendWithOptionalImage(textChannel, alert, imagePath);
  console.log(`[LFT] Recruit alert for ${member.user?.tag || member.id}`);
}

async function postRecruitReminder(members) {
  if (!members.length) return;
  const textChannel = await clientRef.channels.fetch(TEXT_CHANNEL_ID).catch(() => null);
  if (!textChannel) return;
  const role = textChannel.guild.roles.cache.get(ROLE_ID);
  const lfgMention = role ? `<@&${ROLE_ID}>` : '@Looking for Troopers';
  const mentions = members.map((m) => `${m}`).join(' ');
  const alert =
    `# 🚨 RECRUIT REMINDER 🚨\n` +
    `${lfgMention}\n` +
    `Still waiting in <#${VOICE_CHANNEL_ID}>:\n${mentions}\n` +
    `Pick them up, Troopers!`;
  const imagePath = nextRotatingImage(RECRUIT_IMAGE_FOLDER, 'recruit');
  await sendWithOptionalImage(textChannel, alert, imagePath);
  console.log(`[LFT] Recruit reminder for ${members.length} recruit(s)`);
}

async function postOnboardingRecruitAlert(member) {
  const alertChannel = await clientRef.channels.fetch(NCO_ALERT_CHANNEL_ID).catch(() => null);
  if (!alertChannel) return;
  const alert =
    `# 🚨 ONBOARDING RECRUIT ALERT 🚨\n` +
    `**${member} has joined <#${ONBOARDING_VOICE_CHANNEL_ID}> and is currently alone.**\n` +
    `NCOs, a recruit is waiting in the Onboarding Chat voice channel.`;
  await alertChannel.send({ content: alert });
  console.log(`[LFT] Onboarding alert for ${member.user?.tag || member.id}`);
}

function scheduleRecruit(reason) {
  nextRecruitAt = Date.now() + RECRUIT_ALERT_INTERVAL_MS;
  if (recruitTimer) clearTimeout(recruitTimer);
  recruitTimer = setTimeout(async () => {
    try {
      const recruits = getWaitingRecruits();
      if (recruits.length) {
        await postRecruitReminder(recruits);
        scheduleRecruit('recruits still waiting');
      } else {
        nextRecruitAt = 0;
        recruitTimer = null;
        console.log('[LFT] Recruit timer paused — no recruits waiting');
      }
    } catch (e) {
      console.error('[LFT] recruit reminder error:', e);
      scheduleRecruit('error recovery');
    }
  }, RECRUIT_ALERT_INTERVAL_MS);
  console.log(`[LFT] Recruit timer → ${config.RECRUIT_ALERT_INTERVAL_MINUTES || 15} min (${reason})`);
}

function handleLftMessage(message) {
  if (!message.guild || String(message.guild.id) !== LFT_GUILD_ID) return;
  if (String(message.channel.id) !== TEXT_CHANNEL_ID) return;
  if (message.author.bot) return;
  if (message.mentions.roles.has(ROLE_ID)) {
    scheduleLfg(`${message.author.tag} mentioned Looking for Troopers`);
  }
}

async function handleLftVoiceState(oldState, newState) {
  let member = newState.member || oldState.member;
  if (!member || (member.user && member.user.bot)) return;
  if (String(newState.guild?.id || oldState.guild?.id || member.guild?.id) !== LFT_GUILD_ID) return;

  // Refresh member so roles are accurate (blank accounts / recruits)
  try {
    if (newState.guild) {
      member = await newState.guild.members.fetch(member.id);
    }
  } catch (e) {
    console.warn('[LFT] could not fetch member for voice update:', e.message);
  }

  const beforeId = oldState.channelId ? String(oldState.channelId) : null;
  const afterId = newState.channelId ? String(newState.channelId) : null;

  console.log(
    `[LFT] voice ${member.user?.tag || member.id}: ${beforeId || 'none'} → ${afterId || 'none'} ` +
    `(recruit=${isRecruitMember(member)})`
  );

  // Onboarding alone
  if (
    afterId === ONBOARDING_VOICE_CHANNEL_ID &&
    beforeId !== ONBOARDING_VOICE_CHANNEL_ID &&
    isRecruitMember(member)
  ) {
    const ch = newState.channel;
    const others = ch
      ? [...ch.members.values()].filter((m) => m.user && !m.user.bot && m.id !== member.id)
      : [];
    if (!others.length) {
      await postOnboardingRecruitAlert(member);
    }
  }

  // Recruit joined Waiting for Game
  if (
    afterId === VOICE_CHANNEL_ID &&
    beforeId !== VOICE_CHANNEL_ID &&
    isRecruitMember(member)
  ) {
    console.log(`[LFT] Recruit joined Waiting for Game: ${member.user?.tag || member.id}`);
    await postRecruitAlert(member);
    scheduleRecruit(`${member.user?.tag || member.id} joined Waiting for Game`);
  }

  // Left waiting — pause recruit timer if empty
  if (beforeId === VOICE_CHANNEL_ID && afterId !== VOICE_CHANNEL_ID) {
    const still = await getWaitingRecruitsAsync();
    if (!still.length) {
      if (recruitTimer) clearTimeout(recruitTimer);
      recruitTimer = null;
      nextRecruitAt = 0;
      console.log('[LFT] Last recruit left Waiting for Game — timer paused');
    }
  }
}

async function handleLftCommand(interaction) {
  if (!interaction.isChatInputCommand()) return false;
  const name = interaction.commandName;

    if (name === 'lfttest' || name === 'test') {
    let vcStatus = 'not found';
    let textStatus = 'not found';
    try {
      const vc = await clientRef.channels.fetch(VOICE_CHANNEL_ID);
      vcStatus = vc ? (vc.name + ' (`' + VOICE_CHANNEL_ID + '`)') : 'null';
    } catch (e) {
      vcStatus = 'error: ' + e.message + ' (`' + VOICE_CHANNEL_ID + '`)';
    }
    try {
      const tc = await clientRef.channels.fetch(TEXT_CHANNEL_ID);
      textStatus = tc ? (tc.name + ' (`' + TEXT_CHANNEL_ID + '`)') : 'null';
    } catch (e) {
      textStatus = 'error: ' + e.message + ' (`' + TEXT_CHANNEL_ID + '`)';
    }

    const lfgList = listImages(IMAGE_FOLDER);
    const rctList = listImages(RECRUIT_IMAGE_FOLDER);
    const lfgSample = lfgList.slice(0, 3).map((p) => path.basename(p)).join(', ') || 'none';
    const rctSample = rctList.slice(0, 3).map((p) => path.basename(p)).join(', ') || 'none';

    await interaction.reply({
      content:
        '✅ Looking for Troopers module online.\n' +
        '**Waiting VC:** ' + vcStatus + '\n' +
        '**LFG text:** ' + textStatus + '\n' +
        '**LFG role ID:** `' + ROLE_ID + '`\n' +
        '**Recruit role ID:** `' + RECRUIT_ROLE_ID + '`\n' +
        '**LFG folder:** `' + IMAGE_FOLDER + '`\n' +
        '**LFG images:** ' + lfgList.length + ' (' + lfgSample + ')\n' +
        '**Recruit folder:** `' + RECRUIT_IMAGE_FOLDER + '`\n' +
        '**Recruit images:** ' + rctList.length + ' (' + rctSample + ')',
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

if (name === 'count') {
    const members = await getWaitingMembers();
    const recruits = members.filter(isRecruitMember);
    await interaction.reply({
      content:
        `Currently **${members.length}** trooper(s) in <#${VOICE_CHANNEL_ID}>\n` +
        `Recruits among them: **${recruits.length}**`,
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (name === 'check') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Administrator only.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await runWaitingCheck();
    scheduleLfg('admin used /check');
    await interaction.editReply({
      content: result.posted
        ? `✅ LFG posted for **${result.count}** trooper(s). Timer reset.`
        : `Waiting for Game is empty — nothing posted. Timer reset.`
    });
    return true;
  }

  // Force normal Looking for Troopers post (even if channel empty — posts as 1 for test)
  if (name === 'lftpost') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const members = await getWaitingMembers();
      const count = members.length > 0 ? members.length : 1;
      await postWaitingMessage(count);
      scheduleLfg('admin used /lftpost');
      await interaction.editReply({
        content:
          `✅ **LFT post sent** to <#${TEXT_CHANNEL_ID}>\n` +
          `Counted as **${count}** trooper(s)` +
          (members.length === 0 ? ' _(channel empty — used 1 for test)_' : '')
      });
    } catch (e) {
      console.error('[LFT] /lftpost failed:', e);
      await interaction.editReply({ content: `❌ Failed: ${e.message}` });
    }
    return true;
  }

  // Force recruit alert post
  if (name === 'rctpost') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      let target = interaction.options.getUser('user') || interaction.user;
      let member = null;
      try {
        member = await interaction.guild.members.fetch(target.id);
      } catch {
        member = interaction.member;
      }
      await postRecruitAlert(member);
      scheduleRecruit('admin used /rctpost');
      await interaction.editReply({
        content: `✅ **Recruit alert sent** to <#${TEXT_CHANNEL_ID}> for ${member}`
      });
    } catch (e) {
      console.error('[LFT] /rctpost failed:', e);
      await interaction.editReply({ content: `❌ Failed: ${e.message}` });
    }
    return true;
  }

  return false;
}

function lftCommandBuilders() {
  return [
    new SlashCommandBuilder().setName('count').setDescription('Show how many people are waiting for a game'),
    new SlashCommandBuilder().setName('check').setDescription('Force an immediate Looking for Troopers check (Admin)'),
    new SlashCommandBuilder().setName('lfttest').setDescription('Test Looking for Troopers module'),
    new SlashCommandBuilder()
      .setName('lftpost')
      .setDescription('Force post a Looking for Troopers message (test)'),
    new SlashCommandBuilder()
      .setName('rctpost')
      .setDescription('Force post a Recruit Alert (test)')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('User to mention as the recruit (default: you)').setRequired(false)
      )
  ];
}

function startLft(client) {
  clientRef = client;
  if (!config.GUILD_ID) {
    console.warn('[LFT] No config — module not started');
    return;
  }

  console.log('[LFT] Looking for Troopers module starting…');
  console.log(`[LFT] Waiting VC: ${VOICE_CHANNEL_ID}`);
  console.log(`[LFT] Text channel: ${TEXT_CHANNEL_ID}`);
  console.log(`[LFT] LFG images: ${listImages(IMAGE_FOLDER).length}`);
  console.log(`[LFT] Recruit images: ${listImages(RECRUIT_IMAGE_FOLDER).length}`);

  scheduleLfg('startup');

  const already = getWaitingRecruits();
  if (already.length) {
    scheduleRecruit('recruits already waiting at startup');
  }

  client.on(Events.MessageCreate, (message) => {
    try {
      handleLftMessage(message);
    } catch (e) {
      console.error('[LFT] message handler error:', e);
    }
  });

  console.log('[LFT] Schedulers running');
}

module.exports = {
  startLft,
  handleLftCommand,
  handleLftVoiceState,
  lftCommandBuilders
};
