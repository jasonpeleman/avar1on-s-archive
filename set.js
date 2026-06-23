// ============================================
//  AVAR1ON'S ARCHIVE — set.js
//  Kaartdata: TCGdex (api.tcgdex.net)
//  Vinkjes-data: Supabase (zie supabase-config.js)
//
//  POKÉBALL / MASTERBALL — handmatig, niet uit de API:
//  TCGdex's officiële variants-veld kent alleen: normal, reverse, holo,
//  firstEdition. Pokéball/Masterball patronen worden NIET geleverd
//  door TCGdex. Daarom voegen we die toe op basis van de instelling
//  per set in my-sets.js (entry.pokeball / entry.masterball).
//  Dit zijn dus altijd-beschikbare knoppen, niet API-gevalideerd —
//  vink alleen aan wat je daadwerkelijk bezit.
// ============================================

const API = 'https://api.tcgdex.net/v2/en';

let currentSetId = '';
let currentSetConfig = null; // { pokeball, masterball } uit de my_sets tabel in Supabase
let currentUser = null;
let allCards = [];
let currentFilter = 'all';

// owned = Map van "cardId:variant" -> true, alleen voor de huidige set.
let ownedMap = {};

// Volgorde + labels voor de varianten die TCGdex levert
const VARIANT_ORDER = ['normal', 'reverse', 'holo', 'firstEdition'];
const VARIANT_LABELS = {
  normal:       'Normal',
  reverse:      'Reverse Holo',
  holo:         'Holo',
  firstEdition: '1st Edition',
};

// Handmatige varianten — alleen toegevoegd als de set dit aangeeft
// in my-sets.js (pokeball: true / masterball: true)
const MANUAL_VARIANT_LABELS = {
  pokeball:   'Poké Ball Pattern',
  masterball: 'Master Ball Pattern',
};

// Pokéball/Masterball patronen verschijnen alleen op deze rarities
// (bevestigd voor Prismatic Evolutions: Common/Uncommon/Rare kaarten
// hebben alle drie de varianten; ex-kaarten (Double Rare en hoger)
// hebben deze patronen NIET).
const MANUAL_VARIANT_RARITIES = ['Common', 'Uncommon', 'Rare'];

function cardEligibleForManualVariants(card) {
  return MANUAL_VARIANT_RARITIES.includes(card.rarity);
}

// Trainer-kaarten van Common/Uncommon hebben alleen de Poké Ball-versie,
// geen Master Ball. Pokémon-kaarten van dezelfde rarities hebben beide.
function cardEligibleForMasterball(card) {
  if (card.category === 'Trainer' && (card.rarity === 'Common' || card.rarity === 'Uncommon')) {
    return false;
  }
  return true;
}

// --- URL helpers ---

function getSetIdFromUrl() {
  return new URLSearchParams(window.location.search).get('id');
}

// --- Owned-data ophalen/opslaan via Supabase ---

async function loadOwned(setId) {
  const { data, error } = await supabaseClient
    .from('owned_cards')
    .select('card_id, variant')
    .eq('user_id', currentUser.id)
    .eq('set_id', setId);

  if (error) {
    console.error('Kon vinkjes niet laden:', error);
    return;
  }

  ownedMap = {};
  data.forEach(row => {
    ownedMap[row.card_id + ':' + row.variant] = true;
  });
}

function isVariantOwned(cardId, variant) {
  return !!ownedMap[cardId + ':' + variant];
}

async function toggleVariant(cardId, variant) {
  const key = cardId + ':' + variant;

  if (ownedMap[key]) {
    // Uitvinken: rij verwijderen uit Supabase
    const { error } = await supabaseClient
      .from('owned_cards')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('card_id', cardId)
      .eq('variant', variant);

    if (error) { console.error('Kon vinkje niet verwijderen:', error); return; }
    delete ownedMap[key];

  } else {
    // Aanvinken: rij toevoegen aan Supabase
    const { error } = await supabaseClient
      .from('owned_cards')
      .insert({
        user_id: currentUser.id,
        set_id: currentSetId,
        card_id: cardId,
        variant: variant,
      });

    if (error) { console.error('Kon vinkje niet opslaan:', error); return; }
    ownedMap[key] = true;
  }
}

async function resetAllOwned() {
  const { error } = await supabaseClient
    .from('owned_cards')
    .delete()
    .eq('user_id', currentUser.id)
    .eq('set_id', currentSetId);

  if (error) { console.error('Kon set niet resetten:', error); return; }
  ownedMap = {};
}

