import { DiscordSDK } from "@discord/embedded-app-sdk";

const ACTIVITY_BUILD = "1.6.4-vite-native";
const API_BASE = "/api";
const REQUIRED_GUILD_ID = "1256977709884641382";

type ActivityResult = {
  activity: boolean;
  allowed: boolean;
  guildId?: string | null;
  channelId?: string | null;
  instanceId?: string | null;
  isAdmin?: boolean;
  userId?: string;
  error?: string;
  reason?: string;
};

type AccessPayload = {
  allowed?: boolean;
  isAdmin?: boolean;
  userId?: string;
  discordUserId?: string;
  guildId?: string;
  username?: string;
  error?: string;
  [key: string]: unknown;
};

const w = window as any;

function getParam(name: string): string | null {
  try {
    const value = new URLSearchParams(window.location.search).get(name);
    if (value) return value;
  } catch {}

  try {
    const hash = String(window.location.hash || "");
    const queryIndex = hash.indexOf("?");

    if (queryIndex >= 0) {
      const value = new URLSearchParams(hash.slice(queryIndex + 1)).get(name);
      if (value) return value;
    }
  } catch {}

  return null;
}

function looksLikeDiscordActivity(): boolean {
  const hostname = String(window.location.hostname || "").toLowerCase();
  const referrer = String(document.referrer || "").toLowerCase();

  return Boolean(
    getParam("instance_id") ||
      getParam("frame_id") ||
      getParam("channel_id") ||
      getParam("guild_id") ||
      hostname === "discordsays.com" ||
      hostname.endsWith(".discordsays.com") ||
      referrer.includes("discord.com") ||
      referrer.includes("discordapp.com") ||
      window.parent !== window
  );
}

function ensureGate(): HTMLDivElement {
  let gate = document.getElementById("discord-access-gate") as HTMLDivElement | null;

  if (gate) return gate;

  gate = document.createElement("div");
  gate.id = "discord-access-gate";
  gate.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:24px",
    "background:#050607",
    "color:#fff",
    "font-family:system-ui,-apple-system,Segoe UI,sans-serif"
  ].join(";");

  gate.innerHTML =
    '<div style="width:min(560px,100%);padding:28px;border:1px solid #263238;' +
    'border-radius:14px;background:#0b1013;box-shadow:0 20px 70px rgba(0,0,0,.55);' +
    'text-align:center">' +
    '<div style="font-size:12px;letter-spacing:2px;color:#20ff00;font-weight:800;' +
    'margin-bottom:12px">1ST M.I. TACTICAL CENTRE</div>' +
    '<h1 id="discord-access-title" style="font-size:24px;margin:0 0 10px">' +
    'Opening Tactical Centre…</h1>' +
    '<p id="discord-access-message" style="margin:0;color:#aab4ba;line-height:1.55">' +
    'Checking the Discord Activity launch context.</p>' +
    '<button id="discord-access-retry" type="button" style="display:none;margin:20px auto 0;' +
    'padding:10px 18px;border:1px solid #20ff00;border-radius:7px;background:#11171b;' +
    'color:#20ff00;font-weight:800;cursor:pointer">Retry</button>' +
    '<div style="margin-top:18px;color:#67747b;font-size:11px">Activity build ' +
    ACTIVITY_BUILD +
    "</div></div>";

  document.body.appendChild(gate);

  document
    .getElementById("discord-access-retry")
    ?.addEventListener("click", () => window.location.reload());

  return gate;
}

function setGate(title: string, message: string, retry = false): void {
  ensureGate();

  const titleEl = document.getElementById("discord-access-title");
  const messageEl = document.getElementById("discord-access-message");
  const retryEl = document.getElementById("discord-access-retry") as HTMLButtonElement | null;

  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  if (retryEl) retryEl.style.display = retry ? "inline-block" : "none";
}

function removeGate(): void {
  document.getElementById("discord-access-gate")?.remove();
}

async function fetchJson(url: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(url, {
    cache: "no-store",
    ...options
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.error ||
        payload?.message ||
        `Request failed with HTTP ${response.status}`
    );
  }

  return payload;
}

function installAccessShim(access: AccessPayload): void {
  const state = {
    ...access,
    allowed: true,
    activated: true,
    valid: true,
    provider: "discord-activity",
    isAdmin: Boolean(access?.isAdmin),
    userId: String(access?.userId || access?.discordUserId || ""),
    discordUserId: String(access?.discordUserId || access?.userId || ""),
    guildId: String(access?.guildId || REQUIRED_GUILD_ID)
  };

  w.miDiscordAccess = state;

  w.steLicense = {
    getStatus: async () => ({
      success: true,
      activated: true,
      valid: true,
      provider: "discord-activity",
      isAdmin: Boolean(w.miDiscordAccess?.isAdmin),
      discordUserId: String(w.miDiscordAccess?.discordUserId || ""),
      guildId: String(w.miDiscordAccess?.guildId || REQUIRED_GUILD_ID)
    }),

    activate: async () => ({
      success: true,
      activated: true,
      valid: true,
      provider: "discord-activity",
      isAdmin: Boolean(w.miDiscordAccess?.isAdmin),
      discordUserId: String(w.miDiscordAccess?.discordUserId || ""),
      guildId: String(w.miDiscordAccess?.guildId || REQUIRED_GUILD_ID)
    }),

    getCurrentUserKey: async () => ({
      success: true,
      key: "Discord server access",
      expiresAt: null,
      provider: "discord-activity"
    })
  };

  window.dispatchEvent(
    new CustomEvent("mi-discord-access-ready", {
      detail: state
    })
  );
}

