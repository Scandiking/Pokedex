/* =====================================================
   PKDEX — app.js
   Single-page Pokédex using PokéAPI (hash routing)
   ===================================================== */

'use strict';

// ---- CONSTANTS ----
const API          = 'https://pokeapi.co/api/v2';
const TOTAL        = 1025; // Gen 1-9 (National Dex)
const TYPES        = ['normal','fire','water','electric','grass','ice','fighting',
                      'poison','ground','flying','psychic','bug','rock','ghost',
                      'dragon','dark','steel','fairy'];
const STAT_LABELS  = { hp:'HP', attack:'ATK', defense:'DEF',
                        'special-attack':'SP.ATK', 'special-defense':'SP.DEF', speed:'SPD' };
const GEN_RANGES   = {
  1:[1,151], 2:[152,251], 3:[252,386], 4:[387,493], 5:[494,649],
  6:[650,721], 7:[722,809], 8:[810,905], 9:[906,1025]
};
const GEN_LABELS   = {
  1:'GEN I', 2:'GEN II', 3:'GEN III', 4:'GEN IV', 5:'GEN V',
  6:'GEN VI', 7:'GEN VII', 8:'GEN VIII', 9:'GEN IX'
};
const SORT_OPTIONS = [
  { key:'id',               label:'NO.'    },
  { key:'name',             label:'NAME'   },
  { key:'bst',              label:'BST'    },
  { key:'hp',               label:'HP'     },
  { key:'attack',           label:'ATK'    },
  { key:'defense',          label:'DEF'    },
  { key:'special-attack',   label:'SP.ATK' },
  { key:'special-defense',  label:'SP.DEF' },
  { key:'speed',            label:'SPD'    },
  { key:'height',           label:'HEIGHT' },
  { key:'weight',           label:'WEIGHT' },
];
const GAME_NAMES   = {
  'red-blue':'Red/Blue','yellow':'Yellow','gold-silver':'Gold/Silver','crystal':'Crystal',
  'ruby-sapphire':'Ruby/Sapphire','emerald':'Emerald','firered-leafgreen':'FR/LG',
  'diamond-pearl':'Diamond/Pearl','platinum':'Platinum','heartgold-soulsilver':'HG/SS',
  'black-white':'Black/White','black-2-white-2':'B2/W2','x-y':'X/Y',
  'omega-ruby-alpha-sapphire':'OR/AS','sun-moon':'Sun/Moon',
  'ultra-sun-ultra-moon':'US/UM','sword-shield':'Sw/Sh',
  'scarlet-violet':'Sc/Vi'
};

// ---- API CACHE ----
// Two-layer cache: in-memory (session) + localStorage (persistent, 48 h TTL).
// Required by PokéAPI fair use policy: "locally cache resources whenever you request them."
const _cache   = new Map();
const _LS_PFX  = 'pkdex:v1:';
const _CACHE_TTL = 48 * 60 * 60 * 1000; // 48 hours

function _lsGet(url) {
  try {
    const raw = localStorage.getItem(_LS_PFX + url);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > _CACHE_TTL) { localStorage.removeItem(_LS_PFX + url); return null; }
    return data;
  } catch { return null; }
}

function _lsSet(url, data) {
  try {
    localStorage.setItem(_LS_PFX + url, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // Quota exceeded — prune oldest pkdex entries and retry once
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(_LS_PFX));
      keys.sort((a, b) => {
        const ta = JSON.parse(localStorage.getItem(a) || '{}').ts || 0;
        const tb = JSON.parse(localStorage.getItem(b) || '{}').ts || 0;
        return ta - tb;
      });
      keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
      localStorage.setItem(_LS_PFX + url, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* give up — in-memory cache still works */ }
  }
}

async function apiFetch(url) {
  if (_cache.has(url)) return _cache.get(url);
  const persisted = _lsGet(url);
  if (persisted) { _cache.set(url, persisted); return persisted; }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = await res.json();
  _cache.set(url, data);
  _lsSet(url, data);
  return data;
}

const getPokemon    = id   => apiFetch(`${API}/pokemon/${id}`);
const getSpecies    = id   => apiFetch(`${API}/pokemon-species/${id}`);
const getEvolution  = url  => apiFetch(url);
const getType       = name => apiFetch(`${API}/type/${name}`);
const getAbility    = url  => apiFetch(url);
const getMove       = name => apiFetch(`${API}/move/${name}`);
const getAllPokemon  = ()   => apiFetch(`${API}/pokemon?limit=${TOTAL}&offset=0`);

// ---- ROUTER ----
function parseRoute() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  if (hash === '/' || hash === '') return { page: 'home' };
  if (hash.startsWith('/pokemon/')) {
    const id = hash.split('/')[2];
    return { page: 'pokemon', id };
  }
  if (hash.startsWith('/about'))  return { page: 'about' };
  if (hash.startsWith('/filter')) {
    const qs = hash.includes('?') ? hash.split('?')[1] : '';
    const p  = new URLSearchParams(qs);
    return { page: 'filter', types: p.getAll('type') };
  }
  if (hash.startsWith('/search')) {
    const qs = hash.includes('?') ? hash.split('?')[1] : '';
    const p  = new URLSearchParams(qs);
    return {
      page:  'search',
      query: p.get('q') || '',
      types: p.getAll('type'),
    };
  }
  return { page: '404' };
}

function navigate(hash) {
  window.location.hash = hash;
}

async function router() {
  const route = parseRoute();
  const app   = document.getElementById('app');

  // Highlight active nav link
  document.querySelectorAll('.nav-link').forEach(a => {
    const page = a.dataset.page;
    a.classList.toggle('active',
      (page === 'home'   && route.page === 'home')   ||
      (page === 'search' && route.page === 'search') ||
      (page === 'filter' && route.page === 'filter') ||
      (page === 'about'  && route.page === 'about')
    );
  });

  app.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    switch (route.page) {
      case 'home':    await renderHome(app);               break;
      case 'search':  await renderSearch(app, route);      break;
      case 'filter':  await renderFilter(app, route);       break;
      case 'about':   renderAbout(app);                    break;
      case 'pokemon': await renderPokemon(app, route.id);  break;
      default:
        app.innerHTML = errorBox('404', 'Page not found.', '#/');
    }
  } catch (err) {
    console.error(err);
    app.innerHTML = errorBox('ERROR', err.message, '#/');
  }
}

window.addEventListener('hashchange', router);

// ---- UTIL ----
function setLoading(app, msg = 'LOADING...') {
  app.innerHTML = `
    <div class="loading-screen">
      <div class="pokeball-anim">
        <div class="pb-top"></div>
        <div class="pb-band"><div class="pb-button"></div></div>
        <div class="pb-bottom"></div>
      </div>
      <p class="loading-text">${msg}<span class="blink">_</span></p>
    </div>`;
}

function errorBox(code, msg, backHref = '#/') {
  return `
    <div class="error-box fade-in">
      <h2>// ${code} //</h2>
      <p>${msg}</p>
      <a href="${backHref}" class="btn btn-primary">← RETURN</a>
    </div>`;
}

