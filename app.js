// ============================================
//  AVAR1ON'S ARCHIVE — app.js (homepage)
//  Kaartdata: TCGdex (api.tcgdex.net)
//  Vinkjes-data + sets-lijst: Supabase (zie supabase-config.js)
// ============================================

const API = 'https://api.tcgdex.net/v2/en';

let allSets = [];        // volledige set-objecten (TCGdex), voor de sets in MY_SETS
let mySetsConfig = [];   // ruwe rijen uit de my_sets tabel (id, pokeball, masterball)
let currentSeries = 'all';
let currentUser = null;

// owned = Map van "cardId:variant" -> true, voor ALLE sets samen.
let ownedMap = {};

// --- MY_SETS ophalen uit Supabase (vervangt het oude my-sets.js) ---

async function loadMySets() {
  const { data, error } = await supabaseClient
    .from('my_sets')
    .select('set_id, pokeball, masterball')
    .eq('user_id', currentUser.id);

  if (error) {
    console.error('Kon mijn sets niet laden:', error);
    return [];
  }
  return data.map(row => ({
    id: row.set_id,
    pokeball: row.pokeball,
    masterball: row.masterball,
  }));
}

// --- Owned-data ophalen uit Supabase (één keer, voor alle sets) ---

async function loadOwnedFromSupabase() {
  const { data, error } = await supabaseClient
    .from('owned_cards')
    .select('card_id, variant')
    .eq('user_id', currentUser.id);

  if (error) {
    console.error('Kon vinkjes niet laden:', error);
    return;
  }

  ownedMap = {};
  data.forEach(row => {
    ownedMap[row.card_id + ':' + row.variant] = true;
  });
}

function countOwnedForSet(setId) {
  return Object.keys(ownedMap).filter(key => key.startsWith(setId + '-')).length;
}

// --- Globale statistieken in de header updaten ---

function updateGlobalStats() {
  let totalCards = 0;
  allSets.forEach(set => { totalCards += set.cardCount?.total || 0; });

  const totalOwned = Object.keys(ownedMap).length;
  const pct = totalCards ? Math.round(totalOwned / totalCards * 100) : 0;

  document.getElementById('globalOwned').textContent = totalOwned;
  document.getElementById('globalPct').textContent = pct + '%';
}

// --- Series-filterknoppen aanmaken ---

function buildSeriesFilter(sets) {
  const filterEl = document.getElementById('seriesFilter');

  // Oude knoppen weg (behalve "Alle"), zodat dit ook na het toevoegen
  // van een nieuwe set opnieuw opgebouwd kan worden.
  filterEl.querySelectorAll('.series-btn:not([data-series="all"])').forEach(b => b.remove());

  const seriesNames = [...new Set(sets.map(s => s.serie?.name).filter(Boolean))];

  seriesNames.forEach(series => {
    const btn = document.createElement('button');
    btn.className = 'series-btn';
    btn.dataset.series = series;
    btn.textContent = series;

    btn.addEventListener('click', () => {
      document.querySelectorAll('.series-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSeries = series;
      renderSetsGrid();
    });

    filterEl.appendChild(btn);
  });
}

function initAllSeriesButton() {
  document.querySelector('.series-btn[data-series="all"]').addEventListener('click', () => {
    document.querySelectorAll('.series-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.series-btn[data-series="all"]').classList.add('active');
    currentSeries = 'all';
    renderSetsGrid();
  });
}

// --- Sets grid renderen ---

function renderSetsGrid() {
  const grid = document.getElementById('setsGrid');

  const filtered = currentSeries === 'all'
    ? allSets
    : allSets.filter(s => s.serie?.name === currentSeries);

  if (!filtered.length) {
    grid.innerHTML = allSets.length
      ? '<div class="loading-grid">Geen sets in deze serie.</div>'
      : '<div class="loading-grid">Nog geen sets toegevoegd. Klik op de + knop rechtsonder om te beginnen.</div>';
    return;
  }

  grid.innerHTML = '';

  filtered.forEach(set => {
    const ownedCount = countOwnedForSet(set.id);
    const total = set.cardCount?.total || 1;
    const pct = Math.round(ownedCount / total * 100);

    const card = document.createElement('a');
    card.className = 'set-card';
    card.href = `set.html?id=${set.id}`;

    card.innerHTML = `
      <div class="set-logo-wrap">
        ${set.logo
          ? `<img src="${set.logo}.png" alt="${set.name} logo" loading="lazy">`
          : '<span class="placeholder">SET</span>'
        }
      </div>
      <div class="set-card-name">${set.name}</div>
      <div class="set-card-meta">${set.serie?.name || ''} · ${set.cardCount?.total || '?'} kaarten</div>
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
  const btn = document.getElementById('logoutBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
  });
}

// --- Alles herladen na het toevoegen/verwijderen van een set
// (aangeroepen vanuit add-set.js) ---

async function reloadSets() {
  mySetsConfig = await loadMySets();

  if (!mySetsConfig.length) {
    allSets = [];
    buildSeriesFilter([]);
    updateGlobalStats();
    renderSetsGrid();
    return;
  }

  const setResults = await Promise.all(
    mySetsConfig.map(entry =>
      fetch(`${API}/sets/${entry.id}`)
        .then(r => { if (!r.ok) throw new Error('not found: ' + entry.id); return r.json(); })
        .catch(() => null)
    )
  );

  allSets = setResults.filter(Boolean);

  // Sorteren op releasedatum, nieuwste eerst.
  allSets.sort((a, b) => {
    const dateA = a.releaseDate || '0000-00-00';
    const dateB = b.releaseDate || '0000-00-00';
    return dateB.localeCompare(dateA);
  });

  buildSeriesFilter(allSets);
  updateGlobalStats();
  renderSetsGrid();
}
// Beschikbaar maken voor add-set.js
window.reloadSets = reloadSets;

// --- Init ---

async function init() {
  currentUser = await requireAuth();
  if (!currentUser) return;

  initLogout();
  initAllSeriesButton();

  try {
    await Promise.all([
      loadOwnedFromSupabase(),
      reloadSets(),
    ]);
  } catch (error) {
    document.getElementById('setsGrid').innerHTML =
      '<div class="loading-grid">Kon sets niet laden. Controleer je internetverbinding.</div>';
  }
}

init();
