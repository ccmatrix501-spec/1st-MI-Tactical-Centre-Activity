const ACTIVITY_BUILD = "desktop-web-sync";
const API_BASE = "https://1st-mi-matrix-r-d-production.up.railway.app";
const REQUIRED_GUILD_ID = "1256977709884641382";
const MAIN_APP_SRC = String(window.__TACTICAL_MAIN_BUNDLE__ || "./assets/app.js");
const SDK_MODULE =
  "https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@2.5.0/+esm";

let mainAppLoaded = false;

function getParam(name) {
  try {
    const direct = new URLSearchParams(window.location.search).get(name);
    if (direct) return direct;
  } catch (_) {}

  try {
    const hash = String(window.location.hash || "");
    const queryIndex = hash.indexOf("?");
    if (queryIndex >= 0) {
      const value = new URLSearchParams(hash.slice(queryIndex + 1)).get(name);
      if (value) return value;
    }
  } catch (_) {}

  return null;
}

function looksLikeDiscordActivity() {
  const hostname = String(window.location.hostname || "").toLowerCase();
  const referrer = String(document.referrer || "").toLowerCase();

  return Boolean(
    getParam("instance_id") ||
    getParam("frame_id") ||
    getParam("channel_id") ||
    getParam("guild_id") ||
    hostname.endsWith(".discordsays.com") ||
    hostname === "discordsays.com" ||
    referrer.includes("discord.com") ||
    referrer.includes("discordapp.com") ||
    window.parent !== window
  );
}

async function loadMainApp() {
  if (mainAppLoaded) return;
  mainAppLoaded = true;

  try {
    if (window.__TACTICAL_CONTENT_BOOTSTRAP__) {
      await window.__TACTICAL_CONTENT_BOOTSTRAP__;
    }
  } catch (error) {
    console.warn(
      "[TACTICAL CONTENT] Continuing after bootstrap sync failure:",
      error
    );
  }

  const script = document.createElement("script");
  script.type = "module";
  script.crossOrigin = "anonymous";
  script.src = MAIN_APP_SRC;
  script.onerror = () => {
    showDenied(
      "The Tactical Centre could not load.",
      "Reload the Activity and try again."
    );
  };

  document.body.appendChild(script);
}

function ensureGate() {
  let gate = document.getElementById("discord-access-gate");
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
    'Verifying Discord access…</h1>' +
    '<p id="discord-access-message" style="margin:0;color:#aab4ba;line-height:1.55">' +
    'Checking server and member access.</p>' +
    '<button id="discord-access-retry" type="button" style="display:none;margin:20px auto 0;' +
    'padding:10px 18px;border:1px solid #20ff00;border-radius:7px;background:#11171b;' +
    'color:#20ff00;font-weight:800;cursor:pointer">Retry</button>' +
    '<div style="margin-top:18px;color:#67747b;font-size:11px">Activity build ' +
    ACTIVITY_BUILD +
    "</div></div>";

  document.body.appendChild(gate);

  const retry = document.getElementById("discord-access-retry");
  if (retry) {
    retry.addEventListener("click", () => window.location.reload());
  }

  return gate;
}

function setGateStatus(title, message) {
  ensureGate();

  const titleEl = document.getElementById("discord-access-title");
  const messageEl = document.getElementById("discord-access-message");
  const retry = document.getElementById("discord-access-retry");

  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  if (retry) retry.style.display = "none";
}

function showDenied(title, message) {
  setGateStatus(title, message);

  const retry = document.getElementById("discord-access-retry");
  if (retry) retry.style.display = "inline-block";
}

function removeGate() {
  document.getElementById("discord-access-gate")?.remove();
}

