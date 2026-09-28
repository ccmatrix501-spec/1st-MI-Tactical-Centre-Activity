import {
  initDiscordActivity,
  showActivityBootError
} from "./discordActivity";

const CURRENT_WEB_BUILD = {
  sourceRepo: "ccmatrix501-spec/1st-MI-Tactical-Centre-By-Matrix",
  sourceCommit: "ae4782db20d0af6dba733792100a61788d12eb10",
  version: "1.3.29",
  bundle: "/assets/index-CEW1AyQU.js",
  css: "/assets/index-DGNzVcit.css"
};

function activityRootUrl(path: string): string {
  return new URL(
    path.replace(/^\/+/, ""),
    new URL("./", window.location.href)
  ).href;
}

async function loadCurrentTacticalCentre() {
  const build = CURRENT_WEB_BUILD;

  const cssUrl =
    activityRootUrl(build.css) +
    "?v=" +
    encodeURIComponent(build.sourceCommit);

  const existingCss = document.querySelector(
    'link[data-tactical-current-css="true"]'
  );

  if (!existingCss) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.crossOrigin = "anonymous";
    link.dataset.tacticalCurrentCss = "true";
    link.href = cssUrl;
    document.head.appendChild(link);
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

  (window as any).__TACTICAL_DESKTOP_VERSION__ = build.version;
  (window as any).__TACTICAL_WEB_SOURCE_COMMIT__ = build.sourceCommit;
  (window as any).__TACTICAL_MAIN_BUNDLE__ = build.bundle;

  const bundleUrl =
    activityRootUrl(build.bundle) +
    "?v=" +
    encodeURIComponent(build.sourceCommit);

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
