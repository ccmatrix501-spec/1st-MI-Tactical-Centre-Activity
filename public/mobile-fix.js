(function () {
  var ID = "mi-compact-style";
  var HREF = "/mobile-fix.css?v=2026-08-18-compact3";
  function shouldCompact() {
    var w = Math.min(window.innerWidth || 9999, document.documentElement.clientWidth || 9999);
    return w <= 1200 || window.innerHeight > w;
  }
  function applyCss(css) {
    var on = shouldCompact();
    document.documentElement.classList.toggle("mi-compact", on);
    if (document.body) document.body.classList.toggle("mi-compact", on);
    var el = document.getElementById(ID);
    if (!el) {
      el = document.createElement("style");
      el.id = ID;
    }
    el.textContent = css;
    document.documentElement.appendChild(el);
  }
  function run() {
    fetch(HREF, { cache: "no-store" })
      .then(function (r) { return r.text(); })
      .then(applyCss)
      .catch(function () {});
  }
  run();
  window.addEventListener("resize", run);
  window.addEventListener("orientationchange", run);
  var n = 0;
  var t = setInterval(function () {
    run();
    if (++n > 40) clearInterval(t);
  }, 400);
})();