// --- Varianten bepalen per kaart ---
// API-varianten (TCGdex) + handmatige varianten (pokeball/masterball,
// alleen als currentSetConfig dat aangeeft).

function getVariants(card) {
  const v = card.variants || {};
  const variants = [];

  VARIANT_ORDER.forEach(key => {
    if (v[key]) variants.push({ key, label: VARIANT_LABELS[key], manual: false });
  });

  if (variants.length === 0) variants.push({ key: 'normal', label: 'Normal', manual: false });

  // Handmatige extra's, alleen als deze set ze heeft aangevinkt in my-sets.js
  // EN de kaart een rarity/categorie heeft die deze patronen ook echt kan hebben.
  if (cardEligibleForManualVariants(card)) {
    if (currentSetConfig?.pokeball) {
      variants.push({ key: 'pokeball', label: MANUAL_VARIANT_LABELS.pokeball, manual: true });
    }
    if (currentSetConfig?.masterball && cardEligibleForMasterball(card)) {
      variants.push({ key: 'masterball', label: MANUAL_VARIANT_LABELS.masterball, manual: true });
    }
  }

  return variants;
}

// --- Totalen tellen ---

function countTotals(cards) {
  let total = 0;
  cards.forEach(card => { total += getVariants(card).length; });
  return total;
}

function countOwned(cards) {
  let n = 0;
  cards.forEach(card => {
    getVariants(card).forEach(v => {
      if (isVariantOwned(card.id, v.key)) n++;
    });
  });
  return n;
}

// --- Prijs per variant bepalen (TCGPlayer, via TCGdex) ---
// TCGPlayer geeft, anders dan Cardmarket, een aparte prijs per variant
// (normal/holofoil/reverse-holofoil/etc.), dus elke variant-knop kan
// zijn eigen, specifieke marktprijs tonen in plaats van één algemene
// kaartprijs. Prijzen zijn in USD (TCGPlayer is een Amerikaanse markt).

// Mapping van onze eigen variant-sleutels naar TCGPlayer's sleutels
const TCGPLAYER_VARIANT_MAP = {
  normal:       'normal',
  reverse:      'reverse-holofoil',
  holo:         'holofoil',
  firstEdition: '1st-edition',
  pokeball:     null,   // niet beschikbaar via API (handmatige variant)
  masterball:   null,   // niet beschikbaar via API (handmatige variant)
};

function getVariantPrice(card, variantKey) {
  const tcgKey = TCGPLAYER_VARIANT_MAP[variantKey];
  if (!tcgKey) return null;

  const tp = card.pricing?.tcgplayer;
  if (!tp) return null;

  const variantData = tp[tcgKey];
  if (!variantData) return null;

  const price = variantData.marketPrice ?? variantData.midPrice;
  return typeof price === 'number' ? price : null;
}

function formatPrice(price) {
  if (price === null) return null;
  return '$' + price.toFixed(2);
}