function padId(id) { return String(id).padStart(4, '0'); }

function officialArt(sprites) {
  return sprites?.other?.['official-artwork']?.front_default
      || sprites?.front_default
      || '';
}

function shinyArt(sprites) {
  return sprites?.other?.['official-artwork']?.front_shiny || '';
}

function evolveTriggerLabel(details) {
  if (!details) return '';
  if (details.min_level) return `LV.${details.min_level}`;
  if (details.item)       return details.item.name.replace(/-/g, ' ').toUpperCase();
  if (details.held_item)  return details.held_item.name.replace(/-/g, ' ').toUpperCase();
  if (details.min_happiness) return 'HAPPINESS';
  if (details.min_affection) return 'AFFECTION';
  if (details.min_beauty)    return 'BEAUTY';
  if (details.known_move)    return details.known_move.name.replace(/-/g, ' ').toUpperCase();
  if (details.trigger?.name === 'trade') return 'TRADE';
  if (details.trigger?.name === 'level-up') return 'LEVEL UP';
  if (details.trigger?.name === 'use-item' && details.item)
    return details.item.name.replace(/-/g, ' ').toUpperCase();
  return details.trigger?.name?.toUpperCase().replace(/-/g, ' ') || '';
}

// ---- POKEMON CARD ----
function pokemonCard(p, idx = 0) {
  const type  = p.types[0].type.name;
  const img   = officialArt(p.sprites);
  const name  = p.name.replace(/-/g, ' ').toUpperCase();
  const delay = Math.min(idx * 0.055, 0.55).toFixed(3);
  return `
    <div class="poke-card" data-type="${type}"
         style="animation: cardEnter 0.45s ease ${delay}s both"
         onclick="navigate('#/pokemon/${p.id}')" role="button" tabindex="0"
         onkeydown="if(event.key==='Enter')navigate('#/pokemon/${p.id}')">
      <div class="poke-card-number">#${padId(p.id)}</div>
      <div class="poke-card-img-wrap">
        <img src="${img}" alt="${name}" class="poke-card-img" loading="lazy">
      </div>
      <div class="poke-card-name">${name}</div>
      <div class="poke-card-types">
        ${p.types.map(t => typeBadge(t.type.name)).join('')}
      </div>
    </div>`;
}

function typeBadge(type, large = false) {
  return `<span class="type-badge type-${type}${large ? ' large' : ''}"
    style="cursor:pointer;"
    onclick="event.stopPropagation();navigate('#/filter?type=${type}')"
    title="Browse ${type} type">${type.toUpperCase()}</span>`;
}

// ---- HOME PAGE ----
async function renderHome(app) {
  setLoading(app, 'BOOTING POKÉDEX');

  // 3 unique random IDs
  const ids = new Set();
  while (ids.size < 3) ids.add(Math.floor(Math.random() * TOTAL) + 1);

  const mons = await Promise.all([...ids].map(id => getPokemon(id)));

  app.innerHTML = `
    <div class="fade-in">
      <div class="home-hero">
        <h1 class="hero-title">
          <span class="pk">PK</span><span class="dex">DEX</span>
        </h1>
        <p class="hero-sub">// UNIT SCAN READY — SELECT A POKÉMON TO IDENTIFY //</p>
      </div>

      <p class="section-title" style="text-align:center;margin-bottom:24px;">
        TODAY'S FEATURED UNITS
      </p>

      <div class="featured-grid">
        ${mons.map((p, i) => pokemonCard(p, i)).join('')}
      </div>

      <div class="home-actions">
        <a href="#/search" class="btn btn-primary">BROWSE ALL ${TOTAL} POKÉMON</a>
        <a href="#/filter" class="btn btn-secondary">ADVANCED FILTER</a>
      </div>
    </div>`;
}

// ---- SEARCH / FILTER PAGE ----
let _allPokemon = null;

async function renderSearch(app, route) {
  setLoading(app, 'LOADING DATABASE');

  if (!_allPokemon) {
    const data = await getAllPokemon();
    // Store with extracted numeric IDs
    _allPokemon = data.results.map(p => {
      const id = parseInt(p.url.split('/').filter(Boolean).pop(), 10);
      return { name: p.name, id };
    });
  }

  const initQuery  = route.query || '';
  const initTypes  = route.types || [];

  app.innerHTML = `
    <div class="search-page fade-in">
      <h2 class="section-title" style="margin-bottom:24px;">// POKÉMON DATABASE //</h2>

      <div class="search-header">
        <div class="search-bar-wrap">
          <input type="text" id="search-input" class="search-input"
                 placeholder="SEARCH BY NAME OR NUMBER..."
                 value="${initQuery}" autocomplete="off" spellcheck="false">
          <button id="search-go">SCAN</button>
        </div>

        <div style="margin-bottom:16px;">
          <p class="filter-label" style="margin-bottom:8px;">FILTER BY TYPE:</p>
          <div class="type-filter-grid">
            ${TYPES.map(t => `
              <button class="type-filter-btn type-${t}${initTypes.includes(t) ? ' active' : ''}"
                      data-type="${t}">${t.toUpperCase()}</button>
            `).join('')}
          </div>
        </div>
      </div>

      <p class="search-info" id="search-info"></p>
      <div class="pokemon-grid" id="search-results">
        <div class="loading-inline">SCANNING<span class="blink">_</span></div>
      </div>
    </div>`;

  // State
  let selectedTypes = [...initTypes];
  let currentPage   = 0;
  const PAGE_SIZE   = 60;
  let currentResults = [];

  // Type filter buttons
  document.querySelectorAll('.type-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.type;
      if (selectedTypes.includes(t)) {
        selectedTypes = selectedTypes.filter(x => x !== t);
        btn.classList.remove('active');
      } else {
        selectedTypes.push(t);
        btn.classList.add('active');
      }
      doSearch();
    });
  });

  document.getElementById('search-go').addEventListener('click', doSearch);
  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });

  async function doSearch() {
    const q = document.getElementById('search-input').value.trim().toLowerCase();
    const results = document.getElementById('search-results');
    const info    = document.getElementById('search-info');
    results.innerHTML = `<div class="loading-inline">SCANNING<span class="blink">_</span></div>`;
    currentPage = 0;

    // Filter by name / number first (cheap, client-side)
    let filtered = _allPokemon;
    if (q) {
      const asNum = parseInt(q, 10);
      filtered = filtered.filter(p =>
        p.name.includes(q) || p.id === asNum
      );
    }

    // If type filters active, use the type API endpoint to get exact lists
    if (selectedTypes.length > 0) {
      const typeData = await Promise.all(selectedTypes.map(t => getType(t)));
      const typeSets = typeData.map(td =>
        new Set(
          td.pokemon
            .map(e => parseInt(e.pokemon.url.split('/').filter(Boolean).pop(), 10))
            .filter(id => id >= 1 && id <= TOTAL)
        )
      );
      // Intersect: pokemon must have ALL selected types
      const validIds = new Set([...typeSets[0]].filter(id => typeSets.every(s => s.has(id))));
      // Also apply any name/number search
      currentResults = filtered.filter(p => validIds.has(p.id));
    } else {
      currentResults = filtered; // just metadata for now, fetch on render
    }

    info.textContent = `FOUND: ${currentResults.length} UNIT${currentResults.length !== 1 ? 'S' : ''}`;
    await renderPage(results, 0);
  }

  async function renderPage(container, page) {
    const start = page * PAGE_SIZE;
    const slice = currentResults.slice(start, start + PAGE_SIZE);

    if (slice.length === 0) {
      container.innerHTML = `<p class="no-results">// NO POKÉMON FOUND //</p>`;
      return;
    }

    // Results are lightweight {name, id} objects — fetch full data for display
    let mons;
    if (slice[0]?.sprites) {
      mons = slice;
    } else {
      mons = await Promise.all(slice.map(p => getPokemon(p.id).catch(() => null)));
      mons = mons.filter(Boolean);
    }

    const cards = mons.map((p, i) => pokemonCard(p, i)).join('');
    const loadMore = currentResults.length > start + PAGE_SIZE
      ? `<div class="load-more-wrap">
           <button class="btn btn-secondary" id="load-more">
             LOAD MORE (${currentResults.length - start - PAGE_SIZE} REMAINING)
           </button>
         </div>`
      : '';

    if (page === 0) {
      container.innerHTML = cards + loadMore;
    } else {
      const lmWrap = container.querySelector('.load-more-wrap');
      if (lmWrap) lmWrap.remove();
      container.insertAdjacentHTML('beforeend', cards + loadMore);
    }

    document.getElementById('load-more')?.addEventListener('click', () => {
      currentPage++;
      renderPage(container, currentPage);
    });
  }

  // Initial render
  doSearch();
}

