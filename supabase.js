let sb;

function initSupabase() {
  if (!window.supabase) {
    throw new Error("Supabase library failed to load.");
  }

  const c = window.PEPMOSA_CONFIG;

  if (
    !c?.SUPABASE_URL ||
    c.SUPABASE_URL.includes("YOUR-PROJECT")
  ) {
    throw new Error(
      "Add your Supabase URL and anon key in config.js."
    );
  }

  sb = window.supabase.createClient(
    c.SUPABASE_URL,
    c.SUPABASE_ANON_KEY
  );

  // Expose the client on window as well. Some admin helpers use
  // window.sb explicitly, while page scripts use the global `sb` binding.
  // Keeping both references in sync prevents false "Supabase is not
  // initialized" errors after the client has already been created.
  window.sb = sb;

  return sb;
}

async function requireAdmin() {
  if (!sb) initSupabase();

  const {
    data: { user }
  } = await sb.auth.getUser();

  if (!user) {
    throw new Error("Please log in.");
  }

  const { data: profile, error } = await sb
    .from("profiles")
    .select("is_admin,email")
    .eq("id", user.id)
    .single();

  if (error || !profile?.is_admin) {
    throw new Error("Admin access required.");
  }

  return {
    user,
    profile
  };
}

/* Shared helpers use var so individual pages can safely define their own helpers. */
var esc = function(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[m]
  );
};

var peso = function(value) {
  return "₱" +
    Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2
    });
};