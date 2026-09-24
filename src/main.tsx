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

async function loadCurrentTacticalCentre() {
  const response = await fetch("/current-build.json?t=" + Date.now(), {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      "Current Tactical Centre build manifest is unavailable (HTTP " +
        response.status +
        ")."
    );
  }

  const build = (await response.json()) as CurrentBuild;

  if (!build?.bundle) {
    throw new Error("Current Tactical Centre build manifest has no bundle.");
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
        build.css +
        (build.css.includes("?") ? "&" : "?") +
        "v=" +
        encodeURIComponent(build.sourceCommit || build.version || Date.now());
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
    build.bundle +
    (build.bundle.includes("?") ? "&" : "?") +
    "v=" +
    encodeURIComponent(build.sourceCommit || build.version || Date.now());

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
