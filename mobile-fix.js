(function () {
  var ID = "mi-compact-style";
  var HREF = "/mobile-fix.css?v=2026-08-18-order4";

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
    if (on) reorderCertSections();
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
      var i;
      for (i = 0; i < max; i++) {
        if (left[i]) grid.appendChild(left[i]);
        if (right[i]) grid.appendChild(right[i]);
      }
      leftCol.remove();
      rightCol.remove();
      grid.setAttribute("data-mi-ordered", "1");
    });
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
