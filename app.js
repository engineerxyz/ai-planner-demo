/*
  Logseq-ish Planner Demo v3 (UX simplification)

  Your answers:
  - Most used screen: Journal (Today)
  - Complexity pain: C (not keyboard-first enough)
  - Demo goal: C (both, but writing feel matters)

  Therefore:
  - Single-column editor as default
  - Nav + Side panel are drawers (hidden by default)
  - Query is core via inline query blocks

  Storage: localStorage only. No AI.
*/

const LS_KEY = 'logseq-ish-planner-demo:v3';
const STATUS = ['TODO', 'DOING', 'DONE'];

function todayId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nowIso() {
  return new Date().toISOString();
}

function el(id) {
  return document.getElementById(id);
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function newBlock(text = '') {
  return {
    id: crypto.randomUUID(),
    text,
    status: 'TODO',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function ensureState() {
  const existing = loadState();
  if (existing) return existing;

  const tid = todayId();
  const state = {
    ui: { currentType: 'journal', currentId: tid, panelTab: 'backlinks' },
    journals: {
      [tid]: {
        id: tid,
        title: tid,
        createdAt: nowIso(),
        blocks: [
          newBlock('오늘 무엇을 할까? #work [[ProjectX]]'),
          newBlock('Cmd+Enter 로 TODO/DOING/DONE 상태를 순환한다.'),
          newBlock('{{query status:TODO scope:current}}'),
        ],
      },
    },
    pages: {
      Dashboard: {
        id: 'Dashboard',
        title: 'Dashboard',
        createdAt: nowIso(),
        blocks: [newBlock('[[Dashboard]] 에 쿼리 블록을 모아두자.'), newBlock('{{query status:DOING scope:all}}')],
      },
    },
    views: [],
  };

  saveState(state);
  return state;
}

let state = ensureState();

function parseTags(text) {
  const tags = new Set();
  const re = /(^|\s)#([a-zA-Z0-9_\-가-힣]+)/g;
  let m;
  while ((m = re.exec(text))) tags.add(m[2]);
  return Array.from(tags);
}

function parseLinks(text) {
  const links = new Set();
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1].trim();
    if (name) links.add(name);
  }
  return Array.from(links);
}

function collectAllBlocks(state) {
  const out = [];
  for (const j of Object.values(state.journals)) {
    for (const b of j.blocks) out.push({ ...b, scopeType: 'journal', scopeId: j.id, scopeTitle: j.title });
  }
  for (const p of Object.values(state.pages)) {
    for (const b of p.blocks) out.push({ ...b, scopeType: 'page', scopeId: p.id, scopeTitle: p.title });
  }
  return out;
}

function ensurePage(title) {
  const id = title;
  if (state.pages[id]) return;
  state.pages[id] = { id, title, createdAt: nowIso(), blocks: [newBlock(`[[${title}]] page created.`)] };
}

function upsertPagesFromLinks() {
  const blocks = collectAllBlocks(state);
  for (const b of blocks) {
    const links = parseLinks(b.text);
    for (const l of links) ensurePage(l);
  }
}

function currentDoc() {
  const { currentType, currentId } = state.ui;
  return currentType === 'journal' ? state.journals[currentId] : state.pages[currentId];
}

function setCurrentDoc(type, id) {
  state.ui.currentType = type;
  state.ui.currentId = id;
  saveState(state);
  closeDrawers();
  render();
}

function cycleStatus(current) {
  const idx = STATUS.indexOf(current);
  return STATUS[(idx + 1) % STATUS.length];
}

// query blocks
function parseQueryBlock(text) {
  const m = String(text || '').trim().match(/^\{\{query\s+(.+?)\}\}$/i);
  if (!m) return null;
  const body = m[1].trim();
  const tokens = body.split(/\s+/g);
  const q = { status: 'ALL', tag: '', text: '', scope: 'ALL' };
  for (const t of tokens) {
    const [kRaw, vRaw] = t.split(':');
    if (!vRaw) continue;
    const k = kRaw.toLowerCase();
    const v = vRaw.trim();
    if (k === 'status') q.status = v.toUpperCase();
    if (k === 'tag') q.tag = v.replace(/^#/, '');
    if (k === 'contains' || k === 'text') q.text = v;
    if (k === 'scope') q.scope = v.toUpperCase() === 'CURRENT' ? 'CURRENT' : 'ALL';
  }
  return q;
}

function runQuery(q, forScopeType, forScopeId) {
  let filtered = collectAllBlocks(state);
  if (q.scope === 'CURRENT') filtered = filtered.filter((b) => b.scopeType === forScopeType && b.scopeId === forScopeId);
  if (q.status && q.status !== 'ALL') filtered = filtered.filter((b) => b.status === q.status);
  if (q.tag) filtered = filtered.filter((b) => parseTags(b.text).includes(q.tag));
  if (q.text) {
    const low = q.text.toLowerCase();
    filtered = filtered.filter((b) => String(b.text || '').toLowerCase().includes(low));
  }
  filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return filtered;
}

function viewSubtitle(q) {
  const parts = [];
  parts.push(q.scope === 'CURRENT' ? 'scope:current' : 'scope:all');
  if (q.status !== 'ALL') parts.push(`status:${q.status}`);
  if (q.tag) parts.push(`#${q.tag}`);
  if (q.text) parts.push(`contains:${q.text}`);
  return parts.join(' · ');
}

// drawers
function openDrawer(id) {
  el(id).classList.add('open');
}
function closeDrawer(id) {
  el(id).classList.remove('open');
}
function closeDrawers() {
  closeDrawer('navDrawer');
  closeDrawer('sidePanel');
}

function setPanelTab(tab) {
  state.ui.panelTab = tab;
  saveState(state);
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  ['backlinks', 'tags', 'views'].forEach((t) => {
    el(`tab-${t}`).classList.toggle('active', t === tab);
  });
}

function renderLists() {
  const journalList = el('journalList');
  journalList.innerHTML = '';
  const journals = Object.values(state.journals).sort((a, b) => b.id.localeCompare(a.id));
  for (const j of journals) {
    const item = document.createElement('div');
    item.className = 'item' + (state.ui.currentType === 'journal' && state.ui.currentId === j.id ? ' active' : '');
    item.innerHTML = `<div class="item-title">${escapeHtml(j.title)}</div><div class="item-sub">${j.blocks.length} blocks</div>`;
    item.onclick = () => setCurrentDoc('journal', j.id);
    journalList.appendChild(item);
  }

  const pageList = el('pageList');
  pageList.innerHTML = '';
  const pages = Object.values(state.pages).sort((a, b) => a.title.localeCompare(b.title));
  for (const p of pages) {
    const item = document.createElement('div');
    item.className = 'item' + (state.ui.currentType === 'page' && state.ui.currentId === p.id ? ' active' : '');
    item.innerHTML = `<div class="item-title">${escapeHtml(p.title)}</div><div class="item-sub">${p.blocks.length} blocks</div>`;
    item.onclick = () => setCurrentDoc('page', p.id);
    pageList.appendChild(item);
  }
}

function renderDocHeader() {
  const doc = currentDoc();
  const title = el('docTitle');
  if (state.ui.currentType === 'journal') title.textContent = doc.id === todayId() ? 'Today' : `Journal · ${doc.title}`;
  else title.textContent = doc.title;
}

function renderBlocks() {
  const doc = currentDoc();
  const list = el('blockList');
  list.innerHTML = '';

  doc.blocks.forEach((b) => {
    const wrap = document.createElement('div');
    wrap.className = 'block';

    const row = document.createElement('div');
    row.className = 'block-row';

    const bullet = document.createElement('div');
    bullet.className = 'bullet';

    const main = document.createElement('div');
    main.style.flex = '1';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.gap = '8px';
    head.style.alignItems = 'center';

    const pill = document.createElement('span');
    pill.className = `pill ${b.status.toLowerCase()}`;
    pill.textContent = b.status;

    const tools = document.createElement('div');
    tools.className = 'block-tools';

    const btnCycle = document.createElement('button');
    btnCycle.className = 'icon-btn';
    btnCycle.textContent = '↻';
    btnCycle.title = 'Cycle status';
    btnCycle.onclick = () => {
      b.status = cycleStatus(b.status);
      b.updatedAt = nowIso();
      saveState(state);
      render();
    };

    const btnDel = document.createElement('button');
    btnDel.className = 'icon-btn';
    btnDel.textContent = '✕';
    btnDel.title = 'Delete block';
    btnDel.onclick = () => {
      doc.blocks = doc.blocks.filter((x) => x.id !== b.id);
      saveState(state);
      render();
    };

    tools.appendChild(btnCycle);
    tools.appendChild(btnDel);

    head.appendChild(pill);
    head.appendChild(tools);

    const ta = document.createElement('textarea');
    ta.value = b.text;
    ta.placeholder = 'Write… (#tag, [[Page]], or {{query status:TODO scope:current}})';

    ta.oninput = () => {
      b.text = ta.value;
      b.updatedAt = nowIso();
      upsertPagesFromLinks();
      saveState(state);
      renderSide();
      renderLists();
      renderBlocks();
    };

    ta.onkeydown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        b.status = cycleStatus(b.status);
        b.updatedAt = nowIso();
        saveState(state);
        render();
      }
    };

    main.appendChild(head);
    main.appendChild(ta);

    // meta chips
    const tags = parseTags(b.text);
    const links = parseLinks(b.text);
    if (tags.length || links.length) {
      const meta = document.createElement('div');
      meta.className = 'block-meta';

      tags.forEach((t) => {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = `#${t}`;
        tag.onclick = () => {
          openDrawer('sidePanel');
          setPanelTab('tags');
          showTag(t);
        };
        meta.appendChild(tag);
      });

      links.forEach((l) => {
        const lk = document.createElement('span');
        lk.className = 'link';
        lk.textContent = `[[${l}]]`;
        lk.onclick = () => {
          ensurePage(l);
          saveState(state);
          setCurrentDoc('page', l);
        };
        meta.appendChild(lk);
      });

      main.appendChild(meta);
    }

    // query render
    const q = parseQueryBlock(b.text);
    if (q) {
      const qWrap = document.createElement('div');
      qWrap.className = 'query-render';

      const qHead = document.createElement('div');
      qHead.className = 'query-head';

      const left = document.createElement('div');
      left.innerHTML = `<div class="query-title">Query</div><div class="query-sub">${escapeHtml(viewSubtitle(q))}</div>`;

      const right = document.createElement('div');
      const btnSave = document.createElement('button');
      btnSave.className = 'btn btn-small btn-ghost';
      btnSave.textContent = 'Save view';
      btnSave.onclick = () => {
        const name = prompt('View name?', viewSubtitle(q));
        if (!name) return;
        state.views.unshift({ id: crypto.randomUUID(), name, query: q, createdAt: nowIso() });
        saveState(state);
        renderSide();
        openDrawer('sidePanel');
        setPanelTab('views');
      };
      right.appendChild(btnSave);

      qHead.appendChild(left);
      qHead.appendChild(right);
      qWrap.appendChild(qHead);

      const results = runQuery(q, state.ui.currentType, state.ui.currentId).slice(0, 10);
      const resList = document.createElement('div');
      resList.className = 'mini-list';
      if (!results.length) {
        resList.innerHTML = `<div class="mini-item"><div>No results</div><div class="small">Try changing status/tag.</div></div>`;
      } else {
        results.forEach((r) => {
          const item = document.createElement('div');
          item.className = 'mini-item';
          item.innerHTML = `<div>${escapeHtml(shorten(r.text, 120))}</div><div class="small">${r.status} · ${r.scopeType} · ${escapeHtml(r.scopeTitle)}</div>`;
          item.onclick = () => setCurrentDoc(r.scopeType, r.scopeId);
          resList.appendChild(item);
        });
      }
      qWrap.appendChild(resList);
      main.appendChild(qWrap);
    }

    row.appendChild(bullet);
    row.appendChild(main);
    wrap.appendChild(row);
    list.appendChild(wrap);
  });
}