function randomBase64Url(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function makePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomBase64Url(48);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );

  let binary = "";
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }

  const challenge = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return { verifier, challenge };
}

async function requestIdentity(
  discordSdk: DiscordSDK,
  clientId: string,
  guildId: string
): Promise<ActivityResult> {
  const { verifier, challenge } = await makePkce();

  // Deliberately identify-only and NEVER part of normal startup.
  // No applications.commands scope means normal members are not asked
  // to install/create commands when launching the Activity.
  const authorization = await (discordSdk.commands as any).authorize({
    client_id: clientId,
    response_type: "code",
    state: randomBase64Url(24),
    prompt: "none",
    scope: ["identify"],
    code_challenge: challenge,
    code_challenge_method: "S256"
  });

  if (!authorization?.code) {
    throw new Error("Discord did not return an authorization code.");
  }

  const token = await fetchJson(
    API_BASE + "/tactical-centre/activity/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        code: authorization.code,
        codeVerifier: verifier
      })
    }
  );

  const accessToken = String(token?.access_token || "");

  if (!accessToken) {
    throw new Error("Discord Activity authentication did not return a token.");
  }

  const auth = await (discordSdk.commands as any).authenticate({
    access_token: accessToken
  });

  if (!auth?.user?.id) {
    throw new Error("Discord Activity identity verification failed.");
  }

  const access = await fetchJson(
    API_BASE + "/tactical-centre/activity/access",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + accessToken
      },
      body: JSON.stringify({
        guildId
      })
    }
  );

  if (!access?.allowed) {
    throw new Error(
      access?.error ||
        "Your Discord account does not have Tactical Centre access."
    );
  }

  w.miDiscordAccessToken = accessToken;

  installAccessShim({
    ...access,
    userId: String(auth.user.id),
    discordUserId: String(auth.user.id),
    guildId
  });

  return {
    activity: true,
    allowed: true,
    isAdmin: Boolean(access.isAdmin),
    userId: String(auth.user.id),
    guildId
  };
}

export async function initDiscordActivity(): Promise<ActivityResult> {
  w.miDiscordActivityBuild = ACTIVITY_BUILD;

  if (!looksLikeDiscordActivity()) {
    w.miDiscordActivity = false;

    setGate(
      "Open through Discord",
      "This build is the Discord Activity version of the Tactical Centre. Launch it from the 1st Mobile Infantry Discord server.",
      false
    );

    return {
      activity: false,
      allowed: false,
      reason: "not-discord-activity"
    };
  }

  w.miDiscordActivity = true;

  setGate(
    "Opening Tactical Centre…",
    "Checking that this Activity was launched from the 1st M.I. Discord server."
  );

  const config = await fetchJson(
    API_BASE + "/tactical-centre/activity/config"
  );

  const clientId = String(config?.clientId || "");

  if (!clientId) {
    throw new Error("The Discord Activity application ID is not configured.");
  }

  const discordSdk = new DiscordSDK(clientId);

  w.miDiscordSdk = discordSdk;

  await discordSdk.ready();

  const guildId = String((discordSdk as any).guildId || "");
  const channelId = String((discordSdk as any).channelId || "");
  const instanceId = String((discordSdk as any).instanceId || "");

  w.miDiscordGuildId = guildId || null;
  w.miDiscordChannelId = channelId || null;
  w.miDiscordInstanceId = instanceId || null;

  if (guildId !== REQUIRED_GUILD_ID) {
    setGate(
      "Access denied",
      "The Tactical Centre Activity can only be opened from the 1st Mobile Infantry Discord server.",
      false
    );

    return {
      activity: true,
      allowed: false,
      guildId: guildId || null,
      channelId: channelId || null,
      instanceId: instanceId || null,
      reason: "wrong-guild"
    };
  }

  // Normal launch uses Discord's Activity guild context only.
  // There is intentionally NO OAuth authorize() call here.
  installAccessShim({
    allowed: true,
    isAdmin: false,
    guildId,
    provider: "discord-activity-guild"
  });

  // Identity/admin verification remains available as an explicit, deferred
  // operation for admin-only features. It is never called automatically.
  w.miDiscordRequestIdentity = () =>
    requestIdentity(discordSdk, clientId, guildId);

  w.miDiscordRequestAdminAccess = async () => {
    const result = await requestIdentity(discordSdk, clientId, guildId);

    if (!result.isAdmin) {
      throw new Error(
        "Your Discord account does not have Tactical Centre administrator access."
      );
    }

    return w.miDiscordAccess;
  };

  w.miDiscordReady = Promise.resolve({
    activity: true,
    allowed: true,
    guildId,
    channelId,
    instanceId
  });

  setGate(
    "Server access verified",
    "Opening the Tactical Centre."
  );

  await new Promise((resolve) => setTimeout(resolve, 80));
  removeGate();

  return {
    activity: true,
    allowed: true,
    isAdmin: false,
    guildId,
    channelId,
    instanceId
  };
}

export function showActivityBootError(error: unknown): void {
  console.error("[TACTICAL ACTIVITY]", error);

  const message =
    error instanceof Error
      ? error.message
      : "The Tactical Centre could not start.";

  setGate(
    "The Tactical Centre could not load.",
    message || "Reload the Activity and try again.",
    true
  );
}