// ---- POKEMON DETAIL PAGE ----
async function renderPokemon(app, id) {
  setLoading(app, `SCANNING UNIT #${id}`);

  const [pokemon, species] = await Promise.all([
    getPokemon(id),
    getSpecies(id).catch(() => null)
  ]);

  const mainType  = pokemon.types[0].type.name;
  const imgNormal = officialArt(pokemon.sprites);
  const imgShiny  = shinyArt(pokemon.sprites);
  const name      = pokemon.name.replace(/-/g, ' ').toUpperCase();

  // --- species data ---
  const genus = species?.genera?.find(g => g.language.name === 'en')?.genus || '';
  const genderRate = species?.gender_rate ?? -2;
  let genderStr = 'UNKNOWN';
  if (genderRate === -1) genderStr = 'GENDERLESS';
  else if (genderRate >= 0) {
    const femPct = (genderRate / 8 * 100).toFixed(1);
    genderStr = `♂ ${(100 - parseFloat(femPct)).toFixed(1)}%  ♀ ${femPct}%`;
  }

  // --- flavor texts (unique, English, up to 10) ---
  const seen = new Set();
  const flavors = [];
  if (species) {
    // prefer newest games first
    for (const entry of [...species.flavor_text_entries].reverse()) {
      if (entry.language.name !== 'en') continue;
      const clean = entry.flavor_text.replace(/\f|\n|\u00ad/g, ' ').replace(/\s+/g, ' ').trim();
      if (seen.has(clean)) continue;
      seen.add(clean);
      const game = GAME_NAMES[entry.version.name] || entry.version.name;
      flavors.push({ game, text: clean });
      if (flavors.length >= 10) break;
    }
  }

  // --- type effectiveness ---
  const typeData      = await Promise.all(pokemon.types.map(t => getType(t.type.name)));
  const effectiveness = calcEffectiveness(typeData);

  // --- render ---
  app.innerHTML = `
    <div class="pokemon-page fade-in" data-type="${mainType}">

      <div class="poke-topbar">
        <a href="#/search" class="back-btn">← BACK TO SEARCH</a>
        <span class="poke-id-display">NO. ${padId(pokemon.id)}</span>
        <div class="poke-nav-arrows">
          ${pokemon.id > 1
            ? `<a href="#/pokemon/${pokemon.id - 1}" class="poke-nav-arrow">◄ #${pokemon.id - 1}</a>` : ''}
          ${pokemon.id < TOTAL
            ? `<a href="#/pokemon/${pokemon.id + 1}" class="poke-nav-arrow">#${pokemon.id + 1} ►</a>` : ''}
        </div>
      </div>

      <div class="poke-main">
        <!-- LEFT: art + quick stats -->
        <div class="poke-left">
          <div class="poke-sprite-container">
            <span class="poke-sprite-zoom-hint">⊕ ZOOM</span>
            <img id="poke-sprite" src="${imgNormal}" alt="${name}" class="poke-sprite">
            ${imgShiny
              ? `<button class="shiny-toggle" id="shiny-btn">✦ SHINY</button>` : ''}
          </div>

          <div class="poke-types">
            ${pokemon.types.map(t => typeBadge(t.type.name, true)).join('')}
          </div>

          <div class="poke-quick-info">
            <div class="quick-info-item">
              <span class="qi-label">HEIGHT</span>
              <span class="qi-value">${(pokemon.height / 10).toFixed(1)} m</span>
            </div>
            <div class="quick-info-item">
              <span class="qi-label">WEIGHT</span>
              <span class="qi-value">${(pokemon.weight / 10).toFixed(1)} kg</span>
            </div>
            <div class="quick-info-item">
              <span class="qi-label">BASE EXP</span>
              <span class="qi-value">${pokemon.base_experience ?? '???'}</span>
            </div>
            <div class="quick-info-item">
              <span class="qi-label">CAPTURE RATE</span>
              <span class="qi-value">${species?.capture_rate ?? '???'}</span>
            </div>
          </div>
        </div>

        <!-- RIGHT: name, meta, stats, abilities -->
        <div class="poke-right">
          <h1 class="poke-name">${name}</h1>
          ${genus ? `<p class="poke-genus">${genus}</p>` : ''}

          ${species ? `
          <div class="poke-meta-grid" style="margin-top:16px;">
            <div class="poke-meta-item">
              <span class="poke-meta-label">GROWTH RATE</span>
              <span class="poke-meta-value">${species.growth_rate?.name?.replace(/-/g,' ').toUpperCase() ?? '???'}</span>
            </div>
            <div class="poke-meta-item">
              <span class="poke-meta-label">GENDER</span>
              <span class="poke-meta-value">${genderStr}</span>
            </div>
            <div class="poke-meta-item">
              <span class="poke-meta-label">EGG GROUPS</span>
              <span class="poke-meta-value">${species.egg_groups?.map(e => e.name.replace(/-/g,' ').toUpperCase()).join(' · ') || '???'}</span>
            </div>
            <div class="poke-meta-item">
              <span class="poke-meta-label">BASE FRIENDSHIP</span>
              <span class="poke-meta-value">${species.base_happiness ?? '???'}</span>
            </div>
            ${species.is_legendary ? `
            <div class="poke-meta-item" style="grid-column:1/-1">
              <span class="poke-meta-value legendary">★ LEGENDARY POKÉMON</span>
            </div>` : ''}
            ${species.is_mythical ? `
            <div class="poke-meta-item" style="grid-column:1/-1">
              <span class="poke-meta-value mythical">★ MYTHICAL POKÉMON</span>
            </div>` : ''}
          </div>` : ''}

          <!-- STATS -->
          <div class="poke-section">
            <h3 class="section-header">// BASE STATS //</h3>
            <div class="stats-grid">
              ${pokemon.stats.map(s => statBar(s.stat.name, s.base_stat)).join('')}
              <div class="stat-row total">
                <span class="stat-name">TOTAL</span>
                <span class="stat-value">${pokemon.stats.reduce((a, s) => a + s.base_stat, 0)}</span>
                <div class="stat-bar-wrap"></div>
              </div>
            </div>
          </div>

          <!-- ABILITIES -->
          <div class="poke-section">
            <h3 class="section-header">// ABILITIES //</h3>
            <div class="abilities-list" id="abilities-list">
              ${pokemon.abilities.map(a => `
                <div class="ability-item${a.is_hidden ? ' hidden-ability' : ''}"
                     data-ability-url="${a.ability.url}">
                  <span class="ability-name">
                    ${a.ability.name.replace(/-/g, ' ').toUpperCase()}
                  </span>
                  ${a.is_hidden ? '<span class="hidden-tag">HIDDEN</span>' : ''}
                  <div class="ability-desc" id="ability-desc-${a.ability.name}">
                    <span class="blink">LOADING_</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- BIO -->
      <div class="poke-section full-width" id="bio-section" style="display:none">
        <h3 class="section-header">// SYNTHESIZED BIO //</h3>
        <div class="poke-bio" id="bio-text"><span class="blink">GENERATING_</span></div>
      </div>

      <!-- FLAVOR TEXTS -->
      ${flavors.length ? `
      <div class="poke-section full-width">
        <h3 class="section-header">// POKÉDEX ENTRIES //</h3>
        <div class="flavor-list">
          ${flavors.map(f => `
            <div class="flavor-entry">
              <span class="flavor-game">${f.game}</span>
              <p class="flavor-text">${f.text}</p>
            </div>
          `).join('')}
        </div>
      </div>` : ''}

      <!-- TYPE CHART -->
      <div class="poke-section full-width">
        <h3 class="section-header">// TYPE EFFECTIVENESS //</h3>
        ${renderTypeChart(effectiveness)}
      </div>

      <!-- EVOLUTION CHAIN -->
      <div class="poke-section full-width" id="evo-section">
        <h3 class="section-header">// EVOLUTION CHAIN //</h3>
        <div class="loading-inline" id="evo-container">LOADING EVOLUTIONS<span class="blink">_</span></div>
      </div>

      <!-- MOVES -->
      <div class="poke-section full-width">
        <h3 class="section-header">// MOVES //</h3>
        ${renderMoves(pokemon.moves)}
      </div>

    </div>`;

  // -- Animate stat bars --
  requestAnimationFrame(() => {
    document.querySelectorAll('.stat-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.pct + '%';
    });
  });

  // -- Sprite click → lightbox --
  document.querySelector('.poke-sprite-container').addEventListener('click', e => {
    if (e.target.closest('.shiny-toggle')) return;
    const src = document.getElementById('poke-sprite').src;
    openLightbox(src, name);
  });

  // -- Shiny toggle --
  if (imgShiny) {
    let shiny = false;
    document.getElementById('shiny-btn').addEventListener('click', () => {
      shiny = !shiny;
      document.getElementById('poke-sprite').src = shiny ? imgShiny : imgNormal;
      document.getElementById('shiny-btn').classList.toggle('active', shiny);
    });
  }

  // -- Ability descriptions (click to expand) --
  setupAbilities(pokemon.abilities);

  // -- Move tabs & clickable move details --
  setupMoveTabs();
  setupMoveClicks();

  // -- Evolution chain (async, non-blocking) --
  if (species?.evolution_chain?.url) {
    loadEvolutionChain(species.evolution_chain.url, pokemon.id);
  } else {
    document.getElementById('evo-section').style.display = 'none';
  }

  // -- Bio (async, non-blocking) --
  if (flavors.length) {
    const bioSection = document.getElementById('bio-section');
    const bioText    = document.getElementById('bio-text');
    bioSection.style.display = '';
    fetchBio(name, flavors.map(f => f.text)).then(bio => {
      bioText.textContent = bio;
    }).catch(() => {
      bioSection.style.display = 'none';
    });
  }
}

// ---- STAT BAR ----
function statBar(name, value) {
  const pct = Math.round((value / 255) * 100);
  const color = value < 50 ? '#ff4444' : value < 80 ? '#ffaa00' : value < 120 ? '#44cc77' : '#00ccff';
  const label = STAT_LABELS[name] || name.toUpperCase();
  return `
    <div class="stat-row">
      <span class="stat-name">${label}</span>
      <span class="stat-value">${value}</span>
      <div class="stat-bar-wrap">
        <div class="stat-bar-fill" data-pct="${pct}" style="width:0%;background:${color}"></div>
      </div>
    </div>`;
}

// ---- TYPE EFFECTIVENESS ----
function calcEffectiveness(typeDataArr) {
  const mult = {};
  TYPES.forEach(t => { mult[t] = 1; });
  typeDataArr.forEach(td => {
    td.damage_relations.double_damage_from.forEach(t => { mult[t.name] *= 2; });
    td.damage_relations.half_damage_from.forEach(t => { mult[t.name] *= 0.5; });
    td.damage_relations.no_damage_from.forEach(t => { mult[t.name] *= 0; });
  });
  return mult;
}

function renderTypeChart(eff) {
  const groups = { '4': [], '2': [], '0.5': [], '0.25': [], '0': [] };
  Object.entries(eff).forEach(([type, m]) => {
    if (m === 4)    groups['4'].push(type);
    else if (m === 2)   groups['2'].push(type);
    else if (m === 0.5) groups['0.5'].push(type);
    else if (m === 0.25)groups['0.25'].push(type);
    else if (m === 0)   groups['0'].push(type);
  });

  const rows = [
    { key: '4',    label: 'WEAK  ×4',  cls: 'weak'   },
    { key: '2',    label: 'WEAK  ×2',  cls: 'weak'   },
    { key: '0.5',  label: 'RESIST ×½', cls: 'resist' },
    { key: '0.25', label: 'RESIST ×¼', cls: 'resist' },
    { key: '0',    label: 'IMMUNE ×0', cls: 'immune' },
  ].filter(r => groups[r.key].length > 0);

  if (!rows.length) return '<p style="color:var(--text-dim);font-size:16px;">No notable type interactions.</p>';

  return `<div class="type-chart">
    ${rows.map(r => `
      <div class="type-chart-row">
        <span class="type-chart-label ${r.cls}">${r.label}</span>
        <div class="type-chart-types">
          ${groups[r.key].map(t => typeBadge(t)).join('')}
        </div>
      </div>`).join('')}
  </div>`;
}

// ---- ABILITIES ----
async function setupAbilities(abilities) {
  document.querySelectorAll('.ability-item').forEach((el, i) => {
    const a   = abilities[i];
    const url = a.ability.url;
    const descId = `ability-desc-${a.ability.name}`;

    el.addEventListener('click', async () => {
      el.classList.toggle('expanded');
      if (el.classList.contains('expanded')) {
        const descEl = document.getElementById(descId);
        if (descEl.dataset.loaded) return;
        descEl.dataset.loaded = '1';
        try {
          const data = await getAbility(url);
          const entry = data.effect_entries?.find(e => e.language.name === 'en');
          const short = data.flavor_text_entries?.find(e => e.language.name === 'en');
          descEl.textContent = entry?.short_effect || short?.flavor_text || 'No description available.';
        } catch {
          descEl.textContent = 'Could not load description.';
        }
      }
    });
  });
}

// ---- EVOLUTION CHAIN ----
function parseChain(node) {
  const id = parseInt(node.species.url.split('/').filter(Boolean).pop(), 10);
  return {
    id,
    name: node.species.name,
    details: node.evolution_details[0] || null,
    next: node.evolves_to.map(parseChain)
  };
}

async function loadEvolutionChain(url, currentId) {
  const container = document.getElementById('evo-container');
  if (!container) return;
  try {
    const chainData = await getEvolution(url);
    const tree      = parseChain(chainData.chain);

    // Collect all unique IDs in the tree
    const allIds = [];
    (function collect(node) {
      allIds.push(node.id);
      node.next.forEach(collect);
    })(tree);

    // Fetch sprites for all nodes
    const sprites = {};
    const fetched = await Promise.all(allIds.map(id => getPokemon(id).catch(() => null)));
    allIds.forEach((id, i) => { if (fetched[i]) sprites[id] = fetched[i]; });

    function stageHTML(node) {
      const p     = sprites[node.id];
      const spr   = p?.sprites?.front_default || '';
      const isCur = node.id === parseInt(currentId, 10);
      return `
        <div class="evo-stage${isCur ? ' current' : ''}"
             onclick="navigate('#/pokemon/${node.id}')"
             role="button" tabindex="0"
             onkeydown="if(event.key==='Enter')navigate('#/pokemon/${node.id}')">
          <img src="${spr}" alt="${node.name}" class="evo-sprite">
          <span class="evo-name">${node.name.replace(/-/g,' ').toUpperCase()}</span>
        </div>`;
    }

    function arrowHTML(node) {
      const label = evolveTriggerLabel(node.details);
      return `
        <div class="evo-arrow">
          <span class="evo-trigger">${label}</span>
          <span>→</span>
        </div>`;
    }

    // Render the chain — supports branching (Eevee, etc.)
    function chainHTML(node) {
      if (node.next.length === 0) return stageHTML(node);
      if (node.next.length === 1) {
        return stageHTML(node) + arrowHTML(node.next[0]) + chainHTML(node.next[0]);
      }
      // Branching
      return stageHTML(node) +
        `<div class="evo-branches">
          ${node.next.map(n => `
            <div class="evo-branch">
              ${arrowHTML(n)}
              ${chainHTML(n)}
            </div>`).join('')}
        </div>`;
    }

    container.className = 'evo-chain-wrap fade-in';
    container.innerHTML = chainHTML(tree);
  } catch (err) {
    container.innerHTML = `<p style="color:var(--text-dim);font-family:'Share Tech Mono',monospace;font-size:13px;">Could not load evolution chain.</p>`;
  }
}

// ---- FILTER PAGE ----
async function renderFilter(app, route = {}) {
  setLoading(app, 'LOADING FILTER');

  if (!_allPokemon) {
    const data = await getAllPokemon();
    _allPokemon = data.results.map(p => ({
      name: p.name,
      id: parseInt(p.url.split('/').filter(Boolean).pop(), 10)
    }));
  }

  const STAT_FILTERS = [
    { key: 'bst',             label: 'TOTAL BST', max: 780 },
    { key: 'hp',              label: 'HP',        max: 255 },
    { key: 'attack',          label: 'ATK',       max: 190 },
    { key: 'defense',         label: 'DEF',       max: 250 },
    { key: 'special-attack',  label: 'SP.ATK',    max: 194 },
    { key: 'special-defense', label: 'SP.DEF',    max: 250 },
    { key: 'speed',           label: 'SPD',       max: 200 },
  ];

  app.innerHTML = `
    <div class="filter-page fade-in">
      <h2 class="section-title" style="margin-bottom:8px;">// ADVANCED FILTER //</h2>
      <p style="font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--text-dim);
                letter-spacing:1px;margin-bottom:24px;">
        NARROW BY GENERATION FIRST FOR FASTER RESULTS. STAT FILTERS REQUIRE FETCHING FULL DATA.
      </p>

      <div class="filter-panel">

        <!-- GENERATION -->
        <div>
          <p class="filter-section-title">GENERATION</p>
          <div class="gen-buttons">
            <button class="gen-btn active" data-gen="0">ALL (${TOTAL})</button>
            ${[1,2,3,4,5,6,7,8,9].map(g => {
              const [lo, hi] = GEN_RANGES[g];
              return `<button class="gen-btn" data-gen="${g}">${GEN_LABELS[g]} (#${lo}–${hi})</button>`;
            }).join('')}
          </div>
        </div>

        <!-- TYPE -->
        <div>
          <p class="filter-section-title">TYPE <span style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text-dim);font-weight:normal;">(MAX 2)</span></p>
          <div class="type-filter-grid">
            ${TYPES.map(t => `
              <button class="type-filter-btn type-${t}${(route.types||[]).includes(t) ? ' active' : ''}" data-type="${t}">${t.toUpperCase()}</button>
            `).join('')}
          </div>
        </div>

        <!-- BASE STATS -->
        <div>
          <p class="filter-section-title">BASE STATS</p>
          <div class="stat-ranges-grid">
            ${STAT_FILTERS.map(s => `
              <div class="range-row">
                <span class="range-label">${s.label}</span>
                <input type="number" class="range-input" data-stat="${s.key}" data-bound="min"
                       placeholder="MIN" min="0" max="${s.max}">
                <span class="range-sep">—</span>
                <input type="number" class="range-input" data-stat="${s.key}" data-bound="max"
                       placeholder="MAX" min="0" max="${s.max}">
              </div>`).join('')}
          </div>
        </div>

        <!-- PHYSICAL -->
        <div>
          <p class="filter-section-title">PHYSICAL</p>
          <div class="stat-ranges-grid">
            <div class="range-row">
              <span class="range-label">HEIGHT (m)</span>
              <input type="number" class="range-input" data-stat="height" data-bound="min"
                     placeholder="MIN" min="0" max="20" step="0.1">
              <span class="range-sep">—</span>
              <input type="number" class="range-input" data-stat="height" data-bound="max"
                     placeholder="MAX" min="0" max="20" step="0.1">
            </div>
            <div class="range-row">
              <span class="range-label">WEIGHT (kg)</span>
              <input type="number" class="range-input" data-stat="weight" data-bound="min"
                     placeholder="MIN" min="0" max="1000" step="0.1">
              <span class="range-sep">—</span>
              <input type="number" class="range-input" data-stat="weight" data-bound="max"
                     placeholder="MAX" min="0" max="1000" step="0.1">
            </div>
          </div>
        </div>

        <!-- SORT -->
        <div>
          <p class="filter-section-title">SORT BY</p>
          <div class="sort-row">
            ${SORT_OPTIONS.map((s, i) => `
              <button class="sort-btn${i === 0 ? ' active' : ''}" data-sort="${s.key}">${s.label}</button>
            `).join('')}
            <button class="sort-dir-btn" id="sort-dir">▲ ASC</button>
          </div>
        </div>

        <button class="btn btn-primary" id="apply-filter" style="width:100%;">
          ▶ APPLY FILTERS
        </button>
      </div>

      <div id="filter-progress" style="display:none;" class="filter-progress">
        <span id="fp-text">FETCHING DATA...</span>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" id="fp-bar" style="width:0%"></div>
        </div>
      </div>

      <p class="search-info" id="filter-info"></p>
      <div class="pokemon-grid" id="filter-results"></div>
    </div>`;

  // ---- State ----
  let selectedGen   = 0;
  let selectedTypes = [...(route.types || [])];
  let sortKey       = 'id';
  let sortDir       = 'asc';

  // Gen buttons
  document.querySelectorAll('.gen-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gen-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedGen = parseInt(btn.dataset.gen, 10);
    });
  });

  // Type buttons (max 2 selected at once)
  document.querySelectorAll('.type-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.type;
      if (selectedTypes.includes(t)) {
        selectedTypes = selectedTypes.filter(x => x !== t);
        btn.classList.remove('active');
      } else if (selectedTypes.length < 2) {
        selectedTypes.push(t);
        btn.classList.add('active');
      }
    });
  });

  // Sort buttons
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sortKey = btn.dataset.sort;
    });
  });

  const sortDirBtn = document.getElementById('sort-dir');
  sortDirBtn.addEventListener('click', () => {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    sortDirBtn.textContent = sortDir === 'asc' ? '▲ ASC' : '▼ DESC';
  });

  document.getElementById('apply-filter').addEventListener('click', applyFilter);

  function getRanges() {
    const ranges = {};
    document.querySelectorAll('.range-input').forEach(inp => {
      const val = parseFloat(inp.value);
      if (isNaN(val)) return;
      const stat = inp.dataset.stat;
      if (!ranges[stat]) ranges[stat] = {};
      ranges[stat][inp.dataset.bound] = val;
    });
    return ranges;
  }

  async function applyFilter() {
    const resultsEl  = document.getElementById('filter-results');
    const infoEl     = document.getElementById('filter-info');
    const progressEl = document.getElementById('filter-progress');
    const fpText     = document.getElementById('fp-text');
    const fpBar      = document.getElementById('fp-bar');
    const ranges     = getRanges();

    resultsEl.innerHTML = '';
    infoEl.textContent  = '';
    progressEl.style.display = 'block';
    fpBar.style.width = '0%';

    // Pool by generation
    let poolIds;
    if (selectedGen === 0) {
      poolIds = _allPokemon.map(p => p.id);
    } else {
      const [lo, hi] = GEN_RANGES[selectedGen];
      poolIds = _allPokemon.filter(p => p.id >= lo && p.id <= hi).map(p => p.id);
    }

    // Batch-fetch with progress
    const BATCH = 50;
    const allFetched = [];
    for (let i = 0; i < poolIds.length; i += BATCH) {
      const batch   = poolIds.slice(i, i + BATCH);
      const fetched = await Promise.all(batch.map(id => getPokemon(id).catch(() => null)));
      allFetched.push(...fetched.filter(Boolean));
      const done = Math.min(i + BATCH, poolIds.length);
      fpBar.style.width = Math.round((done / poolIds.length) * 100) + '%';
      fpText.textContent = `FETCHING ${done} / ${poolIds.length}...`;
    }
    progressEl.style.display = 'none';

    // Type filter
    let filtered = allFetched;
    if (selectedTypes.length > 0) {
      filtered = filtered.filter(p => {
        const pTypes = p.types.map(t => t.type.name);
        return selectedTypes.every(t => pTypes.includes(t));
      });
    }

    // Stat / physical range filters
    if (Object.keys(ranges).length > 0) {
      filtered = filtered.filter(p => {
        const bst = p.stats.reduce((a, s) => a + s.base_stat, 0);
        const statsMap = { bst, height: p.height / 10, weight: p.weight / 10 };
        p.stats.forEach(s => { statsMap[s.stat.name] = s.base_stat; });

        return Object.entries(ranges).every(([stat, bounds]) => {
          const val = statsMap[stat];
          if (val === undefined) return true;
          if (bounds.min !== undefined && val < bounds.min) return false;
          if (bounds.max !== undefined && val > bounds.max) return false;
          return true;
        });
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let va, vb;
      if      (sortKey === 'id')     { va = a.id;     vb = b.id; }
      else if (sortKey === 'name')   { va = a.name;   vb = b.name; }
      else if (sortKey === 'bst')    { va = a.stats.reduce((x,s)=>x+s.base_stat,0); vb = b.stats.reduce((x,s)=>x+s.base_stat,0); }
      else if (sortKey === 'height') { va = a.height; vb = b.height; }
      else if (sortKey === 'weight') { va = a.weight; vb = b.weight; }
      else {
        va = a.stats.find(s => s.stat.name === sortKey)?.base_stat ?? 0;
        vb = b.stats.find(s => s.stat.name === sortKey)?.base_stat ?? 0;
      }
      if (sortKey === 'name') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    infoEl.textContent = `FOUND: ${filtered.length} UNIT${filtered.length !== 1 ? 'S' : ''}`;
    resultsEl.innerHTML = filtered.length
      ? filtered.map((p, i) => pokemonCard(p, i)).join('')
      : `<p class="no-results">// NO POKÉMON MATCH THESE FILTERS //</p>`;
  }
}