function backlinkItemsForCurrent() {
  const doc = currentDoc();
  const blocks = collectAllBlocks(state);
  const target = state.ui.currentType === 'page' ? `[[${doc.title}]]` : doc.id;

  return blocks
    .filter((b) => b.text.includes(target) || (state.ui.currentType === 'page' && parseLinks(b.text).includes(doc.title)))
    .filter((b) => !(b.scopeType === state.ui.currentType && b.scopeId === state.ui.currentId));
}

function renderBacklinks() {
  const list = el('backlinkList');
  list.innerHTML = '';
  const hits = backlinkItemsForCurrent();
  if (!hits.length) {
    list.innerHTML = `<div class="mini-item"><div>No backlinks yet.</div><div class="small">Mention this page via [[...]] in another block.</div></div>`;
    return;
  }

  hits.slice(0, 30).forEach((h) => {
    const item = document.createElement('div');
    item.className = 'mini-item';
    item.innerHTML = `<div>${escapeHtml(shorten(h.text, 120))}</div><div class="small">from ${h.scopeType} · ${escapeHtml(h.scopeTitle)}</div>`;
    item.onclick = () => setCurrentDoc(h.scopeType, h.scopeId);
    list.appendChild(item);
  });
}

function renderTagCloud() {
  const cloud = el('tagCloud');
  cloud.innerHTML = '';
  const blocks = collectAllBlocks(state);
  const freq = new Map();
  blocks.forEach((b) => parseTags(b.text).forEach((t) => freq.set(t, (freq.get(t) || 0) + 1)));

  const entries = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    cloud.innerHTML = `<div class="mini-item"><div>No tags yet.</div><div class="small">Add #tags in blocks.</div></div>`;
    return;
  }

  entries.slice(0, 30).forEach(([t, n]) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = `#${t} (${n})`;
    tag.onclick = () => showTag(t);
    cloud.appendChild(tag);
  });
}

