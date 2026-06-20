// ============================================
//  AVAR1ON'S ARCHIVE — app.js (homepage)
//  Kaartdata: TCGdex (api.tcgdex.net)
//  Vinkjes-data: Supabase (zie supabase-config.js)
// ============================================

const API = "https://api.tcgdex.net/v2/en";

// MY_SETS komt uit my-sets.js (ingeladen vóór dit bestand).

let allSets = [];
let currentSeries = "all";
let currentUser = null;

// owned = Map van "cardId:variant" -> true, voor ALLE sets samen.
// Wordt één keer volledig opgehaald bij het laden van de pagina.
let ownedMap = {};

// --- Owned-data ophalen uit Supabase (één keer, voor alle sets) ---

async function loadOwnedFromSupabase() {
  const { data, error } = await supabase
    .from("owned_cards")
    .select("card_id, variant")
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("Kon vinkjes niet laden:", error);
    return;
  }

  ownedMap = {};
  data.forEach((row) => {
    ownedMap[row.card_id + ":" + row.variant] = true;
  });
}

function countOwnedForSet(setId) {
  // Telt hoeveel vinkjes er zijn voor kaarten die bij deze set horen.
  // We herkennen dit aan het card_id-formaat: "<setId>-<nummer>".
  return Object.keys(ownedMap).filter((key) => key.startsWith(setId + "-"))
    .length;
}

// --- Globale statistieken in de header updaten ---

function updateGlobalStats() {
  let totalCards = 0;
  allSets.forEach((set) => {
    totalCards += set.cardCount?.total || 0;
  });

  const totalOwned = Object.keys(ownedMap).length;
  const pct = totalCards ? Math.round((totalOwned / totalCards) * 100) : 0;

  document.getElementById("globalOwned").textContent = totalOwned;
  document.getElementById("globalPct").textContent = pct + "%";
}

// --- Series-filterknoppen aanmaken ---

function buildSeriesFilter(sets) {
  const seriesNames = [
    ...new Set(sets.map((s) => s.serie?.name).filter(Boolean)),
  ];
  const filterEl = document.getElementById("seriesFilter");

  seriesNames.forEach((series) => {
    const btn = document.createElement("button");
    btn.className = "series-btn";
    btn.dataset.series = series;
    btn.textContent = series;

    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".series-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentSeries = series;
      renderSetsGrid();
    });

    filterEl.appendChild(btn);
  });

  document
    .querySelector('.series-btn[data-series="all"]')
    .addEventListener("click", () => {
      document
        .querySelectorAll(".series-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelector('.series-btn[data-series="all"]')
        .classList.add("active");
      currentSeries = "all";
      renderSetsGrid();
    });
}

// --- Sets grid renderen ---

function renderSetsGrid() {
  const grid = document.getElementById("setsGrid");

  const filtered =
    currentSeries === "all"
      ? allSets
      : allSets.filter((s) => s.serie?.name === currentSeries);

  if (!filtered.length) {
    grid.innerHTML = '<div class="loading-grid">Geen sets gevonden.</div>';
    return;
  }

  grid.innerHTML = "";

  filtered.forEach((set) => {
    const ownedCount = countOwnedForSet(set.id);
    const total = set.cardCount?.total || 1;
    const pct = Math.round((ownedCount / total) * 100);

    const card = document.createElement("a");
    card.className = "set-card";
    card.href = `set.html?id=${set.id}`;

    card.innerHTML = `
      <div class="set-logo-wrap">
        ${
          set.logo
            ? `<img src="${set.logo}.png" alt="${set.name} logo" loading="lazy">`
            : '<span class="placeholder">SET</span>'
        }
      </div>
      <div class="set-card-name">${set.name}</div>
      <div class="set-card-meta">${set.serie?.name || ""} · ${set.cardCount?.total || "?"} kaarten</div>
      <div class="set-progress-wrap">
        <div class="set-progress" style="width: ${pct}%"></div>
      </div>
      <div class="set-progress-label">${pct}%</div>
    `;

    grid.appendChild(card);
  });
}

// --- Uitloggen ---

function initLogout() {
  const btn = document.getElementById("logoutBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "login.html";
  });
}

// --- Sets ophalen van de API ---

async function init() {
  currentUser = await requireAuth();
  if (!currentUser) return; // requireAuth stuurt al door naar login.html

  initLogout();

  try {
    if (!MY_SETS.length) {
      document.getElementById("setsGrid").innerHTML =
        '<div class="loading-grid">Geen sets ingesteld. Voeg set-ID\'s toe in my-sets.js.</div>';
      return;
    }

    // Kaartdata (TCGdex) en vinkjes-data (Supabase) tegelijk ophalen
    const [setResults] = await Promise.all([
      Promise.all(
        MY_SETS.map((entry) =>
          fetch(`${API}/sets/${entry.id}`)
            .then((r) => {
              if (!r.ok) throw new Error("not found: " + entry.id);
              return r.json();
            })
            .catch(() => null),
        ),
      ),
      loadOwnedFromSupabase(),
    ]);

    allSets = setResults.filter(Boolean);

    if (!allSets.length) {
      document.getElementById("setsGrid").innerHTML =
        '<div class="loading-grid">Geen geldige sets gevonden. Controleer de set-ID\'s in my-sets.js.</div>';
      return;
    }

    buildSeriesFilter(allSets);
    updateGlobalStats();
    renderSetsGrid();
  } catch (error) {
    document.getElementById("setsGrid").innerHTML =
      '<div class="loading-grid">Kon sets niet laden. Controleer je internetverbinding.</div>';
  }
}

init();