// ---- MOVES ----
function renderMoves(moves) {
  const METHODS = ['level-up', 'machine', 'egg', 'tutor'];
  const LABELS  = { 'level-up': 'LEVEL UP', machine: 'TM / HM', egg: 'EGG MOVES', tutor: 'TUTOR' };

  // Group by learn method — use the last (most recent) version_group detail
  const groups = { 'level-up': [], machine: [], egg: [], tutor: [] };
  moves.forEach(m => {
    const latest = m.version_group_details[m.version_group_details.length - 1];
    const method = latest.move_learn_method.name;
    if (groups[method]) {
      groups[method].push({
        name:  m.move.name,
        level: latest.level_learned_at
      });
    }
  });

  groups['level-up'].sort((a, b) => a.level - b.level);
  ['machine','egg','tutor'].forEach(m => groups[m].sort((a, b) => a.name.localeCompare(b.name)));

  const active = METHODS.filter(m => groups[m].length > 0);
  if (!active.length) return '<p style="color:var(--text-dim)">No move data.</p>';

  const cols = m => m === 'level-up' ? 2 : 1;
  return `
    <div class="move-tabs">
      ${active.map((m, i) => `
        <button class="move-tab${i === 0 ? ' active' : ''}" data-method="${m}">
          ${LABELS[m]} (${groups[m].length})
        </button>`).join('')}
    </div>
    <div class="move-table-wrap">
      ${active.map((m, i) => `
        <table class="move-table${i === 0 ? ' active' : ''}" data-method="${m}">
          <thead>
            <tr>
              ${m === 'level-up' ? '<th>LVL</th>' : ''}
              <th>MOVE</th>
            </tr>
          </thead>
          <tbody>
            ${groups[m].map(mv => `
              <tr class="move-row" data-move="${mv.name}">
                ${m === 'level-up'
                  ? `<td class="move-level">${mv.level || '—'}</td>` : ''}
                <td class="move-name">
                  <span class="move-expand-icon">▶</span>
                  ${mv.name.replace(/-/g, ' ').toUpperCase()}
                </td>
              </tr>
              <tr class="move-detail-row" data-move="${mv.name}">
                <td colspan="${cols(m)}">
                  <div class="move-detail-loading">LOADING<span class="blink">_</span></div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`).join('')}
    </div>`;
}

function setupMoveTabs() {
  document.querySelectorAll('.move-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const m = tab.dataset.method;
      document.querySelectorAll('.move-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.move-table').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`.move-table[data-method="${m}"]`)?.classList.add('active');
    });
  });
}

function setupMoveClicks() {
  document.querySelectorAll('.move-row').forEach(row => {
    row.addEventListener('click', async () => {
      const moveName = row.dataset.move;
      const detailRow = document.querySelector(`.move-detail-row[data-move="${CSS.escape(moveName)}"]`);
      if (!detailRow) return;

      const icon = row.querySelector('.move-expand-icon');
      const isOpen = detailRow.classList.contains('open');

      if (isOpen) {
        detailRow.classList.remove('open');
        icon.textContent = '▶';
        return;
      }

      detailRow.classList.add('open');
      icon.textContent = '▼';

      if (detailRow.dataset.loaded) return; // already fetched

      try {
        const data = await getMove(moveName);
        const eng    = data.effect_entries?.find(e => e.language.name === 'en');
        const effect = (eng?.short_effect || '—')
          .replace(/\$effect_chance/g, data.effect_chance ?? '?');
        const type   = data.type?.name || 'normal';
        const power  = data.power  ?? '—';
        const acc    = data.accuracy != null ? data.accuracy + '%' : '—';
        const pp     = data.pp     ?? '—';
        const cls    = (data.damage_class?.name || '—').toUpperCase();
        const prio   = data.priority != null && data.priority !== 0
          ? (data.priority > 0 ? '+' : '') + data.priority : null;

        detailRow.querySelector('td').innerHTML = `
          <div class="move-detail-grid">
            ${typeBadge(type)}
            <span class="move-stat"><span class="move-stat-label">PWR</span>${power}</span>
            <span class="move-stat"><span class="move-stat-label">ACC</span>${acc}</span>
            <span class="move-stat"><span class="move-stat-label">PP</span>${pp}</span>
            <span class="move-stat"><span class="move-stat-label">CLASS</span>${cls}</span>
            ${prio ? `<span class="move-stat move-stat-priority"><span class="move-stat-label">PRIO</span>${prio}</span>` : ''}
          </div>
          <p class="move-effect-text">${effect}</p>`;
        detailRow.dataset.loaded = '1';
      } catch {
        detailRow.querySelector('td').innerHTML =
          '<span style="color:var(--text-dim);font-size:12px;">FAILED TO LOAD MOVE DATA</span>';
      }
    });
  });
}

// ---- BIO ----
const _bioCache = new Map();
async function fetchBio(pokemonName, entries) {
  if (_bioCache.has(pokemonName)) return _bioCache.get(pokemonName);
  const res = await fetch('/api/bio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: pokemonName, entries }),
  });
  if (!res.ok) throw new Error('bio api error');
  const { bio } = await res.json();
  if (!bio) throw new Error('empty bio');
  _bioCache.set(pokemonName, bio);
  return bio;
}

// ---- LIGHTBOX ----
function openLightbox(src, caption) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox-caption').textContent = caption;
  lb.classList.add('open');
  document.addEventListener('keydown', _lbKey);
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.removeEventListener('keydown', _lbKey);
}
function _lbKey(e) { if (e.key === 'Escape') closeLightbox(); }

// ---- HEADER SEARCH ----
function setupHeaderSearch() {
  const input = document.getElementById('header-search-input');
  const btn   = document.getElementById('header-search-btn');

  function go() {
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    if (/^\d+$/.test(q)) navigate(`#/pokemon/${q}`);
    else navigate(`#/search?q=${encodeURIComponent(q.toLowerCase())}`);
  }

  btn?.addEventListener('click', go);
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}

