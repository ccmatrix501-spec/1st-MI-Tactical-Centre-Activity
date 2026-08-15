(function () {
  "use strict";

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

    try {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = String(window.location.href || "").match(new RegExp("(?:[?&#])" + escaped + "=([^&#]+)", "i"));
      if (match && match[1]) return decodeURIComponent(match[1]);
    } catch (_) {}

    return null;
  }

  const instanceId = getParam("instance_id");
  const frameId = getParam("frame_id");
  const hostname = String(window.location.hostname || "").toLowerCase();
  const referrer = String(document.referrer || "").toLowerCase();
  const inFrame = window.parent !== window;

  const isDiscord = Boolean(
    instanceId ||
    frameId ||
    hostname.endsWith(".discordsays.com") ||
    hostname === "discordsays.com" ||
    referrer.includes("discord.com") ||
    referrer.includes("discordapp.com") ||
    inFrame
  );

  window.miDiscordActivity = isDiscord;
  window.miDiscordInstanceId = instanceId || null;
  window.miDiscordFrameId = frameId || null;
  window.miDiscordReady = Promise.resolve({
    activity: isDiscord,
    instance_id: instanceId || null,
    frame_id: frameId || null
  });

  if (isDiscord) {
    window.dispatchEvent(new CustomEvent("mi-discord-ready", {
      detail: {
        instance_id: instanceId || null,
        frame_id: frameId || null
      }
    }));
  }
})();
