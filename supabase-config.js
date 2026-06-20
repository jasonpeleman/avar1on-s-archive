// ============================================
//  AVAR1ON'S ARCHIVE — supabase-config.js
//  Centrale Supabase verbinding, gebruikt door alle pagina's.
// ============================================

const SUPABASE_URL = "https://pztxjmoidcqvtzbqcpmd.supabase.co";
const SUPABASE_KEY = "sb_publishable_jjDH-eMiObhnFE0tjuYb6Q_1nO7Mxxi";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Hulpfunctie: check of er een ingelogde gebruiker is.
// Stuurt door naar login.html als dat niet zo is. ---

async function requireAuth() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session.user;
}