// ---- ABOUT PAGE ----
function renderAbout(app) {
  app.innerHTML = `
    <div class="about-page fade-in">
      <h2 class="section-title">// ABOUT PKDEX //</h2>
      <div class="about-card">
        <p>PKDEX is a personal side project — a Pokédex built as a portfolio piece to demonstrate front-end development skills. The retro terminal aesthetic is a deliberate stylistic choice, not a reflection of general design sensibility. For a more professional and corporate-friendly presentation of the same developer's work, see <a href="https://scandiking.github.io/TvenningsPortfolio" target="_blank" rel="noopener" class="accent-link">Tvenning's Portfolio</a> or <a href="https://landlosen.vercel.app" target="_blank" rel="noopener" class="accent-link">Landlosen</a>.</p>
        <p>It is not affiliated with, endorsed by, or connected to Nintendo, Game Freak, or The Pokémon Company in any way. All Pokémon data is sourced from the open <a href="https://pokeapi.co" target="_blank" rel="noopener" class="accent-link">PokéAPI</a>.</p>
        <p>The project is intentionally kept simple and runs entirely in the browser — no build step, no framework, no backend. Just vanilla HTML, CSS, and JavaScript deployed on Vercel.</p>
        <div class="about-stack">
          <span class="tag">VANILLA JS</span>
          <span class="tag">HASH ROUTING</span>
          <span class="tag">POKÉAPI</span>
          <span class="tag">VERCEL</span>
          <span class="tag">NO FRAMEWORK</span>
        </div>
        <p class="about-footer-note">Built by a student of IT &amp; Information Systems &mdash; showcasing practical skills in SPA architecture, API integration, and CSS design.</p>
      </div>
    </div>`;
}

