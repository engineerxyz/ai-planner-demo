/*
  Planner Demo (Logseq-inspired)
  - Journals + Pages
  - Blocks with statuses (Cmd+Enter cycles)
  - #tags and [[Page]] links + backlinks
  - Query: status + tag + contains + scope
  - Dashboard query views
  - All localStorage only
*/

const LS_KEY = 'planner-demo:v1';

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
    ui: { mode: 'today', currentType: 'journal', currentId: tid, activeTab: 'backlinks' },
    journals: {
      [tid]: {
        id: tid,
        title: tid,
        createdAt: nowIso(),
        blocks: [
          newBlock('Write a quick journal entry. Add #tags and [[Pages]].'),
          newBlock('Cmd+Enter → TODO/DOING/DONE status (demo).'),
          newBlock('Query example: status:TODO tag:#demo contains:"Cmd"'),
        ],
      },
    },
    pages: {},
    views: [],
  };

  saveState(state);
  return state;
}

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

function ensurePage(state, title) {
  const id = title;
  if (state.pages[id]) return;
  state.pages[id] = {
    id,
    title,
    createdAt: nowIso(),
    blocks: [newBlock(`[[${title}]] page created. Add blocks here.`)],
  };
}

function setTab(state, tab) {
  state.ui.activeTab = tab;
  saveState(state);
  render();
}

function el(id) { return document.getElementById(id); }

let state = ensureState();

function currentDoc() {
  const { currentType, currentId } = state.ui;
  if (currentType === 'journal') return state.journals[currentId];
  return state.pages[currentId];
}

function setCurrentDoc(type, id) {
  state.ui.currentType = type;
  state.ui.currentId = id;
  state.ui.mode = (type === 'journal' && id === todayId()) ? 'today' : 'editor';
  saveState(state);
  render();
}

function upsertFromLinks() {
  // create pages referenced by links in all blocks
  const blocks = collectAllBlocks(state);
  for (const b of blocks) {
    const links = parseLinks(b.text);
    for (const l of links) ensurePage(state, l);
  }
}

function renderLists() {
  // journals
  const journalList = el('journalList');
  journalList.innerHTML = '';
  const journals = Object.values(state.journals).sort((a,b) => b.id.localeCompare(a.id));
  for (const j of journals) {
    const item = document.createElement('div');
    item.className = 'item' + (state.ui.currentType==='journal' && state.ui.currentId===j.id ? ' active' : '');
    item.innerHTML = `<div class="item-title">${j.title}</div><div class="item-sub">${j.blocks.length} blocks</div>`;
    item.onclick = () => setCurrentDoc('journal', j.id);
    journalList.appendChild(item);
  }

  // pages
  const pageList = el('pageList');
  pageList.innerHTML = '';
  const pages = Object.values(state.pages).sort((a,b)=>a.title.localeCompare(b.title));
  for (const p of pages) {
    const item = document.createElement('div');
    item.className = 'item' + (state.ui.currentType==='page' && state.ui.currentId===p.id ? ' active' : '');
    item.innerHTML = `<div class="item-title">${p.title}</div><div class="item-sub">${p.blocks.length} blocks</div>`;
    item.onclick = () => setCurrentDoc('page', p.id);
    pageList.appendChild(item);
  }
}

function renderEditorHeader() {
  const doc = currentDoc();
  const titleEl = el('editorTitle');
  const subEl = el('editorSub');

  if (state.ui.mode === 'dashboard') {
    titleEl.textContent = 'Dashboard';
    subEl.textContent = 'Query views pinned here. No AI yet.';
    return;
  }

  if (state.ui.currentType === 'journal') {
    titleEl.textContent = (doc.id === todayId()) ? 'Today' : `Journal · ${doc.title}`;
    subEl.textContent = 'Tip: Cmd+Enter cycles TODO → DOING → DONE. Use #tags and [[Page]] links.';
  } else {
    titleEl.textContent = `Page · ${doc.title}`;
    subEl.textContent = 'Backlinks show blocks that mention this page via [[...]].';
  }
}

