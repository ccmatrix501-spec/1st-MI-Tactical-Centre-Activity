(async function () {
  "use strict";

  const CLIENT_ID = "1532302380237066271";
  const isDiscord =
    window.location.hostname.includes("discordsays.com") ||
    window.location.search.includes("frame_id") ||
    window.location.search.includes("instance_id");

  window.miDiscordReady = Promise.resolve(null);

  if (!isDiscord) {
    window.miDiscordActivity = false;
    return;
  }

  window.miDiscordActivity = true;

  const readyPromise = (async function () {
    try {
      const { DiscordSDK } = await import("https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@2/+esm");
      const discordSdk = new DiscordSDK(CLIENT_ID);
      window.miDiscordSdk = discordSdk;

      await discordSdk.ready();

      const { code } = await discordSdk.commands.authorize({
        client_id: CLIENT_ID,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify", "guilds", "guilds.members.read"]
      });

      const tokenRes = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        throw new Error("Token exchange failed: " + text);
      }

      const { access_token } = await tokenRes.json();
      if (!access_token) throw new Error("No Discord access token returned.");

      const auth = await discordSdk.commands.authenticate({ access_token });
      if (!auth) throw new Error("Discord authenticate command failed.");

      // AuthenticateResponse already contains access_token. Keep it only in memory.
      window.miDiscordAuth = auth;
      window.miDiscordGuildId = discordSdk.guildId || null;
      window.miDiscordChannelId = discordSdk.channelId || null;

      window.dispatchEvent(new CustomEvent("mi-discord-ready", { detail: auth }));
      return auth;
    } catch (err) {
      console.error("[1st MI] Discord setup failed:", err);
      window.miDiscordError = err instanceof Error ? err.message : String(err);
      window.dispatchEvent(new CustomEvent("mi-discord-error", { detail: window.miDiscordError }));
      return null;
    }
  })();

  window.miDiscordReady = readyPromise;
})();
