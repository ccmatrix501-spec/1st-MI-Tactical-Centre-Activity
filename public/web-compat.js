(function () {
  "use strict";

  // Web / Discord Activity compatibility layer.
  // The desktop/Microsoft Store build injects a real window.steLicense API.
  // This web package does not: it is intentionally licence-free.
  if (!window.steLicense) {
    window.steLicense = {
      getStatus: async function () {
        return { activated: true, isAdmin: false, platform: "web" };
      },
      activate: async function () {
        return { success: true, activated: true, isAdmin: false, platform: "web" };
      }
    };
  }
})();
