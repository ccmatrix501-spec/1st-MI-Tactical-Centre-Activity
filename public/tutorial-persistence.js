(() => {
  const STORAGE_KEY = "ste-setup-tutorial-done";
  const COOKIE_KEY = "ste_setup_tutorial_done";
  const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

  const hasCookie = () =>
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .some((part) => part === `${COOKIE_KEY}=true`);

  const markSeen = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // localStorage may be unavailable in a restricted browser context.
    }

    try {
      document.cookie = `${COOKIE_KEY}=true; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
    } catch {
      // Cookie fallback is best-effort only.
    }
  };

  let alreadySeen = false;

  try {
    alreadySeen = localStorage.getItem(STORAGE_KEY) === "true";
    if (!alreadySeen && hasCookie()) {
      localStorage.setItem(STORAGE_KEY, "true");
      alreadySeen = true;
    }
  } catch {
    alreadySeen = hasCookie();
  }

  if (alreadySeen) return;

  const tutorialIsVisible = () => Boolean(document.querySelector(".tutorial-root"));

  const rememberWhenTutorialAppears = () => {
    if (!tutorialIsVisible()) return false;
    markSeen();
    return true;
  };

  const startWatching = () => {
    if (rememberWhenTutorialAppears()) return;

    const observer = new MutationObserver(() => {
      if (rememberWhenTutorialAppears()) observer.disconnect();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startWatching, { once: true });
  } else {
    startWatching();
  }
})();
