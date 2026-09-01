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

  // PEPMOSA ADMIN: add a safe DELETE button to Categories.
  // Categories that are still assigned to products cannot be deleted;
  // this prevents accidentally orphaning products.
  document.addEventListener("DOMContentLoaded", function () {
    let attempts = 0;
    const timer = setInterval(function () {
      attempts++;
      if (typeof window.renderCategories === "function" && typeof window.deleteCategory !== "function") {
        const originalRenderCategories = window.renderCategories;

        window.deleteCategory = async function (categoryName) {
          if (!categoryName) return;
          if (!confirm(`DELETE CATEGORY "${categoryName}"?\n\nThis will permanently delete the category and its GB category-minimum settings. Products using this category will NOT be deleted.\n\nIf products are still assigned to this category, deletion will be blocked.\n\nContinue?`)) return;

          try {
            if (typeof window.sb === "undefined" || !window.sb) {
              throw new Error("Supabase is not initialized. Please refresh the page and try again.");
            }

            const { data: usedProducts, error: productError } = await window.sb
              .from("products")
              .select("product_id")
              .eq("category", categoryName)
              .limit(1);

            if (productError) throw productError;

            if ((usedProducts || []).length) {
              if (typeof window.showMessage === "function") {
                window.showMessage(
                  `Cannot delete "${categoryName}" because one or more products are still using it. Disable the category instead, or move those products to another category first.`,
                  "error"
                );
              }
              return;
            }

            const { error: settingsError } = await window.sb
              .from("gb_category_settings")
              .delete()
              .eq("category_name", categoryName);

            if (settingsError && !String(settingsError.message || "").toLowerCase().includes("does not exist")) {
              throw settingsError;
            }

            const { error: legacyError } = await window.sb
              .from("gb_minimum_quantities")
              .delete()
              .eq("product_id", categoryName);

            if (legacyError && !String(legacyError.message || "").toLowerCase().includes("does not exist")) {
              // Ignore legacy-table mismatch; category deletion itself can still proceed.
              console.warn("Legacy category minimum cleanup skipped:", legacyError);
            }

            const { error } = await window.sb
              .from("categories")
              .delete()
              .eq("category_name", categoryName);

            if (error) throw error;

            if (typeof window.loadCategories === "function") await window.loadCategories();
            if (typeof window.loadCategoryMinimums === "function") {
              const gb = document.getElementById("minimumGB");
              if (gb && gb.value) await window.loadCategoryMinimums();
            }

            if (typeof window.showMessage === "function") {
              window.showMessage(`Category "${categoryName}" deleted successfully.`, "success");
            }
          } catch (e) {
            console.error("DELETE CATEGORY ERROR:", e);
            if (typeof window.showMessage === "function") {
              window.showMessage(e.message || "Unable to delete category.", "error");
            }
          }
        };

        window.renderCategories = function () {
          originalRenderCategories();
          const list = document.getElementById("categoryList");
          if (!list) return;

          list.querySelectorAll(".item").forEach(function (item) {
            const nameEl = item.querySelector(".itemHead b");
            const actions = item.querySelector(".actions");
            if (!nameEl || !actions || actions.querySelector(".deleteCategoryBtn")) return;

            const categoryName = nameEl.textContent.trim();
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn danger deleteCategoryBtn";
            btn.textContent = "DELETE";
            btn.addEventListener("click", function () {
              window.deleteCategory(categoryName);
            });
            actions.appendChild(btn);
          });
        };

        // Re-render immediately so the DELETE button appears without waiting
        // for another category refresh.
        try { window.renderCategories(); } catch (e) { console.error(e); }
        clearInterval(timer);
      }
      if (attempts >= 300) clearInterval(timer);
    }, 100);
  });
})();