function sortCards(cards) {
  return [...cards].sort((a, b) => {
    const numA = parseInt(a.localId, 10);
    const numB = parseInt(b.localId, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return String(a.localId).localeCompare(String(b.localId));
  });
}

// --- Voortgang updaten ---

function updateProgress() {
  const total = countTotals(allCards);
  const n = countOwned(allCards);
  const pct = total ? Math.round(n / total * 100) : 0;

  document.getElementById('detailBar').style.width = pct + '%';
  document.getElementById('detailPct').textContent = pct + '%';
  document.getElementById('statOwned').textContent = n;
  document.getElementById('statMissing').textContent = total - n;
  document.getElementById('statTotal').textContent = total;
}

// --- Kaarten renderen ---

function renderCards() {
  const grid = document.getElementById('cardsGrid');

  const filtered = allCards.filter(card => {
    const variants = getVariants(card);
    const hasAny = variants.some(v => isVariantOwned(card.id, v.key));
    const hasAll = variants.every(v => isVariantOwned(card.id, v.key));
    if (currentFilter === 'owned')   return hasAny;
    if (currentFilter === 'missing') return !hasAll;
    return true;
  });

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state">Geen kaarten gevonden.</div>';
    return;
  }

  grid.innerHTML = '';

  filtered.forEach(card => {
    const variants = getVariants(card);
    const allOwned = variants.every(v => isVariantOwned(card.id, v.key));
    const someOwned = variants.some(v => isVariantOwned(card.id, v.key));

    const div = document.createElement('div');
    div.className = 'poke-card';
    if (allOwned) div.classList.add('owned');
    else if (someOwned) div.classList.add('partial');
    div.dataset.id = card.id;

    const variantHTML = variants.map(v => {
      const checked = isVariantOwned(card.id, v.key);
      const price = getVariantPrice(card, v.key);
      const priceLabel = formatPrice(price);
      return `
        <button
          class="variant-btn${checked ? ' checked' : ''}${v.manual ? ' manual' : ''}"
          data-card="${card.id}"
          data-variant="${v.key}"
        >
          <span class="variant-check">${checked ? '✓' : ''}</span>
          <span class="variant-label">${v.label}</span>
          ${priceLabel ? `<span class="variant-price">${priceLabel}</span>` : ''}
        </button>
      `;
    }).join('');

    div.innerHTML = `
      ${card.image
        ? `<img src="${card.image}/low.webp" alt="${card.name}" loading="lazy">`
        : '<div class="card-img-placeholder"></div>'
      }
      <div class="poke-card-info">
        <div class="poke-card-num">${card.localId} / ${card.set?.cardCount?.official || '?'}</div>
        <div class="poke-card-name">${card.name}</div>
        <div class="poke-card-rarity">${card.rarity || ''}</div>
        <div class="variant-row">${variantHTML}</div>
      </div>
    `;

    grid.appendChild(div);
  });

  // Eventlisteners op variant-knoppen
  grid.querySelectorAll('.variant-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      btn.disabled = true; // dubbelklikken tijdens opslaan voorkomen

      const cardId = btn.dataset.card;
      const variant = btn.dataset.variant;
      await toggleVariant(cardId, variant);

      const checked = isVariantOwned(cardId, variant);
      btn.classList.toggle('checked', checked);
      btn.querySelector('.variant-check').textContent = checked ? '✓' : '';
      btn.disabled = false;

      const cardEl = document.querySelector(`.poke-card[data-id="${cardId}"]`);
      if (cardEl) {
        const card = allCards.find(c => c.id === cardId);
        const variants = getVariants(card);
        const allChecked = variants.every(v => isVariantOwned(cardId, v.key));
        const someChecked = variants.some(v => isVariantOwned(cardId, v.key));
        cardEl.classList.toggle('owned', allChecked);
        cardEl.classList.toggle('partial', someChecked && !allChecked);
      }

      updateProgress();
      if (currentFilter !== 'all') renderCards();
    });
  });
}

// --- Set info laden ---

async function loadSetInfo(setId) {
  try {
    const r = await fetch(`${API}/sets/${setId}`);
    const set = await r.json();

    document.title = `${set.name} — Avar1on's Archive`;
    document.getElementById('detailName').textContent = set.name;
    document.getElementById('detailMeta').textContent =
      `${set.serie?.name || ''} · ${set.id} · ${set.cardCount?.total || '?'} kaarten`;

    const logo = document.getElementById('detailLogo');
    if (set.logo) {
      logo.src = set.logo + '.png';
      logo.alt = set.name + ' logo';
      logo.style.display = 'block';
    }

    return set;
  } catch {
    document.getElementById('detailName').textContent = 'Onbekende set';
    return null;
  }
}

// --- Kaarten laden ---

async function loadCards(setId) {
  try {
    const r = await fetch(`${API}/sets/${setId}`);
    const set = await r.json();

    const briefCards = set.cards || [];
    const detailed = await Promise.all(
      briefCards.map(c => fetch(`${API}/cards/${c.id}`).then(res => res.json()))
    );

    allCards = sortCards(detailed);

    updateProgress();
    renderCards();
  } catch {
    document.getElementById('cardsGrid').innerHTML =
      '<div class="empty-state">Kon kaarten niet laden. Controleer je internetverbinding.</div>';
  }
}

// --- Globale header stats (over alle sets in de my_sets tabel) ---