function showTag(tag) {
  const results = el('tagResults');
  results.innerHTML = '';

  const blocks = collectAllBlocks(state);
  const hits = blocks.filter((b) => parseTags(b.text).includes(tag));

  results.innerHTML = `<div class="mini-item"><div><b>#${escapeHtml(tag)}</b></div><div class="small">${hits.length} blocks</div></div>`;

  hits.slice(0, 30).forEach((h) => {
    const item = document.createElement('div');
    item.className = 'mini-item';
    item.innerHTML = `<div>${escapeHtml(shorten(h.text, 120))}</div><div class="small">${h.status} · ${h.scopeType} · ${escapeHtml(h.scopeTitle)}</div>`;
    item.onclick = () => setCurrentDoc(h.scopeType, h.scopeId);
    results.appendChild(item);
  });
}

function renderViews() {
  const root = el('views');
  root.innerHTML = '';
  if (!state.views.length) {
    root.innerHTML = `<div class="mini-item"><div>No saved views</div><div class="small">Save view from a query block.</div></div>`;
    return;
  }

  state.views.slice(0, 10).forEach((v) => {
    const box = document.createElement('div');
    box.className = 'view';

    const head = document.createElement('div');
    head.className = 'view-head';

    const left = document.createElement('div');
    left.innerHTML = `<div class="view-title">${escapeHtml(v.name)}</div><div class="view-sub">${escapeHtml(viewSubtitle(v.query))}</div>`;

    const btnX = document.createElement('button');
    btnX.className = 'icon-btn';
    btnX.textContent = '✕';
    btnX.title = 'Remove view';
    btnX.onclick = () => {
      state.views = state.views.filter((x) => x.id !== v.id);
      saveState(state);
      renderViews();
    };

    head.appendChild(left);
    head.appendChild(btnX);
    box.appendChild(head);

    const results = runQuery(v.query, state.ui.currentType, state.ui.currentId).slice(0, 5);
    const list = document.createElement('div');
    list.className = 'mini-list';
    if (!results.length) {
      list.innerHTML = `<div class="mini-item"><div>No results</div><div class="small">Edit the query block.</div></div>`;
    } else {
      results.forEach((r) => {
        const item = document.createElement('div');
        item.className = 'mini-item';
        item.innerHTML = `<div>${escapeHtml(shorten(r.text, 120))}</div><div class="small">${r.status} · ${r.scopeType} · ${escapeHtml(r.scopeTitle)}</div>`;
        item.onclick = () => setCurrentDoc(r.scopeType, r.scopeId);
        list.appendChild(item);
      });
    }
    box.appendChild(list);
    root.appendChild(box);
  });
}

