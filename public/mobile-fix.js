(function () {
  var STYLE_ID = "mi-compact-style";
  var script = document.currentScript;
  var base = script && script.src ? script.src : window.location.href;
  var HREF = new URL("./mobile-fix.css?v=2026-10-11-mobile2", base).href;
  var cssPromise = null;

  function width() {
    return Math.min(
      window.innerWidth || 9999,
      document.documentElement.clientWidth || 9999
    );
  }

  function shouldCompact() {
    return width() <= 1200;
  }

  function loadCss() {
    if (!cssPromise) {
      cssPromise = fetch(HREF, { cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error("mobile css HTTP " + r.status);
          return r.text();
        });
    }
    return cssPromise;
  }

  function installCss(css) {
    var el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      document.documentElement.appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
  }

  function reorderCertSections() {
    document.querySelectorAll(".two-panel .grid-two").forEach(function (grid) {
      if (grid.getAttribute("data-mi-ordered") === "1") return;
      if (grid.children.length !== 2) return;

      var leftCol = grid.children[0];
      var rightCol = grid.children[1];
      if (!leftCol || !rightCol) return;
      if (leftCol.classList.contains("card") || rightCol.classList.contains("card")) return;
      if (!leftCol.children.length || !rightCol.children.length) return;
      if (!leftCol.querySelector("h3") || !rightCol.querySelector("h3")) return;

      var left = Array.prototype.slice.call(leftCol.children);
      var right = Array.prototype.slice.call(rightCol.children);
      var max = Math.max(left.length, right.length);

      for (var i = 0; i < max; i += 1) {
        if (left[i]) grid.appendChild(left[i]);
        if (right[i]) grid.appendChild(right[i]);
      }

      leftCol.remove();
      rightCol.remove();
      grid.setAttribute("data-mi-ordered", "1");
    });
  }

  function apply() {
    var compact = shouldCompact();
    document.documentElement.classList.toggle("mi-compact", compact);
    if (document.body) document.body.classList.toggle("mi-compact", compact);

    loadCss()
      .then(function (css) {
        installCss(css);
        if (compact) reorderCertSections();
      })
      .catch(function (err) {
        console.warn("[TACTICAL MOBILE] Could not load compact CSS:", err);
      });
  }

  function observe() {
    if (!document.body || typeof MutationObserver === "undefined") return;
    var queued = false;
    var observer = new MutationObserver(function () {
      if (!shouldCompact() || queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        reorderCertSections();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  apply();
  observe();
  window.addEventListener("resize", apply, { passive: true });
  window.addEventListener("orientationchange", apply, { passive: true });
})();