async function updateGlobalStats() {
  try {
    const [ownedResult, mySetsResult] = await Promise.all([
      supabaseClient.from('owned_cards').select('card_id, variant').eq('user_id', currentUser.id),
      supabaseClient.from('my_sets').select('set_id').eq('user_id', currentUser.id),
    ]);

    if (ownedResult.error) throw ownedResult.error;
    if (mySetsResult.error) throw mySetsResult.error;

    let totalCards = 0;
    const setResults = await Promise.all(
      mySetsResult.data.map(entry =>
        fetch(`${API}/sets/${entry.set_id}`).then(r => r.ok ? r.json() : null).catch(() => null)
      )
    );
    setResults.filter(Boolean).forEach(set => { totalCards += set.cardCount?.total || 0; });

    const totalOwned = ownedResult.data.length;
    const pct = totalCards ? Math.round(totalOwned / totalCards * 100) : 0;
    document.getElementById('globalOwned').textContent = totalOwned;
    document.getElementById('globalPct').textContent = pct + '%';
  } catch { }
}

// --- Filter knoppen ---

function initFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderCards();
    });
  });
}

// --- Reset ---

function initReset() {
  document.getElementById('resetBtn').addEventListener('click', async () => {
    if (!confirm('Alle vinkjes voor deze set verwijderen?')) return;
    await resetAllOwned();
    updateProgress();
    renderCards();
  });
}

// --- Pokéball/Masterball schakelaars ---
// Tonen de huidige stand (uit currentSetConfig) en slaan wijzigingen
// meteen op in de my_sets tabel. Na een wijziging worden de kaarten
// opnieuw gerenderd zodat de extra variant-knoppen verschijnen/verdwijnen.

function initVariantToggles() {
  const pokeballToggle = document.getElementById('pokeballToggle');
  const masterballToggle = document.getElementById('masterballToggle');

  pokeballToggle.checked = !!currentSetConfig?.pokeball;
  masterballToggle.checked = !!currentSetConfig?.masterball;

  pokeballToggle.addEventListener('change', () => updateVariantSetting('pokeball', pokeballToggle.checked));
  masterballToggle.addEventListener('change', () => updateVariantSetting('masterball', masterballToggle.checked));
}

async function updateVariantSetting(field, value) {
  const { error } = await supabaseClient
    .from('my_sets')
    .update({ [field]: value })
    .eq('user_id', currentUser.id)
    .eq('set_id', currentSetId);

  if (error) {
    console.error(`Kon ${field} niet bijwerken:`, error);
    return;
  }

  currentSetConfig[field] = value;
  updateProgress();
  renderCards();
}

// --- Set verwijderen ---
// Verwijdert alleen de rij uit my_sets (de set verdwijnt uit het
// overzicht). De owned_cards (je aangevinkte varianten) blijven
// bewaard, zodat je voortgang terugkomt als je de set later
// opnieuw toevoegt.

function initDeleteSet() {
  const btn = document.getElementById('deleteSetBtn');
  btn.addEventListener('click', async () => {
    const setName = document.getElementById('detailName').textContent;
    const confirmed = confirm(
      `"${setName}" verwijderen uit je lijst?\n\n` +
      `Je aangevinkte kaarten blijven bewaard — als je deze set later ` +
      `opnieuw toevoegt, staat je voortgang er weer.`
    );
    if (!confirmed) return;

    btn.disabled = true;
    btn.textContent = 'Bezig...';

    const { error } = await supabaseClient
      .from('my_sets')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('set_id', currentSetId);

    if (error) {
      console.error('Kon set niet verwijderen:', error);
      btn.disabled = false;
      btn.textContent = 'Set verwijderen';
      return;
    }

    window.location.href = 'index.html';
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

// --- Start ---

async function init() {
  currentUser = await requireAuth();
  if (!currentUser) return;

  initLogout();

  currentSetId = getSetIdFromUrl();

  if (!currentSetId) {
    document.getElementById('cardsGrid').innerHTML =
      '<div class="empty-state">Geen set opgegeven. <a href="index.html" style="color:var(--accent)">Ga terug naar het overzicht.</a></div>';
    return;
  }

  // Configuratie voor deze set opzoeken (o.a. pokeball/masterball aan/uit)
  // uit de my_sets tabel in Supabase.
  const { data: setConfigRow } = await supabaseClient
    .from('my_sets')
    .select('pokeball, masterball')
    .eq('user_id', currentUser.id)
    .eq('set_id', currentSetId)
    .maybeSingle();

  currentSetConfig = setConfigRow || {};

  initFilters();
  initReset();
  initVariantToggles();
  initDeleteSet();

  await loadOwned(currentSetId);

  await Promise.all([
    loadSetInfo(currentSetId),
    loadCards(currentSetId),
    updateGlobalStats(),
  ]);
}

init();
