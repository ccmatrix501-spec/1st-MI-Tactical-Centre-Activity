(function () {
  if (document.getElementById("mi-mobile-fix-css")) return;
  var link = document.createElement("link");
  link.id = "mi-mobile-fix-css";
  link.rel = "stylesheet";
  link.href = "./mobile-fix.css?v=2026-08-18-topbar2";
  document.head.appendChild(link);
})();