// ---- INIT ----
setupHeaderSearch();

// Lightbox close wiring
document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
document.querySelector('.lightbox-backdrop')?.addEventListener('click', closeLightbox);

// Cursor flashlight glow
(function() {
  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  document.body.appendChild(glow);
  document.addEventListener('mousemove', e => {
    glow.style.left = e.clientX + 'px';
    glow.style.top  = e.clientY + 'px';
  });
})();

// Custom cursors — Unown A (default) + Wobbuffet (pointer)
// Both use dark-fill + white-outline style for consistent retro aesthetic.
(function() {
  // --- Unown A: default cursor ---
  // Letter-A silhouette, tilted 13° CCW to match Windows arrow angle.
  // Hotspot (13,3) = tip of the A after rotate(-13,16,16).
  const unownSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">' +
    '<g transform="rotate(-13,16,16)">' +
    '<path d="M16,3 L7,28 L25,28 Z" fill="white" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<rect x="9" y="19" width="14" height="3" rx="1.5" fill="white"/>' +
    '<path d="M16,3 L7,28 L25,28 Z" fill="#0e0e1c" stroke="#0e0e1c" stroke-linejoin="round"/>' +
    '<rect x="9" y="19" width="14" height="3" fill="#0e0e1c"/>' +
    '<ellipse cx="16" cy="13" rx="2.8" ry="3.2" fill="#ff3366"/>' +
    '<circle cx="15" cy="12" r="0.8" fill="white" fill-opacity="0.7"/>' +
    '</g></svg>';

  // --- Wobbuffet: pointer cursor ---
  // Body + saluting arm. Hotspot (27,2) = fingertip of the raised arm.
  // Wobbuffet is drawn facing right then mirrored so the saluting arm points upper-left,
  // matching the conventional pointer cursor direction. Hotspot (4,2) = fingertip.
  const wobbSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">' +
    '<g transform="translate(32,0) scale(-1,1)">' +
    // White halo layer
    '<ellipse cx="14" cy="20" rx="10" ry="11" fill="white"/>' +
    '<line x1="22" y1="13" x2="28" y2="2" stroke="white" stroke-width="5" stroke-linecap="round"/>' +
    '<line x1="6"  y1="16" x2="2"  y2="23" stroke="white" stroke-width="4" stroke-linecap="round"/>' +
    // Dark body
    '<ellipse cx="14" cy="20" rx="10" ry="11" fill="#0e0e1c"/>' +
    '<line x1="22" y1="13" x2="28" y2="2" stroke="#0e0e1c" stroke-width="3" stroke-linecap="round"/>' +
    '<line x1="6"  y1="16" x2="2"  y2="23" stroke="#0e0e1c" stroke-width="2.5" stroke-linecap="round"/>' +
    // Eyes
    '<circle cx="10" cy="17" r="2.5" fill="white"/>' +
    '<circle cx="18" cy="17" r="2.5" fill="white"/>' +
    '<circle cx="10" cy="17" r="1.5" fill="#0e0e1c"/>' +
    '<circle cx="18" cy="17" r="1.5" fill="#0e0e1c"/>' +
    '<circle cx="9.3" cy="16.3" r="0.6" fill="white" fill-opacity="0.7"/>' +
    '<circle cx="17.3" cy="16.3" r="0.6" fill="white" fill-opacity="0.7"/>' +
    '</g></svg>';

  const unownUrl = 'url("data:image/svg+xml;base64,' + btoa(unownSvg) + '") 13 3';
  const wobbUrl  = 'url("data:image/svg+xml;base64,' + btoa(wobbSvg)  + '") 4 2';

  const st = document.createElement('style');
  // * has specificity 0,0,0,0 — every other selector beats it, so Wobbuffet rules
  // always override Unown without needing higher specificity hacks.
  st.textContent =
    '* { cursor: ' + unownUrl + ', auto !important; }' +
    'a, button, [role="button"], label, select,' +
    '.poke-card, .nav-link, .logo, .type-badge, .type-filter-btn,' +
    '.gen-btn, .sort-btn, .sort-dir-btn, .btn, .move-row,' +
    '#search-go, #apply-filter, #sort-dir, #load-more { cursor: ' + wobbUrl + ', pointer !important; }' +
    'input, textarea { cursor: text !important; }' +
    '.poke-card-img-wrap { cursor: zoom-in !important; }' +
    '.lightbox-backdrop { cursor: zoom-out !important; }';
  document.head.appendChild(st);
})();