function cycleStatus(current) {
  const idx = STATUS.indexOf(current);
  const next = STATUS[(idx + 1) % STATUS.length];
  return next;
}

function renderBlocks() {
  const doc = currentDoc();
  const list = el('blockList');
  list.innerHTML = '';

  doc.blocks.forEach((b) => {
    const wrap = document.createElement('div');
    wrap.className = 'block';

    const pillClass = b.status.toLowerCase();

    const head = document.createElement('div');
    head.className = 'block-head';

    const left = document.createElement('div');
    left.innerHTML = `<span class="pill ${pillClass}">${b.status}</span>`;

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '6px';

    const btnStatus = document.createElement('button');
    btnStatus.className = 'btn btn-small btn-ghost';
    btnStatus.textContent = 'Cycle';
    btnStatus.title = 'Cycle status (Cmd+Enter on textarea too)';
    btnStatus.onclick = () => {
      b.status = cycleStatus(b.status);
      b.updatedAt = nowIso();
      saveState(state);
      render();
    };

    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-small btn-danger';
    btnDel.textContent = 'Del';
    btnDel.onclick = () => {
      doc.blocks = doc.blocks.filter(x => x.id !== b.id);
      saveState(state);
      render();
    };

    right.appendChild(btnStatus);
    right.appendChild(btnDel);

    head.appendChild(left);
    head.appendChild(right);

    const ta = document.createElement('textarea');
    ta.value = b.text;
    ta.placeholder = 'Type block content… Use #tags and [[Page]] links.';
    ta.oninput = () => {
      b.text = ta.value;
      b.updatedAt = nowIso();
      upsertFromLinks();
      saveState(state);
      renderRightSide();
      renderLists();
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

    const meta = document.createElement('div');
    meta.className = 'block-meta';

    const tags = parseTags(b.text);
    tags.forEach(t => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = `#${t}`;
      tag.onclick = () => {
        setTab(state, 'tags');
        showTag(t);
      };
      meta.appendChild(tag);
    });

    const links = parseLinks(b.text);
    links.forEach(l => {
      const lk = document.createElement('span');
      lk.className = 'link';
      lk.textContent = `[[${l}]]`;
      lk.onclick = () => {
        ensurePage(state, l);
        saveState(state);
        setCurrentDoc('page', l);
      };
      meta.appendChild(lk);
    });

    wrap.appendChild(head);
    wrap.appendChild(ta);
    if (tags.length || links.length) wrap.appendChild(meta);

    list.appendChild(wrap);
  });
}

function renderTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === state.ui.activeTab);
  });

  const panels = document.querySelectorAll('.tab-panel');
  panels.forEach(p => {
    p.classList.toggle('active', p.id === `tab-${state.ui.activeTab}`);
  });
}

function backlinkItemsForCurrent() {
  const doc = currentDoc();
  const blocks = collectAllBlocks(state);

  let target;
  if (state.ui.currentType === 'page') target = `[[${doc.title}]]`;
  else target = doc.id; // journals can be referenced by date text

  const hits = blocks
    .filter(b => b.text.includes(target) || (state.ui.currentType==='page' && parseLinks(b.text).includes(doc.title)))
    .filter(b => !(b.scopeType === state.ui.currentType && b.scopeId === state.ui.currentId));

  return hits;
}

