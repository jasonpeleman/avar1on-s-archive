// ============================================
//  AVAR1ON'S ARCHIVE — wishlist.js
// ============================================

const API = 'https://api.tcgdex.net/v2/en';

let currentUser = null;
let wishlistItems = []; // { card_id, variant, card_name, set_name, ... }
let searchDebounce = null;
let selectedSetId = ''; // '' = alle sets

const VARIANT_LABELS = {
  normal:       'Normal',
  reverse:      'Reverse Holo',
  holo:         'Holo',
  firstEdition: '1st Edition',
};

// --- Sets laden in de dropdown ---

async function loadSetsDropdown() {
  try {
    const r = await fetch(`${API}/sets`);
    const sets = await r.json();

    // Nieuwste eerst (TCGdex geeft sets chronologisch)
    sets.reverse();

    const select = document.getElementById('wishlistSetFilter');
    sets.forEach(set => {
      const option = document.createElement('option');
      option.value = set.id;
      option.textContent = `${set.name}`;
      select.appendChild(option);
    });
  } catch {
    console.error('Sets konden niet geladen worden voor dropdown');
  }
}

// --- Wishlist laden uit Supabase ---

async function loadWishlist() {
  const { data, error } = await supabaseClient
    .from('wishlist')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('added_at', { ascending: false });

  if (error) { console.error('Wishlist laden mislukt:', error); return; }

  wishlistItems = data;
  renderWishlist();
  updateCount();
}

function isOnWishlist(cardId, variant) {
  return wishlistItems.some(i => i.card_id === cardId && i.variant === variant);
}

function updateCount() {
  document.getElementById('wishlistCount').textContent = wishlistItems.length;
}

// --- Wishlist toevoegen/verwijderen ---

async function addToWishlist(card, variant, btn) {
  btn.disabled = true;

  const variantLabel = VARIANT_LABELS[variant] || variant;
  const { error } = await supabaseClient.from('wishlist').insert({
    user_id:   currentUser.id,
    card_id:   card.id,
    card_name: card.name,
    set_name:  card.set?.name || '',
    set_id:    card.set?.id || '',
    variant,
    image:     card.image ? card.image + '/low.webp' : null,
  });

  if (error) {
    console.error('Toevoegen mislukt:', error);
    btn.disabled = false;
    return;
  }

  wishlistItems.unshift({
    card_id: card.id, card_name: card.name,
    set_name: card.set?.name || '', set_id: card.set?.id || '',
    variant, image: card.image ? card.image + '/low.webp' : null,
  });

  btn.classList.add('on-wishlist');
  btn.title = 'Klik om te verwijderen';
  btn.disabled = false;
  renderWishlist();
  updateCount();
}

async function removeFromWishlist(cardId, variant, btn) {
  if (btn) btn.disabled = true;

  const { error } = await supabaseClient
    .from('wishlist')
    .delete()
    .eq('user_id', currentUser.id)
    .eq('card_id', cardId)
    .eq('variant', variant);

  if (error) {
    console.error('Verwijderen mislukt:', error);
    if (btn) btn.disabled = false;
    return;
  }

  wishlistItems = wishlistItems.filter(
    i => !(i.card_id === cardId && i.variant === variant)
  );

  // Zoekresultaten bijwerken zodat de knop de nieuwe status toont
  const searchBtn = document.querySelector(
    `.wl-variant-btn[data-card="${cardId}"][data-variant="${variant}"]`
  );
  if (searchBtn) {
    searchBtn.classList.remove('on-wishlist');
    searchBtn.disabled = false;
  }

  renderWishlist();
  updateCount();
}

// --- Wishlist renderen ---

function renderWishlist() {
  const container = document.getElementById('wishlistItems');

  if (!wishlistItems.length) {
    container.innerHTML = '<div class="wishlist-empty">Je wishlist is leeg.</div>';
    return;
  }

  container.innerHTML = '';

  wishlistItems.forEach(item => {
    const div = document.createElement('div');
    div.className = 'wl-item';
    div.innerHTML = `
      ${item.image
        ? `<img class="wl-item-img" src="${item.image}" alt="${item.card_name}" loading="lazy">`
        : '<div class="wl-item-img-placeholder"></div>'
      }
      <div class="wl-item-info">
        <div class="wl-item-name">${item.card_name}</div>
        <div class="wl-item-meta">${item.set_name}</div>
        <div class="wl-item-variant">${VARIANT_LABELS[item.variant] || item.variant}</div>
      </div>
      <button class="wl-remove-btn" title="Verwijderen van wishlist">✕</button>
    `;

    div.querySelector('.wl-remove-btn').addEventListener('click', (e) => {
      removeFromWishlist(item.card_id, item.variant, e.target);
      div.remove();
    });

    container.appendChild(div);
  });
}

// --- Zoeken ---

document.getElementById('wishlistSearch').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const q = e.target.value.trim();
  if (!q && !selectedSetId) {
    document.getElementById('searchResults').innerHTML =
      '<div class="wishlist-empty">Typ een naam om kaarten te zoeken.</div>';
    return;
  }
  if (q.length < 2 && !selectedSetId) return;
  searchDebounce = setTimeout(() => searchCards(q), 300);
});

