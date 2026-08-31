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

  return sb;
}

async function requireAdmin() {
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

const esc = (value) =>
  String(value ?? "").replace(
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

const peso = (value) =>
  "₱" +
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2
  });
