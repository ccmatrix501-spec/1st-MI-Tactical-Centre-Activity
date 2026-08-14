(function () {
  "use strict";

  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  const originalAlert = window.alert.bind(window);
  const blobByUrl = new Map();
  let suppressNextDownloadAlert = false;
  let modalOpen = false;

  URL.createObjectURL = function (blob) {
    const url = originalCreateObjectURL(blob);
    if (blob instanceof Blob) blobByUrl.set(url, blob);
    return url;
  };

  URL.revokeObjectURL = function (url) {
    // Keep the Blob object in memory long enough for our export picker.
    originalRevokeObjectURL(url);
    window.setTimeout(function () { blobByUrl.delete(url); }, 120000);
  };

  window.alert = function (message) {
    const text = String(message == null ? "" : message);
    if (suppressNextDownloadAlert && /^(Save downloaded:|Folder save failed\. Download fallback started:)/i.test(text)) {
      suppressNextDownloadAlert = false;
      return;
    }
    return originalAlert(message);
  };

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (key === "class") node.className = value;
        else if (key === "style") Object.assign(node.style, value);
        else if (key === "disabled") node.disabled = !!value;
        else node.setAttribute(key, String(value));
      }
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function safeDownload(filename, blob) {
    const url = originalCreateObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    nativeAnchorClick.call(link);
    link.remove();
    window.setTimeout(function () { originalRevokeObjectURL(url); }, 1000);
  }

  function closeModal(root) {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    modalOpen = false;
  }

  function getDiscordContext() {
    const auth = window.miDiscordAuth;
    const sdk = window.miDiscordSdk;
    const token = auth && auth.access_token;
    const guildId = (sdk && sdk.guildId) || window.miDiscordGuildId;
    return { auth, sdk, token, guildId };
  }

  async function waitForDiscord() {
    try {
      // discord-activity.js is loaded after the main document, so give it a moment
      // to create the authentication promise if Export is clicked immediately.
      for (let i = 0; i < 50 && !window.miDiscordReady; i += 1) {
        await new Promise(function (resolve) { window.setTimeout(resolve, 100); });
      }
      if (window.miDiscordReady && typeof window.miDiscordReady.then === "function") {
        await Promise.race([
          window.miDiscordReady,
          new Promise(function (resolve) { window.setTimeout(resolve, 5000); })
        ]);
      }
    } catch (_) {}
    return getDiscordContext();
  }

  async function openExportPicker(filename, blob) {
    if (modalOpen) return;
    modalOpen = true;

    let payload = null;
    try {
      payload = JSON.parse(await blob.text());
    } catch (err) {
      modalOpen = false;
      originalAlert("Could not read this JSON export. The normal download will be used instead.");
      safeDownload(filename, blob);
      return;
    }

    const overlay = el("div", { style: {
      position: "fixed", inset: "0", zIndex: "2147483647", background: "rgba(0,0,0,.78)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
      fontFamily: "Arial, Helvetica, sans-serif", color: "#fff"
    }});

    const card = el("div", { style: {
      width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto", background: "#090b0d",
      border: "2px solid #1eff00", borderRadius: "12px", padding: "20px",
      boxShadow: "0 18px 70px rgba(0,0,0,.7)"
    }});
    overlay.appendChild(card);

    const titleRow = el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" } });
    titleRow.appendChild(el("h2", { style: { margin: "0", color: "#1eff00", fontSize: "21px" } }, "Export Save"));
    const closeBtn = el("button", { type: "button", style: {
      border: "1px solid #555", background: "#16191c", color: "#fff", borderRadius: "6px",
      width: "36px", height: "36px", cursor: "pointer", fontSize: "22px"
    }}, "×");
    closeBtn.addEventListener("click", function () { closeModal(overlay); });
    titleRow.appendChild(closeBtn);
    card.appendChild(titleRow);

    card.appendChild(el("p", { style: { margin: "8px 0 16px", color: "#aeb6bf", overflowWrap: "anywhere" } }, filename));

    const downloadBtn = el("button", { type: "button", style: {
      width: "100%", padding: "12px", border: "1px solid #4a4f55", borderRadius: "7px",
      background: "#171a1e", color: "#fff", fontWeight: "700", cursor: "pointer", marginBottom: "14px"
    }}, "Download .JSON to Device");
    downloadBtn.addEventListener("click", function () {
      safeDownload(filename, blob);
      closeModal(overlay);
    });
    card.appendChild(downloadBtn);

    const divider = el("div", { style: { borderTop: "1px solid #2e3338", margin: "4px 0 16px" } });
    card.appendChild(divider);
    card.appendChild(el("h3", { style: { margin: "0 0 6px", fontSize: "16px" } }, "Send to Discord"));

    const status = el("div", { style: { fontSize: "13px", color: "#aeb6bf", marginBottom: "12px" } }, "Checking Discord Activity authentication…");
    card.appendChild(status);

    const channelLabel = el("label", { style: { display: "block", marginBottom: "12px", fontSize: "13px", fontWeight: "700" } }, "Channel");
    const channelSelect = el("select", { style: {
      width: "100%", marginTop: "6px", padding: "10px", background: "#111418", color: "#fff",
      border: "1px solid #3b424a", borderRadius: "6px"
    }, disabled: true });
    channelLabel.appendChild(channelSelect);
    card.appendChild(channelLabel);

    const threadLabel = el("label", { style: { display: "block", marginBottom: "12px", fontSize: "13px", fontWeight: "700" } }, "Thread (optional)");
    const threadSelect = el("select", { style: {
      width: "100%", marginTop: "6px", padding: "10px", background: "#111418", color: "#fff",
      border: "1px solid #3b424a", borderRadius: "6px"
    }, disabled: true });
    threadLabel.appendChild(threadSelect);
    card.appendChild(threadLabel);

    const sendBtn = el("button", { type: "button", disabled: true, style: {
      width: "100%", padding: "12px", border: "0", borderRadius: "7px", background: "#1eff00",
      color: "#020302", fontWeight: "800", cursor: "pointer"
    }}, "Send JSON to Discord");
    card.appendChild(sendBtn);

    const hint = el("div", { style: { marginTop: "10px", color: "#7f8993", fontSize: "12px", lineHeight: "1.45" } },
      "Only channels you can access are listed. Forum channels require an active thread. Private/archived threads are not listed.");
    card.appendChild(hint);

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeModal(overlay);
    });
    document.body.appendChild(overlay);

    const ctx = await waitForDiscord();
    if (!ctx.token || !ctx.guildId) {
      status.textContent = window.miDiscordActivity
        ? "Discord authentication is not ready. Close and reopen the Activity, then try again."
        : "Send to Discord is available when the Tactical Centre is launched as a Discord Activity.";
      status.style.color = "#ffb454";
      return;
    }

    status.textContent = "Loading server channels and active threads…";

    try {
      const response = await fetch(`/api/discord-destinations?guild_id=${encodeURIComponent(ctx.guildId)}`, {
        headers: { Authorization: `Bearer ${ctx.token}` }
      });
      const result = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(result.error || "Could not load Discord destinations.");

      const channels = Array.isArray(result.channels) ? result.channels : [];
      const threads = Array.isArray(result.threads) ? result.threads : [];

      channelSelect.innerHTML = "";
      channelSelect.appendChild(el("option", { value: "" }, "Select a channel…"));
      for (const channel of channels) {
        const prefix = channel.type === 15 ? "Forum: " : "# ";
        channelSelect.appendChild(el("option", { value: channel.id }, prefix + channel.name));
      }
      channelSelect.disabled = channels.length === 0;

      function refreshThreads() {
        const selected = channels.find(function (c) { return c.id === channelSelect.value; });
        const matching = threads.filter(function (t) { return t.parent_id === channelSelect.value; });
        threadSelect.innerHTML = "";

        if (!selected) {
          threadSelect.appendChild(el("option", { value: "" }, "Select a channel first"));
          threadSelect.disabled = true;
          sendBtn.disabled = true;
          return;
        }

        if (selected.type !== 15 && selected.can_send) {
          threadSelect.appendChild(el("option", { value: "" }, "No Thread — post directly to channel"));
        } else {
          threadSelect.appendChild(el("option", { value: "" }, matching.length ? "Select a thread…" : "No active threads available"));
        }

        for (const thread of matching) {
          threadSelect.appendChild(el("option", { value: thread.id }, thread.name));
        }

        threadSelect.disabled = matching.length === 0 && selected.type === 15;
        sendBtn.disabled = selected.type === 15 ? !threadSelect.value : false;
      }

      channelSelect.addEventListener("change", refreshThreads);
      threadSelect.addEventListener("change", function () {
        const selected = channels.find(function (c) { return c.id === channelSelect.value; });
        sendBtn.disabled = !selected || (selected.type === 15 && !threadSelect.value);
      });

      sendBtn.addEventListener("click", async function () {
        const selected = channels.find(function (c) { return c.id === channelSelect.value; });
        if (!selected) return;
        const destinationId = threadSelect.value || selected.id;
        if (selected.type === 15 && !threadSelect.value) {
          status.textContent = "Forum channels require a thread selection.";
          status.style.color = "#ffb454";
          return;
        }

        sendBtn.disabled = true;
        channelSelect.disabled = true;
        threadSelect.disabled = true;
        status.textContent = "Uploading JSON to Discord…";
        status.style.color = "#aeb6bf";

        try {
          const response = await fetch("/api/discord-export", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${ctx.token}`
            },
            body: JSON.stringify({
              guild_id: ctx.guildId,
              destination_id: destinationId,
              filename,
              payload
            })
          });
          const result = await response.json().catch(function () { return {}; });
          if (!response.ok) throw new Error(result.error || "Discord export failed.");

          status.textContent = "Export sent to Discord successfully.";
          status.style.color = "#1eff00";
          sendBtn.textContent = "Sent ✓";
          window.setTimeout(function () { closeModal(overlay); }, 900);
        } catch (err) {
          status.textContent = err instanceof Error ? err.message : String(err);
          status.style.color = "#ff5b5b";
          sendBtn.disabled = false;
          channelSelect.disabled = false;
          refreshThreads();
        }
      });

      status.textContent = channels.length
        ? "Choose the server channel, then choose a thread if needed."
        : "No Discord channels are available to you and the Tactical Centre bot.";
      status.style.color = channels.length ? "#aeb6bf" : "#ffb454";
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : String(err);
      status.style.color = "#ff5b5b";
    }
  }

  HTMLAnchorElement.prototype.click = function () {
    try {
      const filename = String(this.download || "");
      const href = String(this.href || "");
      const blob = blobByUrl.get(href);
      if (filename && /\.json$/i.test(filename) && blob && /application\/json/i.test(blob.type || "application/json")) {
        suppressNextDownloadAlert = true;
        openExportPicker(filename, blob);
        return;
      }
    } catch (err) {
      console.error("[1st MI] Export picker interception failed:", err);
    }
    return nativeAnchorClick.call(this);
  };
})();
