// ============================================
//  AVAR1ON'S ARCHIVE — supabase-config.js
//  Centrale Supabase verbinding, gebruikt door alle pagina's.
// ============================================

const SUPABASE_URL = "https://pztxjmoidcqvtzbqcpmd.supabase.co";
const SUPABASE_KEY = "sb_publishable_jjDH-eMiObhnFE0tjuYb6Q_1nO7Mxxi";

// Check of de Supabase-library zelf wel geladen is (CDN-script in <head>).
// Als dit faalt, is window.supabase niet beschikbaar en geven we een
// duidelijke melding in plaats van een cryptische "undefined" fout.
if (!window.supabase) {
  throw new Error(
    "De Supabase-library kon niet geladen worden. Controleer je internetverbinding " +
      "of of een ad-blocker het script blokkeert (cdn.jsdelivr.net).",
  );
}

// LET OP: window.supabase is de library zelf (van het CDN-script).
// We bouwen hieruit ÉÉN client en zetten die in een eigen variabele
// met een andere naam, zodat we 'm overal consistent kunnen gebruiken
// zonder de library-naamruimte te overschrijven.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Hulpfunctie: check of er een ingelogde gebruiker is.
// Stuurt door naar login.html als dat niet zo is. ---

async function requireAuth() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session.user;
}