function renderSide() {
  renderBacklinks();
  renderTagCloud();
  renderViews();
}

function wireUI() {
  // drawer controls
  el('btnToggleNav').onclick = () => el('navDrawer').classList.toggle('open');
  el('btnTogglePanel').onclick = () => el('sidePanel').classList.toggle('open');
  el('btnCloseNav').onclick = () => closeDrawer('navDrawer');
  el('btnClosePanel').onclick = () => closeDrawer('sidePanel');

  // tabs
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.onclick = () => setPanelTab(btn.dataset.tab);
  });

  // actions
  el('btnAddBlock').onclick = () => {
    const doc = currentDoc();
    doc.blocks.unshift(newBlock(''));
    saveState(state);
    render();
  };

  el('btnAddQuery').onclick = () => {
    const doc = currentDoc();
    doc.blocks.unshift(newBlock('{{query status:TODO scope:current}}'));
    saveState(state);
    render();
  };

  el('btnToday').onclick = () => {
    const tid = todayId();
    if (!state.journals[tid]) state.journals[tid] = { id: tid, title: tid, createdAt: nowIso(), blocks: [newBlock('')] };
    saveState(state);
    setCurrentDoc('journal', tid);
  };

  el('btnNewJournal').onclick = () => {
    const base = todayId();
    let id = base;
    let n = 1;
    while (state.journals[id]) {
      n += 1;
      id = `${base} (${n})`;
    }
    state.journals[id] = { id, title: id, createdAt: nowIso(), blocks: [newBlock('')] };
    saveState(state);
    setCurrentDoc('journal', id);
  };

  el('btnNewPage').onclick = () => {
    const name = prompt('Page name?', 'New Page');
    if (!name) return;
    ensurePage(name.trim());
    saveState(state);
    setCurrentDoc('page', name.trim());
  };

  el('btnReset').onclick = () => {
    if (!confirm('Reset demo? This clears local demo data in this browser.')) return;
    localStorage.removeItem(LS_KEY);
    state = ensureState();
    render();
  };

  // keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'j') {
      e.preventDefault();
      el('navDrawer').classList.toggle('open');
    }
    if ((e.metaKey || e.ctrlKey) && k === 'l') {
      e.preventDefault();
      el('sidePanel').classList.toggle('open');
    }
    if (k === 'escape') {
      closeDrawers();
    }
  });

  setPanelTab(state.ui.panelTab || 'backlinks');
}

function render() {
  upsertPagesFromLinks();
  renderLists();
  renderDocHeader();
  renderBlocks();
  renderSide();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function shorten(str, n) {
  const s = String(str || '').trim().replace(/\s+/g, ' ');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

wireUI();
render();
