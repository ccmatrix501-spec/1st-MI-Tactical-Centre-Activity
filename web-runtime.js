(() => {
  "use strict";

  const DEFAULT_API =
    "https://1st-mi-matrix-r-d-production.up.railway.app";
  const DB_NAME = "mi-tactical-centre-web";
  const DB_VERSION = 1;
  const MAP_STORE = "maps";
  const KEYBINDS_KEY = "ste-web-keybinds";

  function apiBase() {
    try {
      return (
        String(localStorage.getItem("ste-discord-bot-api") || "")
          .trim()
          .replace(/\/+$/, "") || DEFAULT_API
      );
    } catch {
      return DEFAULT_API;
    }
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      cache: "no-store",
      ...options,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        ok: false,
        status: response.status,
        error:
          payload?.error ||
          payload?.message ||
          "Request failed with HTTP " + response.status,
        ...payload,
      };
    }

    return {
      success: true,
      ok: true,
      status: response.status,
      ...payload,
    };
  }

  function currentDiscordAccess() {
    const access = window.miDiscordAccess;

    if (access?.allowed) {
      return {
        success: true,
        activated: true,
        valid: true,
        provider: "discord-activity",
        isAdmin: Boolean(access.isAdmin),
        discordUserId: String(access.userId || ""),
        expiresAt: "",
        offline: false,
        guildId: String(access.guildId || ""),
      };
    }

    if (window.miDiscordActivity === true) {
      return {
        success: false,
        activated: false,
        valid: false,
        provider: "discord-activity",
        isAdmin: false,
        discordUserId: "",
        expiresAt: "",
        offline: false,
        error: "Discord Activity access has not been verified.",
      };
    }

    return {
      success: true,
      activated: true,
      valid: true,
      provider: "web",
      isAdmin: false,
      discordUserId: "",
      expiresAt: "",
      offline: false,
    };
  }

  window.steAccess = {
    getStatus: async () => currentDiscordAccess(),
    activate: async () => currentDiscordAccess(),
    clear: async () => ({
      success: true,
      ...currentDiscordAccess(),
    }),
  };

  window.steDiscordBot = {
    getBaseUrl: async () => ({
      success: true,
      baseUrl: apiBase(),
    }),

    setBaseUrl: async (url) => {
      const clean =
        String(url || "")
          .trim()
          .replace(/\/+$/, "") || DEFAULT_API;

      try {
        localStorage.setItem("ste-discord-bot-api", clean);
      } catch {}

      return {
        success: true,
        baseUrl: clean,
      };
    },

    health: async () => fetchJson(apiBase() + "/health"),

    listThreads: async (channelId) => {
      const suffix = channelId
        ? "/threads/" + encodeURIComponent(channelId)
        : "/threads";

      return fetchJson(apiBase() + suffix);
    },

    send: async (payload = {}) => {
      const threadId = String(payload.threadId || "").trim();

      if (!threadId) {
        return {
          success: false,
          error: "Missing threadId",
        };
      }

      return fetchJson(
        apiBase() +
          "/threads/" +
          encodeURIComponent(threadId) +
          "/send",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: String(payload.content || ""),
            filename: String(payload.filename || "export.json"),
            fileBase64: payload.fileBase64 || undefined,
          }),
        }
      );
    },
  };

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(MAP_STORE)) {
          db.createObjectStore(MAP_STORE, {
            keyPath: "id",
          });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error("Could not open browser map store."));
    });
  }

  async function dbGetAll() {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(MAP_STORE, "readonly");
      const request = tx.objectStore(MAP_STORE).getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () =>
        reject(request.error || new Error("Could not read browser map store."));
      tx.oncomplete = () => db.close();
    });
  }

  async function dbGet(id) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(MAP_STORE, "readonly");
      const request = tx.objectStore(MAP_STORE).get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () =>
        reject(request.error || new Error("Could not read browser map."));
      tx.oncomplete = () => db.close();
    });
  }

  async function dbPut(record) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(MAP_STORE, "readwrite");
      tx.objectStore(MAP_STORE).put(record);
      tx.oncomplete = () => {
        db.close();
        resolve(record);
      };
      tx.onerror = () => {
        const error = tx.error || new Error("Could not save browser map.");
        db.close();
        reject(error);
      };
    });
  }

  async function dbDelete(id) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(MAP_STORE, "readwrite");
      tx.objectStore(MAP_STORE).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        const error = tx.error || new Error("Could not remove browser map.");
        db.close();
        reject(error);
      };
    });
  }

  const MAP_CATEGORY_STORAGE_PREFIX =
    "ste-map-game-categories-v1:";

  function normaliseVersion(value) {
    return value === "NON_STE" ? "NON_STE" : "STE";
  }

  function defaultGame(value) {
    return value === "NON_STE" ? "HLL:V" : "STE";
  }

  function normaliseGame(value, appVersion) {
    const clean = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    if (clean) return clean;
    return defaultGame(appVersion);
  }

  function mapCategoryStorageKey(appVersion) {
    return MAP_CATEGORY_STORAGE_PREFIX + normaliseVersion(appVersion);
  }

  function storedMapCategories(appVersion) {
    const version = normaliseVersion(appVersion);
    const fallback = defaultGame(version);

    try {
      const parsed = JSON.parse(
        localStorage.getItem(mapCategoryStorageKey(version)) || "[]"
      );
      const values = Array.isArray(parsed) ? parsed : [];

      return Array.from(
        new Set([
          fallback,
          ...values
            .map((value) => normaliseGame(value, version))
            .filter(Boolean),
        ])
      );
    } catch {
      return [fallback];
    }
  }

  function saveMapCategories(appVersion, categories) {
    const version = normaliseVersion(appVersion);
    const fallback = defaultGame(version);
    const clean = Array.from(
      new Set([
        fallback,
        ...(Array.isArray(categories) ? categories : [])
          .map((value) => normaliseGame(value, version))
          .filter(Boolean),
      ])
    );

    localStorage.setItem(
      mapCategoryStorageKey(version),
      JSON.stringify(clean)
    );

    return clean;
  }

  async function listMapCategories(appVersion) {
    const version = normaliseVersion(appVersion);
    const all = await dbGetAll();
    const fromMaps = all
      .filter((record) => normaliseVersion(record.appVersion) === version)
      .map((record) => normaliseGame(record.game, version));

    return saveMapCategories(version, [
      ...storedMapCategories(version),
      ...fromMaps,
    ]).sort((a, b) => a.localeCompare(b));
  }

  function cleanMapId(value) {
    return (
      String(value || "")
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 100) ||
      "map-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 8)
    );
  }

  function publicMap(record) {
    return {
      id: String(record.id),
      name: String(record.name || "Custom Map"),
      appVersion: normaliseVersion(record.appVersion),
      game: String(record.game || ""),
      createdAt: record.createdAt || null,
      originalFileName: record.originalFileName || "",
      source: record.source || "local",
      remoteId: record.remoteId || null,
      remoteSha256: record.remoteSha256 || null,
    };
  }

  async function fileToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () =>
        reject(reader.error || new Error("Could not read browser file."));
      reader.readAsDataURL(blob);
    });
  }

  window.steMaps = {
    categories: async (appVersion) =>
      listMapCategories(appVersion),

    addCategory: async (payload = {}) => {
      if (!currentDiscordAccess().isAdmin && window.miDiscordActivity === true) {
        return {
          success: false,
          error: "Admin access is required to add map game categories.",
        };
      }

      const appVersion = normaliseVersion(payload.appVersion);
      const game = normaliseGame(payload.game, appVersion);
      const categories = await listMapCategories(appVersion);

      if (
        !categories.some(
          (item) => item.toLowerCase() === game.toLowerCase()
        )
      ) {
        categories.push(game);
      }

      saveMapCategories(appVersion, categories);

      return {
        success: true,
        game,
        categories: await listMapCategories(appVersion),
      };
    },

    removeCategory: async (payload = {}) => {
      if (!currentDiscordAccess().isAdmin && window.miDiscordActivity === true) {
        return {
          success: false,
          error: "Admin access is required to remove map game categories.",
        };
      }

      const appVersion = normaliseVersion(payload.appVersion);
      const game = normaliseGame(payload.game, appVersion);
      const builtIn = defaultGame(appVersion);

      if (game.toLowerCase() === builtIn.toLowerCase()) {
        return {
          success: false,
          error: "The built-in " + builtIn + " category cannot be removed.",
        };
      }

      const all = await dbGetAll();
      const hasMaps = all.some(
        (record) =>
          normaliseVersion(record.appVersion) === appVersion &&
          normaliseGame(record.game, appVersion).toLowerCase() ===
            game.toLowerCase()
      );

      if (hasMaps) {
        return {
          success: false,
          error: "Remove the maps in this category before deleting it.",
        };
      }

      const categories = (await listMapCategories(appVersion)).filter(
        (item) => item.toLowerCase() !== game.toLowerCase()
      );

      saveMapCategories(appVersion, categories);

      return {
        success: true,
        categories: await listMapCategories(appVersion),
      };
    },

    list: async (filter = {}) => {
      const version = normaliseVersion(filter.appVersion);
      const game = normaliseGame(filter.game, version);
      const all = await dbGetAll();

      return all
        .filter(
          (record) =>
            normaliseVersion(record.appVersion) === version &&
            String(record.game || "") === game
        )
        .map(publicMap)
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    addFromData: async (payload = {}) => {
      if (!currentDiscordAccess().isAdmin && window.miDiscordActivity === true) {
        return {
          success: false,
          error: "Admin access is required to add maps.",
        };
      }

      const appVersion = normaliseVersion(payload.appVersion);
      const game = normaliseGame(payload.game, appVersion);
      const id = cleanMapId(payload.id);
      const record = {
        id,
        name: String(payload.name || "Custom Map").trim() || "Custom Map",
        appVersion,
        game,
        createdAt: new Date().toISOString(),
        originalFileName: String(payload.originalFileName || ""),
        source: "local",
        dataUrl: String(payload.dataUrl || ""),
      };

      if (!record.dataUrl.startsWith("data:image/")) {
        return {
          success: false,
          error: "The selected map image could not be read.",
        };
      }

      await dbPut(record);
      saveMapCategories(appVersion, [
        ...(await listMapCategories(appVersion)),
        game,
      ]);

      return {
        success: true,
        map: publicMap(record),
      };
    },

    add: async (payload = {}) => window.steMaps.addFromData(payload),

    rename: async (id, name) => {
      const record = await dbGet(String(id || ""));
      if (!record) {
        return {
          success: false,
          error: "Map not found.",
        };
      }

      record.name = String(name || "").trim() || record.name;
      record.updatedAt = new Date().toISOString();
      await dbPut(record);

      return {
        success: true,
        map: publicMap(record),
      };
    },

    read: async (id) => {
      const record = await dbGet(String(id || ""));
      if (!record) {
        return {
          success: false,
          error: "Map not found.",
        };
      }

      if (record.dataUrl) {
        return {
          success: true,
          dataUrl: String(record.dataUrl),
        };
      }

      if (record.remoteUrl) {
        const response = await fetch(record.remoteUrl, {
          cache: "no-store",
        });

        if (!response.ok) {
          return {
            success: false,
            error: "Could not download remote map.",
          };
        }

        return {
          success: true,
          dataUrl: await fileToDataUrl(await response.blob()),
        };
      }

      return {
        success: false,
        error: "Map image is unavailable.",
      };
    },

    remove: async (id) => {
      await dbDelete(String(id || ""));
      return {
        success: true,
      };
    },
  };

  window.steBuiltinAssets = {
    readImage: async (relativePath) => {
      try {
        const clean = String(relativePath || "").replace(/^\/+/, "");
        const url = new URL(clean, window.location.href.split("#")[0]).toString();
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error("Bundled map image returned HTTP " + response.status);
        }

        return {
          success: true,
          dataUrl: await fileToDataUrl(await response.blob()),
        };
      } catch (error) {
        return {
          success: false,
          error: error?.message || "Could not load bundled map image.",
        };
      }
    },
  };

  async function syncRemoteMaps(payload = {}) {
    const incoming = Array.isArray(payload.maps)
      ? payload.maps.slice(0, 100)
      : [];
    const all = await dbGetAll();
    const remoteById = new Map(
      all
        .filter((record) => record.source === "remote-content")
        .map((record) => [String(record.remoteId || ""), record])
    );
    const wanted = new Set();
    let downloaded = 0;
    let unchanged = 0;

    for (const raw of incoming) {
      if (!raw || typeof raw !== "object") continue;

      const remoteId = cleanMapId(raw.id);
      const name = String(raw.name || "").trim();
      const appVersion = normaliseVersion(raw.appVersion);
      const game = normaliseGame(raw.game, appVersion);
      const remoteUrl = String(raw.url || "").trim();
      const remoteSha256 = String(raw.sha256 || "").trim().toLowerCase();

      if (!remoteId || !name || !/^https:\/\//i.test(remoteUrl)) continue;

      wanted.add(remoteId);

      const previous = remoteById.get(remoteId);

      if (
        previous &&
        remoteSha256 &&
        String(previous.remoteSha256 || "").toLowerCase() === remoteSha256
      ) {
        previous.name = name;
        previous.appVersion = appVersion;
        previous.game = game;
        previous.remoteUrl = remoteUrl;
        await dbPut(previous);
        unchanged += 1;
        continue;
      }

      const response = await fetch(remoteUrl, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          "Could not download remote map " +
            remoteId +
            " (" +
            response.status +
            ")."
        );
      }

      const blob = await response.blob();
      const dataUrl = await fileToDataUrl(blob);
      const record = {
        id: previous?.id || "remote-" + remoteId,
        name,
        appVersion,
        game,
        createdAt: previous?.createdAt || new Date().toISOString(),
        originalFileName: remoteId,
        source: "remote-content",
        remoteId,
        remoteUrl,
        remoteSha256,
        dataUrl,
        updatedAt: new Date().toISOString(),
      };

      await dbPut(record);
      saveMapCategories(appVersion, [
        ...(await listMapCategories(appVersion)),
        game,
      ]);
      remoteById.set(remoteId, record);
      downloaded += 1;
    }

    let removed = 0;

    for (const record of all) {
      if (
        record.source === "remote-content" &&
        !wanted.has(String(record.remoteId || ""))
      ) {
        await dbDelete(record.id);
        removed += 1;
      }
    }

    window.dispatchEvent(
      new CustomEvent("ste-remote-content-updated", {
        detail: {
          downloaded,
          unchanged,
          removed,
        },
      })
    );

    return {
      success: true,
      downloaded,
      unchanged,
      removed,
    };
  }

  function activityAdminHeaders(extra = {}) {
    const headers = {
      ...extra,
    };

    const token = String(window.miDiscordAccessToken || "").trim();
    const guildId = String(
      window.miDiscordAccess?.guildId ||
        window.miDiscordGuildId ||
        ""
    ).trim();

    if (token) {
      headers.Authorization = "Bearer " + token;
    }

    if (guildId) {
      headers["X-Tactical-Activity-Guild"] = guildId;
    }

    return headers;
  }

  async function adminRequest(path, options = {}) {
    if (!currentDiscordAccess().isAdmin) {
      return {
        success: false,
        error: "Discord administrator access is required.",
      };
    }

    return fetchJson(apiBase() + path, {
      ...options,
      headers: activityAdminHeaders(options.headers || {}),
    });
  }

  window.steContent = {
    syncRemoteMaps,

    getAdminStatus: async () =>
      adminRequest("/tactical-centre/updates/admin/state"),

    publishJson: async (payload = {}) => {
      const slot = String(payload.slot || "").trim();

      if (!slot) {
        return {
          success: false,
          error: "Update slot is required.",
        };
      }

      const result = await adminRequest(
        "/tactical-centre/updates/admin/json/" +
          encodeURIComponent(slot),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data: payload.data,
          }),
        }
      );

      return {
        ...result,
        success: Boolean(result.success && result.ok !== false),
      };
    },

    removeJson: async (slot) => {
      const result = await adminRequest(
        "/tactical-centre/updates/admin/json/" +
          encodeURIComponent(String(slot || "")),
        {
          method: "DELETE",
        }
      );

      return {
        ...result,
        success: Boolean(result.success && result.ok !== false),
      };
    },

    publishMap: async (payload = {}) => {
      try {
        const id = cleanMapId(payload.id);
        const dataUrl = String(payload.dataUrl || "");
        const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);

        if (!match) {
          return {
            success: false,
            error: "Map image data is invalid.",
          };
        }

        const binary = atob(match[2]);
        const bytes = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }

        const result = await adminRequest(
          "/tactical-centre/updates/admin/map/" +
            encodeURIComponent(id),
          {
            method: "PUT",
            headers: {
              "Content-Type": match[1] || "application/octet-stream",
              "X-Tactical-Map-Name": encodeURIComponent(
                String(payload.name || id)
              ),
              "X-Tactical-Map-Game": encodeURIComponent(
                normaliseGame(
                  payload.game,
                  normaliseVersion(payload.appVersion)
                )
              ),
              "X-Tactical-Map-App-Version": normaliseVersion(
                payload.appVersion
              ),
              "X-Tactical-File-Name": encodeURIComponent(
                String(payload.fileName || id + ".png")
              ),
            },
            body: bytes,
          }
        );

        return {
          ...result,
          success: Boolean(result.success && result.ok !== false),
        };
      } catch (error) {
        return {
          success: false,
          error: error?.message || "Could not publish map update.",
        };
      }
    },

    removeMap: async (id) => {
      const result = await adminRequest(
        "/tactical-centre/updates/admin/map/" +
          encodeURIComponent(String(id || "")),
        {
          method: "DELETE",
        }
      );

      return {
        ...result,
        success: Boolean(result.success && result.ok !== false),
      };
    },
  };

  function downloadJson(fileName, data) {
    const content =
      typeof data === "string"
        ? data
        : JSON.stringify(data, null, 2);

    const blob = new Blob([content], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = String(fileName || "Tactical-Centre-save.json");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return {
      success: true,
      filePath: anchor.download,
    };
  }

  window.steApi = {
    saveJsonToFixedFolder: async (fileName, data) =>
      downloadJson(fileName, data),

    saveJsonWithDialog: async (fileName, data) =>
      downloadJson(fileName, data),

    exportSourceArchive: async () => ({
      success: false,
      error: "Source archive export is only available in the desktop app.",
    }),
  };

  window.saveScanner = {
    chooseFolder: async () => null,
    scan: async () => [],
    read: async () => ({
      success: false,
      error: "Save Scanner folder access is only available in the desktop app.",
    }),
  };

  window.steOverlay = {
    open: async () => false,
    close: async () => false,
    setClickThrough: async () => false,
    toggleClickThrough: async () => false,
    onClosed: () => () => {},
  };

  function loadKeybinds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEYBINDS_KEY) || "{}");

      return {
        overlay: String(parsed.overlay || "Alt+1"),
        bugHoles: String(parsed.bugHoles || "Alt+2"),
        mapLayers: String(parsed.mapLayers || "Alt+3"),
      };
    } catch {
      return {
        overlay: "Alt+1",
        bugHoles: "Alt+2",
        mapLayers: "Alt+3",
      };
    }
  }

  window.steKeybinds = {
    get: async () => loadKeybinds(),

    set: async (next = {}) => {
      const saved = {
        ...loadKeybinds(),
        ...next,
      };

      localStorage.setItem(KEYBINDS_KEY, JSON.stringify(saved));
      return saved;
    },

    onToggleBugHoles: () => () => {},
    onToggleMapLayers: () => () => {},
  };

  const CONTENT_MANIFEST_URL =
    DEFAULT_API + "/tactical-centre/updates/manifest.json";
  const CONTENT_REVISION_KEY = "ste-content-update-revision-v2";
  const CONTENT_LAST_UPDATED_KEY = "ste-content-update-last-updated-v2";
  const LIVE_EDIT_STORAGE_PREFIX = "ste-live-page-editor-v2:";
  const AWARDS_STORAGE_PREFIX = "ste-merits-awards-catalog-v1:";

  function resolveRemoteContentUrl(manifestUrl, value) {
    const clean = String(value || "").trim();
    if (!clean) return "";

    try {
      return new URL(clean, manifestUrl).toString();
    } catch {
      return "";
    }
  }

  async function fetchRemoteContentJson(url) {
    const response = await fetch(
      url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(),
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(
        "Content update request failed (" +
          response.status +
          ") for " +
          url
      );
    }

    return response.json();
  }

  function normaliseLiveEditSnapshot(value) {
    return {
      tabLabels:
        value?.tabLabels && typeof value.tabLabels === "object"
          ? value.tabLabels
          : {},
      certs:
        value?.certs && typeof value.certs === "object"
          ? value.certs
          : {},
      customTabs: Array.isArray(value?.customTabs)
        ? value.customTabs
        : [],
      tabSettings:
        value?.tabSettings && typeof value.tabSettings === "object"
          ? value.tabSettings
          : {},
      tabOrder: Array.isArray(value?.tabOrder)
        ? value.tabOrder
        : [],
      elementOverrides:
        value?.elementOverrides &&
        typeof value.elementOverrides === "object"
          ? value.elementOverrides
          : {},
    };
  }

  function liveEditSnapshotForStorage(version, value) {
    if (!value || typeof value !== "object") return null;

    const snapshotKeys = [
      "tabLabels",
      "certs",
      "customTabs",
      "tabSettings",
      "tabOrder",
      "elementOverrides",
    ];
    const isFullSnapshot = snapshotKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(value, key)
    );
    const remote = normaliseLiveEditSnapshot(value);

    if (isFullSnapshot) {
      return remote;
    }

    let current = normaliseLiveEditSnapshot(null);

    try {
      const stored = JSON.parse(
        localStorage.getItem(LIVE_EDIT_STORAGE_PREFIX + version) || "null"
      );
      if (stored && typeof stored === "object") {
        current = normaliseLiveEditSnapshot(stored);
      }
    } catch {}

    return {
      tabLabels:
        value.tabLabels && typeof value.tabLabels === "object"
          ? { ...current.tabLabels, ...remote.tabLabels }
          : current.tabLabels,
      certs:
        value.certs && typeof value.certs === "object"
          ? { ...current.certs, ...remote.certs }
          : current.certs,
      customTabs: Array.isArray(value.customTabs)
        ? remote.customTabs
        : current.customTabs,
      tabSettings:
        value.tabSettings && typeof value.tabSettings === "object"
          ? { ...current.tabSettings, ...remote.tabSettings }
          : current.tabSettings,
      tabOrder: Array.isArray(value.tabOrder)
        ? remote.tabOrder
        : current.tabOrder,
      elementOverrides:
        value.elementOverrides &&
        typeof value.elementOverrides === "object"
          ? {
              ...current.elementOverrides,
              ...remote.elementOverrides,
            }
          : current.elementOverrides,
    };
  }

  async function bootstrapSharedTacticalContent() {
    if (
      localStorage.getItem("ste-live-page-editor-mode") === "true"
    ) {
      return;
    }

    const manifest = await fetchRemoteContentJson(CONTENT_MANIFEST_URL);

    if (Number(manifest?.schemaVersion || 1) !== 1) {
      throw new Error("Unsupported Tactical Centre update manifest.");
    }

    const revision = Number(manifest?.revision || 0);
    if (!Number.isFinite(revision) || revision <= 0) return;

    const liveEditUrl = resolveRemoteContentUrl(
      CONTENT_MANIFEST_URL,
      manifest?.content?.liveEdit
    );
    const awardsUrl = resolveRemoteContentUrl(
      CONTENT_MANIFEST_URL,
      manifest?.content?.awards
    );
    const mapsUrl = resolveRemoteContentUrl(
      CONTENT_MANIFEST_URL,
      manifest?.content?.maps
    );

    if (liveEditUrl) {
      const liveEdit = await fetchRemoteContentJson(liveEditUrl);

      ["STE", "NON_STE"].forEach((version) => {
        const snapshot = liveEditSnapshotForStorage(
          version,
          liveEdit?.[version]
        );
        if (!snapshot) return;

        localStorage.setItem(
          LIVE_EDIT_STORAGE_PREFIX + version,
          JSON.stringify(snapshot)
        );
      });

      window.dispatchEvent(
        new CustomEvent("ste-live-page-editor-changed", {
          detail: { remote: true, revision },
        })
      );
    }

    if (awardsUrl) {
      const awards = await fetchRemoteContentJson(awardsUrl);
      let awardsChanged = false;

      ["STE", "NON_STE"].forEach((version) => {
        if (!Object.prototype.hasOwnProperty.call(awards || {}, version)) {
          return;
        }

        const key = AWARDS_STORAGE_PREFIX + version;
        const catalog = awards?.[version];

        if (!catalog || typeof catalog !== "object") {
          localStorage.removeItem(key);
          awardsChanged = true;
          return;
        }

        localStorage.setItem(key, JSON.stringify(catalog));
        awardsChanged = true;
      });

      if (awardsChanged) {
        window.dispatchEvent(
          new CustomEvent("ste-award-catalog-updated", {
            detail: { remote: true, revision },
          })
        );
      }
    }

    if (mapsUrl && window.steContent?.syncRemoteMaps) {
      const maps = await fetchRemoteContentJson(mapsUrl);
      const result = await window.steContent.syncRemoteMaps({
        manifestUrl: CONTENT_MANIFEST_URL,
        maps: Array.isArray(maps?.maps) ? maps.maps : [],
      });

      if (result && result.success === false) {
        throw new Error(
          result.error || "Remote map update failed."
        );
      }
    }

    localStorage.setItem(CONTENT_REVISION_KEY, String(revision));
    localStorage.setItem(
      CONTENT_LAST_UPDATED_KEY,
      String(manifest?.updatedAt || new Date().toISOString())
    );

    window.dispatchEvent(
      new CustomEvent("ste-remote-content-updated", {
        detail: {
          revision,
          updatedAt: manifest?.updatedAt || null,
        },
      })
    );
  }

  window.__TACTICAL_CONTENT_BOOTSTRAP__ =
    bootstrapSharedTacticalContent().catch((error) => {
      console.warn(
        "[TACTICAL CONTENT] Browser bootstrap sync failed:",
        error
      );
    });

  window.__TACTICAL_WEB_RUNTIME_READY__ = true;
})();