function renderBacklinks() {
  const list = el('backlinkList');
  list.innerHTML = '';
  const hits = backlinkItemsForCurrent();
  if (!hits.length) {
    list.innerHTML = `<div class="mini-item"><div>No backlinks yet.</div><div class="small">Mention this page via [[...]] from other blocks.</div></div>`;
    return;
  }

  hits.slice(0, 30).forEach(h => {
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
  blocks.forEach(b => parseTags(b.text).forEach(t => freq.set(t, (freq.get(t)||0)+1)));

  const entries = Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]);
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
  const hits = blocks.filter(b => parseTags(b.text).includes(tag));

  results.innerHTML = `<div class="mini-item"><div><b>#${escapeHtml(tag)}</b></div><div class="small">${hits.length} blocks</div></div>`;

  hits.slice(0, 30).forEach(h => {
    const item = document.createElement('div');
    item.className = 'mini-item';
    item.innerHTML = `<div>${escapeHtml(shorten(h.text, 120))}</div><div class="small">${h.status} · ${h.scopeType} · ${escapeHtml(h.scopeTitle)}</div>`;
    item.onclick = () => setCurrentDoc(h.scopeType, h.scopeId);
    results.appendChild(item);
  });
}

function getQueryState() {
  const qTag = el('qTag').value.trim();
  const qText = el('qText').value.trim();
  const qScope = el('qScope').value;
  const activeSeg = document.querySelector('.seg-btn.active');
  const status = activeSeg ? activeSeg.dataset.status : 'ALL';

  return {
    status,
    tag: qTag.replace(/^#/, ''),
    text: qText,
    scope: qScope,
  };
}

function runQuery(q) {
  const blocks = collectAllBlocks(state);

  let filtered = blocks;

  if (q.scope === 'CURRENT') {
    filtered = filtered.filter(b => b.scopeType === state.ui.currentType && b.scopeId === state.ui.currentId);
  }

  if (q.status !== 'ALL') {
    filtered = filtered.filter(b => b.status === q.status);
  }

  if (q.tag) {
    filtered = filtered.filter(b => parseTags(b.text).includes(q.tag));
  }

  if (q.text) {
    const low = q.text.toLowerCase();
    filtered = filtered.filter(b => (b.text || '').toLowerCase().includes(low));
  }

  filtered.sort((a,b)=> b.updatedAt.localeCompare(a.updatedAt));

  return filtered;
}

function renderQueryResults(results) {
  const list = el('queryResults');
  list.innerHTML = '';

  if (!results.length) {
    list.innerHTML = `<div class="mini-item"><div>No results.</div><div class="small">Try status=TODO or tag filters.</div></div>`;
    return;
  }

  results.slice(0, 30).forEach(r => {
    const item = document.createElement('div');
    item.className = 'mini-item';
    item.innerHTML = `<div>${escapeHtml(shorten(r.text, 120))}</div><div class="small">${r.status} · ${r.scopeType} · ${escapeHtml(r.scopeTitle)}</div>`;
    item.onclick = () => setCurrentDoc(r.scopeType, r.scopeId);
    list.appendChild(item);
  });
}

function renderDashboard() {
  const panel = el('dashboardPanel');
  const views = el('views');

  if (state.ui.mode !== 'dashboard') {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  views.innerHTML = '';

  if (!state.views.length) {
    views.innerHTML = `<div class="view"><div class="view-title">No views yet</div><div class="view-sub">Save a query from the Query tab.</div></div>`;
    return;
  }

  state.views.forEach(v => {
    const box = document.createElement('div');
    box.className = 'view';

    const head = document.createElement('div');
    head.className = 'view-head';

    const left = document.createElement('div');
    left.innerHTML = `<div class="view-title">${escapeHtml(v.name)}</div><div class="view-sub">${escapeHtml(viewSubtitle(v.query))}</div>`;

    const actions = document.createElement('div');
    actions.className = 'view-actions';

    const btnX = document.createElement('button');
    btnX.className = 'icon-btn';
    btnX.textContent = '✕';
    btnX.title = 'Remove view';
    btnX.onclick = () => {
      state.views = state.views.filter(x => x.id !== v.id);
      saveState(state);
      render();
    };

    actions.appendChild(btnX);
    head.appendChild(left);
    head.appendChild(actions);

    box.appendChild(head);

    const results = runQuery(v.query).slice(0, 8);
    const list = document.createElement('div');
    list.className = 'mini-list';
    results.forEach(r => {
      const item = document.createElement('div');
      item.className = 'mini-item';
      item.innerHTML = `<div>${escapeHtml(shorten(r.text, 120))}</div><div class="small">${r.status} · ${r.scopeType} · ${escapeHtml(r.scopeTitle)}</div>`;
      item.onclick = () => setCurrentDoc(r.scopeType, r.scopeId);
      list.appendChild(item);
    });
    if (!results.length) {
      list.innerHTML = `<div class="mini-item"><div>No results</div><div class="small">Try editing the query.</div></div>`;
    }
    box.appendChild(list);

    views.appendChild(box);
  });
}

function viewSubtitle(q) {
  const parts = [];
  parts.push(q.scope === 'CURRENT' ? 'scope:current' : 'scope:all');
  if (q.status !== 'ALL') parts.push(`status:${q.status}`);
  if (q.tag) parts.push(`#${q.tag}`);
  if (q.text) parts.push(`contains:"${q.text}"`);
  return parts.join(' · ');
}

function renderRightSide() {
  renderTabs();
  renderBacklinks();
  renderTagCloud();
}

function setMode(mode) {
  state.ui.mode = mode;
  saveState(state);
  render();
}

function wireUI() {
  // tabs
  document.querySelectorAll('.tab').forEach(btn => {
    btn.onclick = () => setTab(state, btn.dataset.tab);
  });

  // status seg
  document.querySelectorAll('.seg-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });
  // default
  document.querySelector('.seg-btn[data-status="ALL"]').classList.add('active');

  el('btnAddBlock').onclick = () => {
    const doc = currentDoc();
    doc.blocks.unshift(newBlock(''));
    saveState(state);
    render();
  };

  el('btnNewJournal').onclick = () => {
    const id = todayId();
    // create next untitled journal (allow duplicates by suffix)
    let newId = id;
    let n = 1;
    while (state.journals[newId]) { n += 1; newId = `${id} (${n})`; }
    state.journals[newId] = { id: newId, title: newId, createdAt: nowIso(), blocks: [newBlock('')] };
    saveState(state);
    setCurrentDoc('journal', newId);
  };

  el('btnRunQuery').onclick = () => {
    const q = getQueryState();
    const res = runQuery(q);
    renderQueryResults(res);
  };

  el('btnSaveView').onclick = () => {
    const q = getQueryState();
    const name = prompt('View name?', viewSubtitle(q));
    if (!name) return;
    state.views.unshift({ id: crypto.randomUUID(), name, query: q, createdAt: nowIso() });
    saveState(state);
    alert('Saved. Open Dashboard.');
  };

  el('btnFocusQuery').onclick = () => setTab(state, 'query');

  el('btnToday').onclick = () => {
    const tid = todayId();
    if (!state.journals[tid]) {
      state.journals[tid] = { id: tid, title: tid, createdAt: nowIso(), blocks: [newBlock('')] };
    }
    saveState(state);
    setCurrentDoc('journal', tid);
    setMode('today');
  };

  el('btnDashboard').onclick = () => {
    setMode('dashboard');
  };

  el('btnReset').onclick = () => {
    if (!confirm('Reset demo? This clears localStorage for this demo.')) return;
    localStorage.removeItem(LS_KEY);
    state = ensureState();
    render();
  };
}

function render() {
  upsertFromLinks();
  renderLists();
  renderEditorHeader();

  // show/hide dashboard
  renderDashboard();

  const isDashboard = state.ui.mode === 'dashboard';
  el('blockList').closest('.panel').style.display = ''; // keep panel
  el('dashboardPanel').style.display = isDashboard ? 'block' : 'none';

  if (!isDashboard) {
    renderBlocks();
    renderRightSide();
  }
}

function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function shorten(str, n){
  const s = String(str || '').trim().replace(/\s+/g,' ');
  return s.length > n ? s.slice(0, n-1) + '…' : s;
}

// Boot
wireUI();
render();