// ---- STARFIELD ----
(function initStarfield() {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, stars;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function mkStar() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.4 + 0.2,
      vx: (Math.random() - 0.5) * 0.12,
      vy: Math.random() * 0.18 + 0.04,
      base: Math.random() * 0.5 + 0.1,
      phase: Math.random() * Math.PI * 2,
      freq: Math.random() * 0.02 + 0.005,
    };
  }

  function reset() { resize(); stars = Array.from({ length: 200 }, mkStar); }

  let t = 0;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    t++;
    for (const s of stars) {
      const alpha = s.base + Math.sin(s.phase + t * s.freq) * 0.15;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(190,220,255,${Math.max(0.05, alpha)})`;
      ctx.fill();
      s.x += s.vx;
      s.y += s.vy;
      if (s.y > H + 2)   { s.y = -2;    s.x = Math.random() * W; }
      if (s.x < -2)      { s.x = W + 2; }
      if (s.x > W + 2)   { s.x = -2; }
    }
    requestAnimationFrame(draw);
  }

  reset();
  window.addEventListener('resize', reset);
  draw();
})();

// ---- CARD 3D TILT ----
(function initCardTilt() {
  document.addEventListener('mousemove', e => {
    const card = e.target.closest('.poke-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const dx = (e.clientX - (rect.left + rect.width  / 2)) / (rect.width  / 2);
    const dy = (e.clientY - (rect.top  + rect.height / 2)) / (rect.height / 2);
    card.style.transition = 'transform 0.06s, box-shadow 0.2s';
    card.style.transform  = `translateY(-6px) perspective(700px) rotateX(${(-dy * 9).toFixed(2)}deg) rotateY(${(dx * 9).toFixed(2)}deg)`;
  });

  document.addEventListener('mouseout', e => {
    const card = e.target.closest('.poke-card');
    if (!card || card.contains(e.relatedTarget)) return;
    card.style.transition = 'transform 0.35s, box-shadow 0.2s';
    card.style.transform  = '';
    // Clean up inline transition after it finishes
    setTimeout(() => { if (card.style.transition) card.style.transition = ''; }, 380);
  });
})();

// ---- SCROLL PARALLAX (home hero) ----
(function initParallax() {
  window.addEventListener('scroll', () => {
    const hero = document.querySelector('.home-hero');
    if (!hero) return;
    hero.style.transform = `translateY(${(window.scrollY * 0.28).toFixed(1)}px)`;
  }, { passive: true });
})();

router();
