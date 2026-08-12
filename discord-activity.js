(async function () {
  const CLIENT_ID = "1532302380237066271";
  const isDiscord =
    window.location.hostname.includes("discordsays.com") ||
    window.location.search.includes("frame_id") ||
    window.location.search.includes("instance_id");
  if (!isDiscord) return;
  try {
    const { DiscordSDK } = await import("https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@2/+esm");
    const discordSdk = new DiscordSDK(CLIENT_ID);
    await discordSdk.ready();
    const { code } = await discordSdk.commands.authorize({
      client_id: CLIENT_ID, response_type: "code", state: "", prompt: "none",
      scope: ["identify", "guilds"],
    });
    const tokenRes = await fetch("/api/token", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!tokenRes.ok) throw new Error("Token exchange failed");
    const { access_token } = await tokenRes.json();
    window.miDiscordAuth = await discordSdk.commands.authenticate({ access_token });
    window.miDiscordSdk = discordSdk;
  } catch (err) {
    console.error("[1st MI] Discord setup failed:", err);
  }
})();
