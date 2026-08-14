(function () {
  const STYLE_ID = "mi-discord-export-style";
  const LAST_CHANNEL_KEY = "mi-discord-export-last-channel";
  const LAST_THREAD_KEY = "mi-discord-export-last-thread";

  function downloadJson(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      .mi-xp-backdrop{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Arial,Helvetica,sans-serif}
      .mi-xp-modal{width:min(620px,100%);max-height:min(760px,92vh);overflow:auto;background:#090c0b;border:1px solid #1eff00;box-shadow:0 0 34px rgba(30,255,0,.18);border-radius:12px;color:#fff}
      .mi-xp-head{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:18px 20px;border-bottom:1px solid #263128}
      .mi-xp-title{font-size:20px;font-weight:800;color:#1eff00}.mi-xp-file{font-size:12px;opacity:.7;margin-top:4px;word-break:break-all}
      .mi-xp-close{border:0;background:transparent;color:#fff;font-size:26px;cursor:pointer;line-height:1}
      .mi-xp-body{padding:20px}.mi-xp-actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}
      .mi-xp-btn{appearance:none;border:1px solid #405044;background:#121713;color:#fff;border-radius:8px;padding:12px 14px;font-weight:700;cursor:pointer}
      .mi-xp-btn:hover{border-color:#1eff00}.mi-xp-btn.primary{background:#173119;border-color:#1eff00;color:#dfffd9}.mi-xp-btn:disabled{opacity:.45;cursor:not-allowed}
      .mi-xp-panel{border-top:1px solid #263128;padding-top:16px}.mi-xp-label{display:block;font-size:12px;font-weight:800;letter-spacing:.05em;color:#a8b8aa;margin:14px 0 6px;text-transform:uppercase}
      .mi-xp-select{width:100%;box-sizing:border-box;background:#0f1410;color:#fff;border:1px solid #405044;border-radius:8px;padding:11px 12px;font-size:15px}
      .mi-xp-status{min-height:20px;margin-top:12px;font-size:13px;color:#b9c8bb}.mi-xp-status.error{color:#ff8e8e}.mi-xp-status.ok{color:#8dff7f}
      .mi-xp-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
      @media(max-width:560px){.mi-xp-actions{grid-template-columns:1fr}.mi-xp-head,.mi-xp-body{padding:15px}.mi-xp-modal{max-height:94vh}}
    `;
    document.head.appendChild(s);
  }

  function context() {
    return {
      accessToken: window.miDiscordAccessToken || window.miDiscordAuth?.access_token || "",
      guildId: window.miDiscordContext?.guildId || window.miDiscordSdk?.guildId || "",
    };
  }

  function option(value, text) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    return o;
  }

  async function showExportDialog(filename, payload) {
    ensureStyle();
    const ctx = context();
    if (!ctx.accessToken || !ctx.guildId) return { handled: false };

    return await new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "mi-xp-backdrop";
      backdrop.innerHTML = `
        <div class="mi-xp-modal" role="dialog" aria-modal="true" aria-label="Export Save">
          <div class="mi-xp-head">
            <div><div class="mi-xp-title">EXPORT SAVE</div><div class="mi-xp-file"></div></div>
            <button class="mi-xp-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="mi-xp-body">
            <div class="mi-xp-actions">
              <button class="mi-xp-btn mi-download" type="button">⬇ Download .JSON</button>
              <button class="mi-xp-btn primary mi-discord" type="button">💬 Send to Discord</button>
            </div>
            <div class="mi-xp-panel">
              <label class="mi-xp-label">Channel</label>
              <select class="mi-xp-select mi-channel"><option>Loading channels…</option></select>
              <label class="mi-xp-label">Thread</label>
              <select class="mi-xp-select mi-thread" disabled><option value="">No Thread — Post Directly to Channel</option></select>
              <div class="mi-xp-status">Loading Discord destinations…</div>
              <div class="mi-xp-foot">
                <button class="mi-xp-btn mi-cancel" type="button">Cancel</button>
                <button class="mi-xp-btn primary mi-send" type="button" disabled>Export to Discord</button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(backdrop);

      const fileEl = backdrop.querySelector(".mi-xp-file");
      const channelEl = backdrop.querySelector(".mi-channel");
      const threadEl = backdrop.querySelector(".mi-thread");
      const statusEl = backdrop.querySelector(".mi-xp-status");
      const sendBtn = backdrop.querySelector(".mi-send");
      fileEl.textContent = filename;

      let destinations = { channels: [], threads: [] };
      let finished = false;
      const finish = (result) => {
        if (finished) return;
        finished = true;
        backdrop.remove();
        resolve(result);
      };
      const status = (text, kind = "") => {
        statusEl.textContent = text;
        statusEl.className = `mi-xp-status${kind ? " " + kind : ""}`;
      };
      const refreshThreads = () => {
        const parentId = channelEl.value;
        const lastThread = localStorage.getItem(LAST_THREAD_KEY) || "";
        threadEl.innerHTML = "";
        threadEl.appendChild(option("", "No Thread — Post Directly to Channel"));
        destinations.threads.filter(t => t.parent_id === parentId).forEach(t => {
          const o = option(t.id, t.name);
          if (t.id === lastThread) o.selected = true;
          threadEl.appendChild(o);
        });
        threadEl.disabled = false;
      };

      backdrop.querySelector(".mi-xp-close").onclick = () => finish({ handled: true, cancelled: true });
      backdrop.querySelector(".mi-cancel").onclick = () => finish({ handled: true, cancelled: true });
      backdrop.querySelector(".mi-download").onclick = () => {
        downloadJson(filename, payload);
        finish({ handled: true, downloaded: true });
      };
      backdrop.querySelector(".mi-discord").onclick = () => channelEl.focus();
      backdrop.addEventListener("click", e => { if (e.target === backdrop) finish({ handled: true, cancelled: true }); });
      channelEl.addEventListener("change", () => {
        localStorage.setItem(LAST_CHANNEL_KEY, channelEl.value);
        refreshThreads();
      });
      threadEl.addEventListener("change", () => localStorage.setItem(LAST_THREAD_KEY, threadEl.value));

      sendBtn.onclick = async () => {
        const channelId = channelEl.value;
        const threadId = threadEl.value;
        const destinationId = threadId || channelId;
        if (!destinationId) return;
        sendBtn.disabled = true;
        channelEl.disabled = true;
        threadEl.disabled = true;
        status("Uploading JSON to Discord…");
        try {
          const r = await fetch("/api/discord-export", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${ctx.accessToken}`,
            },
            body: JSON.stringify({ guild_id: ctx.guildId, destination_id: destinationId, filename, payload }),
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data.error || `Discord export failed (${r.status})`);
          status(threadId ? "Export sent to the selected Discord thread." : "Export sent to the selected Discord channel.", "ok");
          setTimeout(() => finish({ handled: true, sent: true, data }), 900);
        } catch (err) {
          status(err?.message || "Discord export failed.", "error");
          sendBtn.disabled = false;
          channelEl.disabled = false;
          threadEl.disabled = false;
        }
      };

      (async () => {
        try {
          const r = await fetch(`/api/discord-destinations?guild_id=${encodeURIComponent(ctx.guildId)}`, {
            headers: { Authorization: `Bearer ${ctx.accessToken}` },
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data.error || `Could not load channels (${r.status})`);
          destinations = data;
          channelEl.innerHTML = "";
          const lastChannel = localStorage.getItem(LAST_CHANNEL_KEY) || "";
          destinations.channels.forEach(c => {
            const o = option(c.id, `# ${c.name}`);
            if (c.id === lastChannel) o.selected = true;
            channelEl.appendChild(o);
          });
          if (!destinations.channels.length) {
            channelEl.appendChild(option("", "No available text channels"));
            status("The bot cannot find any usable text channels in this server.", "error");
            return;
          }
          refreshThreads();
          sendBtn.disabled = false;
          status("Choose a channel and optional active thread.");
        } catch (err) {
          channelEl.innerHTML = "";
          channelEl.appendChild(option("", "Discord destinations unavailable"));
          status(err?.message || "Could not load Discord destinations.", "error");
        }
      })();
    });
  }

  window.miExportJson = showExportDialog;
})();
