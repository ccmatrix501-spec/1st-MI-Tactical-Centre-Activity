import {
  initDiscordActivity,
  showActivityBootError
} from "./discordActivity";

type CurrentBuild = {
  sourceRepo?: string;
  sourceCommit?: string;
  version?: string;
  bundle: string;
  css?: string;
};

const EMBEDDED_CURRENT_BUILD: CurrentBuild = {
  sourceRepo: "ccmatrix501-spec/1st-MI-Tactical-Centre-By-Matrix",
  sourceCommit: "8efe3ec0fb597b47aa25e7ff6756fc032ebca689",
  version: "1.3.27",
  bundle: "/assets/index-DLJcwczp.js",
  css: "/assets/index-DGNzVcit.css"
};

async function resolveCurrentBuild(): Promise<CurrentBuild> {
  const manifestUrl = new URL(
    "./current-build.json?t=" + Date.now(),
    window.location.href
  ).href;

  try {
    const response = await fetch(manifestUrl, {
      cache: "no-store"
    });

    if (response.ok) {
      const build = (await response.json()) as CurrentBuild;

      if (build?.bundle) {
        return {
          ...EMBEDDED_CURRENT_BUILD,
          ...build
        };
      }
    } else {
      console.warn(
        "[TACTICAL ACTIVITY] current-build.json unavailable; using embedded synced build. HTTP",
        response.status
      );
    }
  } catch (error) {
    console.warn(
      "[TACTICAL ACTIVITY] Could not read current-build.json; using embedded synced build.",
      error
    );
  }

  return EMBEDDED_CURRENT_BUILD;
}

function pageUrl(path: string): string {
  return new URL(
    path.replace(/^\/+/, ""),
    new URL("./", window.location.href)
  ).href;
}

async function loadCurrentTacticalCentre() {
  const build = await resolveCurrentBuild();

  if (!build?.bundle) {
    throw new Error("The current Tactical Centre build has no JavaScript bundle.");
  }

  if (build.css) {
    const existing = document.querySelector(
      'link[data-tactical-current-css="true"]'
    );

    if (!existing) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.crossOrigin = "anonymous";
      link.dataset.tacticalCurrentCss = "true";
      link.href =
        pageUrl(build.css) +
        "?v=" +
        encodeURIComponent(
          build.sourceCommit || build.version || String(Date.now())
        );
      document.head.appendChild(link);
    }
  }

  try {
    if ((window as any).__TACTICAL_CONTENT_BOOTSTRAP__) {
      await (window as any).__TACTICAL_CONTENT_BOOTSTRAP__;
    }
  } catch (error) {
    console.warn(
      "[TACTICAL CONTENT] Continuing after shared content sync failure:",
      error
    );
  }

  (window as any).__TACTICAL_DESKTOP_VERSION__ = build.version || "";
  (window as any).__TACTICAL_WEB_SOURCE_COMMIT__ =
    build.sourceCommit || "";
  (window as any).__TACTICAL_MAIN_BUNDLE__ = build.bundle;

  const bundleUrl =
    pageUrl(build.bundle) +
    "?v=" +
    encodeURIComponent(
      build.sourceCommit || build.version || String(Date.now())
    );

  await import(/* @vite-ignore */ bundleUrl);
}

async function start() {
  try {
    const activity = await initDiscordActivity();

    if (!activity.allowed) {
      return;
    }

    await loadCurrentTacticalCentre();
  } catch (error) {
    showActivityBootError(error);
  }
}

void start();
