(function () {
  "use strict";

  // Only show these Discord channel IDs in the export picker (empty = show all bot can post to).
  const ALLOWED_CHANNEL_IDS = [
    "1291511308625117265",
    "1285429568747995136",
    "1284616138965258341",
    "1287139624464154747"
  ];

  // Always hide these channel names (case-insensitive).
  const HIDDEN_CHANNEL_NAMES = [
    "game-reports",
    "bad-actors",
    "hobbies"
  ];

  function isAllowedChannel(channel) {
    if (!channel) return false;
    const name = String(channel.name || "").toLowerCase();
    for (const hidden of HIDDEN_CHANNEL_NAMES) {
      if (name === hidden || name.indexOf(hidden) !== -1) return false;
    }
    if (ALLOWED_CHANNEL_IDS.length > 0) {
      return ALLOWED_CHANNEL_IDS.indexOf(String(channel.id)) !== -1;
    }
    return true;
  }


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


  function buildDefaultMessage(payload, filename) {
    const lines = [];
    lines.push("1st M.I. Tactical Centre — form export");
    if (filename) lines.push("File: " + filename);
    let submittedBy = "";
    try {
      const auth = window.miDiscordAuth;
      const user = auth && auth.user;
      if (user) {
        submittedBy = user.global_name || user.username || "";
        if (user.username && user.discriminator && user.discriminator !== "0") {
          submittedBy = user.username + "#" + user.discriminator;
        } else if (user.username && !submittedBy) submittedBy = user.username;
      }
    } catch (_) {}
    if (submittedBy) lines.push("Submitted by: " + submittedBy);
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const info = payload.info || {};
      const trainee = payload.traineeName || payload.candidate || payload.recipient || info["Trainee Name"] || info.Candidate || "";
      const trainer = payload.trainerName || payload.presentedBy || info["Trainer Name"] || "";
      const company = payload.traineeCompany || payload.company || info["Trainee Company"] || "";
      const saveType = payload.certificationType || payload.saveType || payload.type || "";
      if (saveType) lines.push("Type: " + saveType);
      if (trainee) lines.push("Trainee/Recipient: " + trainee);
      if (trainer) lines.push("Trainer/Presenter: " + trainer);
      if (company) lines.push("Company: " + company);
    }
    lines.push("");
    lines.push("(Add any extra notes below this line)");
    return lines.join("\n");
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

  function getUrlParam(name) {
    try {
      const value = new URLSearchParams(window.location.search).get(name);
      if (value) return value;
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

  function getActivityContext() {
    const instanceId = window.miDiscordInstanceId || getUrlParam("instance_id");
    const frameId = window.miDiscordFrameId || getUrlParam("frame_id");
    const hostname = String(window.location.hostname || "").toLowerCase();
    const referrer = String(document.referrer || "").toLowerCase();
    const inFrame = window.parent !== window;
    const isDiscord = Boolean(
      window.miDiscordActivity ||
      instanceId ||
      frameId ||
      hostname.endsWith(".discordsays.com") ||
      hostname === "discordsays.com" ||
      referrer.includes("discord.com") ||
      referrer.includes("discordapp.com") ||
      inFrame
    );
    return { instanceId, frameId, isDiscord };
  }

  async function waitForActivityContext() {
    for (let i = 0; i < 25; i += 1) {
      const ctx = getActivityContext();
      if (ctx.instanceId) return ctx;
      await new Promise(function (resolve) { window.setTimeout(resolve, 100); });
    }
    return getActivityContext();
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

    const status = el("div", { style: { fontSize: "13px", color: "#aeb6bf", marginBottom: "12px" } }, "Checking Discord Activity session…");
    card.appendChild(status);


    const messageLabel = el("label", { style: {
      display: "block", marginBottom: "14px", fontSize: "13px", fontWeight: "700", color: "#1eff00"
    } }, "Notes / message on Discord post");
    const messageBox = el("textarea", {
      rows: "6",
      style: {
        width: "100%",
        boxSizing: "border-box",
        marginTop: "6px",
        padding: "10px",
        background: "#111418",
        color: "#fff",
        border: "1px solid #1eff00",
        borderRadius: "6px",
        resize: "vertical",
        minHeight: "110px",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "13px",
        lineHeight: "1.4"
      }
    });
    messageBox.value = buildDefaultMessage(payload, filename);
    messageBox.placeholder = "This text is posted with the JSON file on Discord…";
    messageLabel.appendChild(messageBox);
    card.appendChild(messageLabel);

    const channelLabel = el("label", { style: { display: "block", marginBottom: "12px", fontSize: "13px", fontWeight: "700" } }, "Channel");
    const channelSelect = el("select", { style: {
      width: "100%", marginTop: "6px", padding: "10px", background: "#111418", color: "#fff",
      border: "1px solid #3b424a", borderRadius: "6px"
    }, disabled: true });
    channelLabel.appendChild(channelSelect);
    card.appendChild(channelLabel);

    const threadLabel = el("label", { style: { display: "block", marginBottom: "12px", fontSize: "13px", fontWeight: "700" } }, "Thread (optional)");
    const threadWrap = el("div", { style: { marginTop: "6px" } });
    const threadSearch = el("input", {
      type: "search",
      placeholder: "Search threads…",
      style: {
        width: "100%",
        boxSizing: "border-box",
        padding: "10px",
        background: "#111418",
        color: "#fff",
        border: "1px solid #3b424a",
        borderRadius: "6px",
        marginBottom: "6px"
      },
      disabled: true
    });
    const threadSelect = el("select", {
      size: "8",
      style: {
        width: "100%",
        height: "180px",
        padding: "6px",
        background: "#111418",
        color: "#fff",
        border: "1px solid #3b424a",
        borderRadius: "6px",
        overflowY: "auto"
      },
      disabled: true
    });
    // Keep full thread options here for filtering (not shown)
    let threadOptionsCache = [];
    threadWrap.appendChild(threadSearch);
    threadWrap.appendChild(threadSelect);
    threadLabel.appendChild(threadWrap);
    card.appendChild(threadLabel);

    function applyThreadFilter() {
      const q = String(threadSearch.value || "").trim().toLowerCase();
      const previous = threadSelect.value;
      threadSelect.innerHTML = "";
      for (const opt of threadOptionsCache) {
        const label = String(opt.label || "");
        if (q && !label.toLowerCase().includes(q)) continue;
        const option = el("option", { value: opt.value }, label);
        threadSelect.appendChild(option);
      }
      if (previous) {
        const stillThere = Array.from(threadSelect.options).some(function (o) { return o.value === previous; });
        if (stillThere) threadSelect.value = previous;
      }
      threadSelect.dispatchEvent(new Event("change"));
    }
    threadSearch.addEventListener("input", applyThreadFilter);

    const sendBtn = el("button", { type: "button", disabled: true, style: {
      width: "100%", padding: "12px", border: "0", borderRadius: "7px", background: "#1eff00",
      color: "#020302", fontWeight: "800", cursor: "pointer"
    }}, "Send JSON to Discord");
    card.appendChild(sendBtn);

    const hint = el("div", { style: { marginTop: "10px", color: "#7f8993", fontSize: "12px", lineHeight: "1.45" } },
      "Shows active and archived threads the Tactical Centre bot can access. Archived thread listing requires Read Message History. All private threads require Manage Threads; otherwise only private threads the bot has joined can appear.");
    card.appendChild(hint);

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeModal(overlay);
    });
    document.body.appendChild(overlay);

    const ctx = await waitForActivityContext();
    if (!ctx.instanceId) {
      status.textContent = ctx.isDiscord
        ? "Discord Activity detected, but its instance ID was not found. Close the Activity completely and launch it again."
        : "Send to Discord is available when the Tactical Centre is launched as a Discord Activity.";
      status.style.color = "#ffb454";
      return;
    }

    status.textContent = "Verifying this Discord Activity and loading server channels…";

    try {
      const channelQuery = ALLOWED_CHANNEL_IDS.length ? `&channel_ids=${encodeURIComponent(ALLOWED_CHANNEL_IDS.join(","))}` : "";
      const response = await fetch(`/api/discord-destinations?instance_id=${encodeURIComponent(ctx.instanceId)}${channelQuery}`, {
        headers: { "Accept": "application/json" },
        cache: "no-store"
      });
      const result = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(result.error || "Could not load Discord destinations.");

      const channels = (Array.isArray(result.channels) ? result.channels : []).filter(isAllowedChannel);
      const threads = Array.isArray(result.threads) ? result.threads : [];
      const guildName = result.guild_name || "Discord server";

      channelSelect.innerHTML = "";
      channelSelect.appendChild(el("option", { value: "" }, "Select a channel…"));
      for (const channel of channels) {
        const forumLike = channel.type === 15 || channel.type === 16;
        const prefix = forumLike ? "Forum: " : "# ";
        const category = channel.category ? channel.category + " / " : "";
        channelSelect.appendChild(el("option", { value: channel.id }, category + prefix + channel.name));
      }
      channelSelect.disabled = channels.length === 0;

      function refreshThreads() {
        const selected = channels.find(function (c) { return c.id === channelSelect.value; });
        const matching = threads.filter(function (t) { return t.parent_id === channelSelect.value; });
        threadOptionsCache = [];
        threadSearch.value = "";

        if (!selected) {
          threadOptionsCache.push({ value: "", label: "Select a channel first" });
          applyThreadFilter();
          threadSelect.disabled = true;
          threadSearch.disabled = true;
          sendBtn.disabled = true;
          return;
        }

        const forumLike = selected.type === 15 || selected.type === 16;
        const directAllowed = !forumLike && !!selected.can_send;

        if (directAllowed) {
          threadOptionsCache.push({ value: "", label: "No Thread — post directly to channel" });
        } else {
          threadOptionsCache.push({
            value: "",
            label: matching.length ? "Select a thread…" : "No accessible threads available"
          });
        }

        for (const thread of matching) {
          const state = thread.archived ? " — Archived" : " — Active";
          const privacy = thread.private ? " — Private" : "";
          const locked = thread.locked ? " — Locked" : "";
          threadOptionsCache.push({ value: thread.id, label: thread.name + state + privacy + locked });
        }

        applyThreadFilter();
        const canPick = directAllowed || matching.length > 0;
        threadSelect.disabled = !canPick;
        threadSearch.disabled = !canPick || matching.length === 0;
        sendBtn.disabled = directAllowed ? false : !threadSelect.value;
      }

      channelSelect.addEventListener("change", refreshThreads);
      threadSelect.addEventListener("change", function () {
        const selected = channels.find(function (c) { return c.id === channelSelect.value; });
        if (!selected) {
          sendBtn.disabled = true;
          return;
        }
        const forumLike = selected.type === 15 || selected.type === 16;
        const directAllowed = !forumLike && !!selected.can_send;
        sendBtn.disabled = directAllowed ? false : !threadSelect.value;
      });

      sendBtn.addEventListener("click", async function () {
        const selected = channels.find(function (c) { return c.id === channelSelect.value; });
        if (!selected) return;
        const forumLike = selected.type === 15 || selected.type === 16;
        const directAllowed = !forumLike && !!selected.can_send;
        const destinationId = threadSelect.value || selected.id;
        if (!directAllowed && !threadSelect.value) {
          status.textContent = forumLike
            ? "Forum channels require a thread selection."
            : "The bot can only post to a thread in this channel. Select a thread.";
          status.style.color = "#ffb454";
          return;
        }

        sendBtn.disabled = true;
        channelSelect.disabled = true;
        threadSelect.disabled = true;
        threadSearch.disabled = true;
        status.textContent = "Uploading JSON to Discord…";
        status.style.color = "#aeb6bf";

        try {
          const response = await fetch("/api/discord-export", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            cache: "no-store",
            body: JSON.stringify({
              instance_id: ctx.instanceId,
              destination_id: destinationId,
              filename,
              payload,
              message: String(messageBox.value || "").trim()
            })
          });
          const result = await response.json().catch(function () { return {}; });
          if (!response.ok) {
            var detail = result.error || result.message || ("HTTP " + response.status);
            if (result.discord && result.discord.message) detail += " — " + result.discord.message;
            throw new Error(detail);
          }

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

      const warnings = Array.isArray(result.thread_warnings) ? result.thread_warnings : [];
      status.textContent = channels.length
        ? `Connected to ${guildName}. Loaded ${threads.length} accessible thread${threads.length === 1 ? "" : "s"}.` +
          (warnings.length ? ` ${warnings[0]}` : " Choose a channel, then a thread if needed.")
        : "No Discord channels are available to the Tactical Centre bot in this server.";
      status.style.color = channels.length ? (warnings.length ? "#ffb454" : "#aeb6bf") : "#ffb454";
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
