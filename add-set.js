// ============================================
//  AVAR1ON'S ARCHIVE — add-set.js
//  Logica voor de "+" knop op de homepage: een modal
//  met zoekfunctie om nieuwe sets toe te voegen aan
//  de my_sets tabel in Supabase.
// ============================================

const TCGDEX_API = 'https://api.tcgdex.net/v2/en';

let searchDebounceTimer = null;
let allSetsCache = null; // alle TCGdex-sets, één keer opgehaald, lokaal doorzocht

const fab = document.getElementById('addSetFab');
const modal = document.getElementById('addSetModal');
const modalBackdrop = document.getElementById('addSetBackdrop');
const closeBtn = document.getElementById('addSetClose');
const searchInput = document.getElementById('addSetSearch');
const resultsEl = document.getElementById('addSetResults');

// --- Modal openen/sluiten ---

function openModal() {
  modal.classList.add('open');
  modalBackdrop.classList.add('open');
  searchInput.value = '';
  searchInput.focus();
  renderResults([]); // leeg tot er getypt wordt
  if (!allSetsCache) preloadAllSets();
}

function closeModal() {
  modal.classList.remove('open');
  modalBackdrop.classList.remove('open');
}

fab.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
});

// --- Alle sets alvast ophalen (licht endpoint: id, naam, logo, aantal) ---

async function preloadAllSets() {
  try {
    const r = await fetch(`${TCGDEX_API}/sets`);
    allSetsCache = await r.json();
  } catch {
    allSetsCache = [];
  }
}

// --- Zoeken (gedebouncet, zodat we niet bij elke toetsaanslag herzoeken) ---

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  const query = searchInput.value.trim();

  if (!query) {
    renderResults([]);
    return;
  }

  searchDebounceTimer = setTimeout(() => doSearch(query), 200);
});

async function doSearch(query) {
  resultsEl.innerHTML = '<div class="add-set-loading">Zoeken...</div>';

  // Als de volledige lijst al geladen is, lokaal filteren (sneller,
  // geen extra API-call nodig per toetsaanslag).
  if (allSetsCache) {
    const q = query.toLowerCase();
    const matches = allSetsCache.filter(s => s.name.toLowerCase().includes(q));
    renderResults(matches.slice(0, 30));
    return;
  }

  // Fallback: rechtstreeks bij TCGdex zoeken
  try {
    const r = await fetch(`${TCGDEX_API}/sets?name=${encodeURIComponent(query)}`);
    const data = await r.json();
    renderResults(data.slice(0, 30));
  } catch {
    resultsEl.innerHTML = '<div class="add-set-loading">Zoeken mislukt. Probeer opnieuw.</div>';
  }
}

// --- Resultaten tonen ---

function renderResults(sets) {
  if (!sets.length) {
    resultsEl.innerHTML = searchInput.value.trim()
      ? '<div class="add-set-loading">Geen sets gevonden.</div>'
      : '<div class="add-set-loading">Typ om te zoeken naar een set.</div>';
    return;
  }

  const alreadyAdded = new Set(mySetsConfig.map(e => e.id));

  resultsEl.innerHTML = '';
  sets.forEach(set => {
    const isAdded = alreadyAdded.has(set.id);

    const row = document.createElement('div');
    row.className = 'add-set-row';
    row.innerHTML = `
      <div class="add-set-row-logo">
        ${set.logo
          ? `<img src="${set.logo}.png" alt="" loading="lazy">`
          : '<span class="placeholder">SET</span>'
        }
      </div>
      <div class="add-set-row-info">
        <div class="add-set-row-name">${set.name}</div>
        <div class="add-set-row-meta">${set.id} · ${set.cardCount?.total || '?'} kaarten</div>
      </div>
      <button class="add-set-row-btn" ${isAdded ? 'disabled' : ''}>
        ${isAdded ? 'Toegevoegd' : 'Toevoegen'}
      </button>
    `;

    const btn = row.querySelector('.add-set-row-btn');
    if (!isAdded) {
      btn.addEventListener('click', () => addSet(set, btn));
    }

    resultsEl.appendChild(row);
  });
}

// --- Set toevoegen aan my_sets ---

async function addSet(set, btnEl) {
  btnEl.disabled = true;
  btnEl.textContent = 'Bezig...';

  const { error } = await supabaseClient
    .from('my_sets')
    .insert({
      user_id: currentUser.id,
      set_id: set.id,
      pokeball: false,
      masterball: false,
    });

  if (error) {
    console.error('Kon set niet toevoegen:', error);
    btnEl.disabled = false;
    btnEl.textContent = 'Toevoegen';
    return;
  }

  btnEl.textContent = 'Toegevoegd';

  // Homepage volledig vernieuwen (app.js's reloadSets) zodat de
  // nieuwe set meteen in het overzicht verschijnt.
  await window.reloadSets();
}