document.getElementById('wishlistSetFilter').addEventListener('change', (e) => {
  selectedSetId = e.target.value;
  const q = document.getElementById('wishlistSearch').value.trim();
  // Meteen zoeken als een set gekozen wordt (ook zonder naam-query)
  searchCards(q);
});

async function searchCards(query) {
  const results = document.getElementById('searchResults');
  results.innerHTML = '<div class="wishlist-loading">Zoeken...</div>';

  try {
    let data = [];

    if (selectedSetId && !query) {
      // Geen naam, wel set: haal alle kaarten van die set op
      const r = await fetch(`${API}/sets/${selectedSetId}`);
      const setData = await r.json();
      data = setData.cards || [];
    } else if (selectedSetId && query) {
      // Naam + set: haal set op en filter lokaal op naam
      const r = await fetch(`${API}/sets/${selectedSetId}`);
      const setData = await r.json();
      const q = query.toLowerCase();
      data = (setData.cards || []).filter(c => c.name.toLowerCase().includes(q));
    } else if (query) {
      // Alleen naam: zoek over alle sets
      const r = await fetch(`${API}/cards?name=${encodeURIComponent(query)}`);
      data = await r.json();
    } else {
      results.innerHTML = '<div class="wishlist-empty">Typ een naam of kies een set.</div>';
      return;
    }

    if (!data || !data.length) {
      results.innerHTML = '<div class="wishlist-empty">Geen kaarten gevonden.</div>';
      return;
    }

    results.innerHTML = `<div class="wishlist-loading">${data.length} kaarten gevonden, details laden...</div>`;

    const BATCH = 10;
    let allDetailed = [];
    let firstBatch = true;

    for (let i = 0; i < data.length; i += BATCH) {
      const batch = data.slice(i, i + BATCH);
      const detailedBatch = await Promise.all(
        batch.map(c =>
          fetch(`${API}/cards/${c.id}`)
            .then(res => res.json())
            .catch(() => null)
        )
      );

      allDetailed = allDetailed.concat(detailedBatch.filter(Boolean));

      if (firstBatch) {
        renderSearchResults(allDetailed);
        firstBatch = false;
      } else {
        appendSearchResults(detailedBatch.filter(Boolean));
      }
    }

  } catch (err) {
    results.innerHTML = '<div class="wishlist-empty">Zoeken mislukt. Probeer opnieuw.</div>';
  }
}

function getCardVariants(card) {
  const v = card.variants || {};
  const variants = [];
  const order = ['normal', 'reverse', 'holo', 'firstEdition'];
  order.forEach(key => {
    if (v[key]) variants.push(key);
  });
  if (!variants.length) variants.push('normal');
  return variants;
}

function makeCardRow(card) {
  const variants = getCardVariants(card);

  const variantBtnsHTML = variants.map(variant => {
    const onWl = isOnWishlist(card.id, variant);
    return `
      <button
        class="wl-variant-btn${onWl ? ' on-wishlist' : ''}"
        data-card="${card.id}"
        data-variant="${variant}"
        title="${onWl ? 'Klik om te verwijderen' : 'Toevoegen aan wishlist'}"
      >
        <span class="wl-variant-check">${onWl ? '✓' : ''}</span>
        <span>${VARIANT_LABELS[variant] || variant}</span>
      </button>
    `;
  }).join('');

  const row = document.createElement('div');
  row.className = 'wl-card-row';
  row.innerHTML = `
    ${card.image
      ? `<img class="wl-card-img" src="${card.image}/low.webp" alt="${card.name}" loading="lazy">`
      : '<div class="wl-card-img-placeholder"></div>'
    }
    <div class="wl-card-info">
      <div class="wl-card-name">${card.name}</div>
      <div class="wl-card-meta">${card.set?.name || ''} · ${card.localId || ''}/${card.set?.cardCount?.official || '?'}</div>
      <div class="wl-variants">${variantBtnsHTML}</div>
    </div>
  `;

  row.querySelectorAll('.wl-variant-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cardId = btn.dataset.card;
      const variant = btn.dataset.variant;
      const checkSpan = btn.querySelector('.wl-variant-check');
      if (btn.classList.contains('on-wishlist')) {
        await removeFromWishlist(cardId, variant, btn);
        btn.classList.remove('on-wishlist');
        if (checkSpan) checkSpan.textContent = '';
      } else {
        await addToWishlist(card, variant, btn);
        btn.classList.add('on-wishlist');
        if (checkSpan) checkSpan.textContent = '✓';
      }
    });
  });

  return row;
}

function renderSearchResults(cards) {
  const results = document.getElementById('searchResults');

  if (!cards.length) {
    results.innerHTML = '<div class="wishlist-empty">Geen kaarten gevonden.</div>';
    return;
  }

  results.innerHTML = '';
  cards.forEach(card => results.appendChild(makeCardRow(card)));
}

function appendSearchResults(cards) {
  const results = document.getElementById('searchResults');
  cards.forEach(card => results.appendChild(makeCardRow(card)));
}

// --- Init ---

async function init() {
  currentUser = await requireAuth();
  if (!currentUser) return;

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
  });

  await Promise.all([loadWishlist(), loadSetsDropdown()]);
}

init();
