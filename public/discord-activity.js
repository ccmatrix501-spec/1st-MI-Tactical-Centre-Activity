/**
 * Discord Activity bootstrap for 1st M.I. Tactical Centre
 * Client ID: 1532302380237066271
 */

(async function () {
  const isDiscord =
    window.location.hostname.includes("discordsays.com") ||
    window.location.search.includes("frame_id") ||
    !!window.DiscordSDK;

  if (!isDiscord) {
    console.log("[1st MI] Running outside Discord – skipping Activity setup");
    return;
  }

  console.log("[1st MI] Detected Discord Activity environment");

  try {
    const { DiscordSDK } = await import("https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@2/+esm");

    const CLIENT_ID = "1532302380237066271";

    const discordSdk = new DiscordSDK(CLIENT_ID);

    await discordSdk.ready();
    console.log("[1st MI] Discord SDK ready");

    const { code } = await discordSdk.commands.authorize({
      client_id: CLIENT_ID,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify", "guilds"],
    });

    const tokenRes = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.error || "Token exchange failed");
    }

    const { access_token } = await tokenRes.json();

    const auth = await discordSdk.commands.authenticate({ access_token });

    if (!auth) {
      throw new Error("Authenticate command returned null");
    }

    console.log("[1st MI] Authenticated as:", auth.user?.username || "unknown");

    window.miDiscordSdk = discordSdk;
    window.miDiscordAuth = auth;

    window.dispatchEvent(
      new CustomEvent("mi-discord-ready", {
        detail: { sdk: discordSdk, auth },
      })
    );
  } catch (err) {
    console.error("[1st MI] Discord Activity setup failed:", err);
  }
})();
