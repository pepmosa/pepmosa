window.PEPMOSA_CONFIG = {
  SUPABASE_URL: "https://xvpphoxeewctqvzlhoet.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_dM5TQfRrXsvhczxCG4ruuA_TIELkkkq"
};

// PEPMOSA ADMIN: automatically render category minimums once the GB list
// has loaded. This fixes the blank minimum section when the first GB is
// already selected by the browser.
(function () {
  function kickCategoryMinimums() {
    const el = document.getElementById("minimumGB");
    if (!el || !el.value || typeof window.loadCategoryMinimums !== "function") return false;
    try {
      const result = window.loadCategoryMinimums();
      if (result && typeof result.catch === "function") result.catch(console.error);
    } catch (e) {
      console.error(e);
    }
    return true;
  }

  document.addEventListener("DOMContentLoaded", function () {
    let attempts = 0;
    const timer = setInterval(function () {
      attempts++;
      const el = document.getElementById("minimumGB");
      if (el && el.options.length > 1 && el.value && typeof window.loadCategoryMinimums === "function") {
        kickCategoryMinimums();
        clearInterval(timer);
      }
      if (attempts >= 300) clearInterval(timer);
    }, 100);
  });
})();