async function fetchJson(url, options = {}) {
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

function randomBase64Url(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function makePkce() {
  const verifier = randomBase64Url(48);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );

  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  const challenge = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return { verifier, challenge };
}

function installDiscordAccessShim(access) {
  const status = {
    activated: true,
    valid: true,
    provider: "discord-activity",
    isAdmin: Boolean(access?.isAdmin),
    discordUserId: String(access?.userId || ""),
    guildId: String(access?.guildId || REQUIRED_GUILD_ID)
  };

  window.miDiscordAccess = {
    ...access,
    ...status
  };

  window.steLicense = {
    getStatus: async () => ({ success: true, ...status }),
    activate: async () => ({ success: true, ...status }),
    getCurrentUserKey: async () => ({
      success: true,
      key: "Discord role access",
      expiresAt: null,
      provider: "discord-activity"
    })
  };

  window.dispatchEvent(
    new CustomEvent("mi-discord-access-ready", {
      detail: window.miDiscordAccess
    })
  );
}

async function authenticateActivity() {
  ensureGate();
  setGateStatus(
    "Verifying Discord access…",
    "Connecting to Discord and checking the launch server."
  );

  const config = await fetchJson(
    API_BASE + "/tactical-centre/activity/config"
  );

  if (!config?.clientId) {
    throw new Error("The Discord Activity application ID is not configured.");
  }

  const { DiscordSDK } = await import(SDK_MODULE);
  const discordSdk = new DiscordSDK(String(config.clientId));

  window.miDiscordSdk = discordSdk;

  await discordSdk.ready();

  const guildId = String(discordSdk.guildId || "");

  window.miDiscordActivity = true;
  window.miDiscordActivityBuild = ACTIVITY_BUILD;
  window.miDiscordGuildId = guildId || null;
  window.miDiscordChannelId = discordSdk.channelId || null;
  window.miDiscordInstanceId = discordSdk.instanceId || null;

  if (guildId !== REQUIRED_GUILD_ID) {
    showDenied(
      "Access denied",
      "The Tactical Centre Activity can only be opened from the 1st Mobile Infantry Discord server."
    );

    return {
      activity: true,
      allowed: false,
      guildId: guildId || null,
      reason: "wrong-guild"
    };
  }

  setGateStatus(
    "Verifying Discord member…",
    "Confirming your Discord account and 1st M.I. server membership."
  );

  const { verifier, challenge } = await makePkce();

  const authorization = await discordSdk.commands.authorize({
    client_id: String(config.clientId),
    response_type: "code",
    state: randomBase64Url(24),
    prompt: "none",
    scope: ["identify", "applications.commands"],
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

  // Keep the token in memory only for authenticated Activity API calls.
  // It is never written to localStorage/sessionStorage.
  window.miDiscordAccessToken = accessToken;

  const auth = await discordSdk.commands.authenticate({
    access_token: accessToken
  });

  if (!auth?.user?.id) {
    throw new Error("Discord Activity authentication failed.");
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
    showDenied(
      "Access denied",
      access?.error ||
        "You do not have access to the 1st M.I. Tactical Centre Activity."
    );

    return {
      activity: true,
      allowed: false,
      guildId,
      userId: auth.user.id,
      reason: "server-access-denied"
    };
  }

  installDiscordAccessShim({
    ...access,
    authenticatedUser: {
      id: String(auth.user.id),
      username: String(
        auth.user.global_name ||
        auth.user.username ||
        access.username ||
        ""
      )
    }
  });

  setGateStatus(
    access.isAdmin ? "Admin access verified" : "Access verified",
    access.isAdmin
      ? "Opening the Tactical Centre with administrator access."
      : "Opening the Tactical Centre."
  );

  await new Promise((resolve) => setTimeout(resolve, 250));

  removeGate();
  loadMainApp();

  return {
    activity: true,
    allowed: true,
    isAdmin: Boolean(access.isAdmin),
    userId: String(auth.user.id),
    guildId
  };
}

const isActivity = looksLikeDiscordActivity();

if (!isActivity) {
  window.miDiscordActivity = false;
  window.miDiscordActivityBuild = ACTIVITY_BUILD;
  window.miDiscordReady = Promise.resolve({
    activity: false,
    allowed: true
  });

  loadMainApp();
} else {
  document.documentElement.classList.add("discord-activity");

  window.miDiscordReady = authenticateActivity().catch((error) => {
    console.error("[TACTICAL ACTIVITY]", error);

    showDenied(
      "Discord access could not be verified",
      error?.message ||
        "The Tactical Centre could not verify your Discord Activity access."
    );

    return {
      activity: true,
      allowed: false,
      error: error?.message || String(error)
    };
  });
}
