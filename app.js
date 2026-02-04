/*
  Logseq-ish Planner Demo v6
  - Source-first Markdown: edit in plain text, read as rendered Markdown
  - Read mode shows Markdown preview; click to edit
  - Views are lenses: create via bottom sheet

  Storage: localStorage only. No AI.
*/

const LS_KEY = 'logseq-ish-planner-demo:v6';
const STATUS = ['TODO', 'DOING', 'DONE'];

let editingBlockId = null;

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

function newTextBlock(text = '') {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    text,
    status: 'TODO',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function newViewBlock(view) {
  return {
    id: crypto.randomUUID(),
    type: 'view',
    view: {
      name: view.name || '',
      scope: view.scope || 'CURRENT',
      status: view.status || 'TODO',
      tag: view.tag || '',
      contains: view.contains || '',
    },
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
          newTextBlock('오늘 무엇을 할까? #work [[ProjectX]]'),
          newTextBlock('- Markdown은 **읽을 땐 렌더**, 편집 땐 소스로 쓴다.\n- 예: `code`, [link](https://example.com)'),
          newViewBlock({ name: '오늘 TODO', status: 'TODO', scope: 'CURRENT' }),
        ],
      },
    },
    pages: {
      Dashboard: {
        id: 'Dashboard',
        title: 'Dashboard',
        createdAt: nowIso(),
        blocks: [newTextBlock('[[Dashboard]] 에 View(렌즈)를 모아두자.'), newViewBlock({ name: '전체 DOING', status: 'DOING', scope: 'ALL' })],
      },
    },
    savedViews: [],
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
  state.pages[id] = { id, title, createdAt: nowIso(), blocks: [newTextBlock(`[[${title}]] page created.`)] };
}

function upsertPagesFromLinks() {
  const blocks = collectAllBlocks(state).filter((b) => b.type === 'text');
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
  editingBlockId = null;
  closeDrawers();
  closeSheet();
  render();
}

function cycleStatus(current) {
  const idx = STATUS.indexOf(current);
  return STATUS[(idx + 1) % STATUS.length];
}

function runView(view, forScopeType, forScopeId) {
  let filtered = collectAllBlocks(state).filter((b) => b.type === 'text');

  if ((view.scope || 'CURRENT') === 'CURRENT') {
    filtered = filtered.filter((b) => b.scopeType === forScopeType && b.scopeId === forScopeId);
  }
  if (view.status && view.status !== 'ALL') {
    filtered = filtered.filter((b) => b.status === view.status);
  }
  if (view.tag) {
    filtered = filtered.filter((b) => parseTags(b.text).includes(view.tag));
  }
  if (view.contains) {
    const low = view.contains.toLowerCase();
    filtered = filtered.filter((b) => String(b.text || '').toLowerCase().includes(low));
  }

  filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return filtered;
}

function viewLabel(view) {
  const parts = [];
  parts.push(view.scope === 'ALL' ? '전체' : '현재');
  parts.push(view.status === 'ALL' ? '모든 상태' : view.status);
  if (view.tag) parts.push(`#${view.tag}`);
  if (view.contains) parts.push(`contains:${view.contains}`);
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

// view sheet
let sheetMode = { kind: 'create', targetBlockId: null };
function openSheet(mode) {
  sheetMode = mode;
  el('overlay').hidden = false;
  el('viewSheet').hidden = false;
}
function closeSheet() {
  el('overlay').hidden = true;
  el('viewSheet').hidden = true;
  sheetMode = { kind: 'create', targetBlockId: null };
}
function readSheetView() {
  return {
    name: el('viewName').value.trim(),
    status: el('viewStatus').value,
    scope: el('viewScope').value,
    tag: el('viewTag').value.trim().replace(/^#/, ''),
    contains: el('viewContains').value.trim(),
  };
}
function writeSheetView(view) {
  el('viewName').value = view?.name || '';
  el('viewStatus').value = view?.status || 'TODO';
  el('viewScope').value = view?.scope || 'CURRENT';
  el('viewTag').value = view?.tag || '';
  el('viewContains').value = view?.contains || '';
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

function renderDocTitle() {
  const doc = currentDoc();
  const title = document.getElementById('docTitle');
  if (state.ui.currentType === 'journal') title.textContent = doc.id === todayId() ? 'Today' : `Journal · ${doc.title}`;
  else title.textContent = doc.title;
}

// --- Minimal Markdown renderer (safe, subset) ---
function mdInline(s) {
  // Escape first
  let out = escapeHtml(s);
  // Inline code
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`);
  // Bold
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Links [text](url)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  // [[Page]] links (keep as clickable spans)
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_, name) => `<span class="link" data-page="${escapeHtml(String(name).trim())}">[[${escapeHtml(String(name).trim())}]]</span>`);
  // #tags
  out = out.replace(/(^|\s)#([a-zA-Z0-9_\-가-힣]+)/g, (_, sp, tag) => `${sp}<span class="tag" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</span>`);
  return out;
}

function mdToHtml(text) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let listBuf = [];

  function flushList() {
    if (!listBuf.length) return;
    const lis = listBuf.map((li) => `<li>${mdInline(li)}</li>`).join('');
    blocks.push(`<ul>${lis}</ul>`);
    listBuf = [];
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/g, '');
    const m = line.match(/^\s*[-*]\s+(.*)$/);
    if (m) {
      listBuf.push(m[1]);
      continue;
    }
    flushList();
    if (line.trim() === '') continue;
    blocks.push(`<p>${mdInline(line)}</p>`);
  }
  flushList();
  return blocks.join('');
}

function renderTextBlock(doc, b) {
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
  btnCycle.title = 'Cycle status (Cmd+Enter)';
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

  main.appendChild(head);

  if (editingBlockId === b.id) {
    const ta = document.createElement('textarea');
    ta.value = b.text;
    ta.placeholder = 'Write… (Markdown, #tag, [[Page]])';

    ta.oninput = () => {
      b.text = ta.value;
      b.updatedAt = nowIso();
      upsertPagesFromLinks();
      saveState(state);
      renderLists();
      renderSide();
    };

    ta.onkeydown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        b.status = cycleStatus(b.status);
        b.updatedAt = nowIso();
        saveState(state);
        render();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        editingBlockId = null;
        render();
      }
    };

    ta.onblur = () => {
      editingBlockId = null;
      render();
    };

    // autofocus on mount
    setTimeout(() => ta.focus(), 0);
    main.appendChild(ta);
  } else {
    const preview = document.createElement('div');
    preview.className = 'md-preview';
    preview.innerHTML = mdToHtml(b.text);

    preview.onclick = () => {
      editingBlockId = b.id;
      render();
    };

    // Handle clicks inside preview for tags/pages
    preview.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const page = t.dataset.page;
      const tag = t.dataset.tag;
      if (page) {
        e.preventDefault();
        ensurePage(page);
        saveState(state);
        setCurrentDoc('page', page);
      }
      if (tag) {
        e.preventDefault();
        openDrawer('sidePanel');
        setPanelTab('tags');
        showTag(tag);
      }
    });

    main.appendChild(preview);
  }

  row.appendChild(bullet);
  row.appendChild(main);
  wrap.appendChild(row);
  return wrap;
}

function renderViewBlock(doc, b) {
  const wrap = document.createElement('div');
  wrap.className = 'block';

  const row = document.createElement('div');
  row.className = 'block-row';

  const bullet = document.createElement('div');
  bullet.className = 'bullet';

  const main = document.createElement('div');
  main.style.flex = '1';

  const card = document.createElement('div');
  card.className = 'view-card';

  const head = document.createElement('div');
  head.className = 'view-card-head';

  const left = document.createElement('div');
  left.innerHTML = `<div class="view-card-title">${escapeHtml(b.view.name || 'View')}</div><div class="view-card-sub">${escapeHtml(viewLabel(b.view))}</div>`;

  const actions = document.createElement('div');
  actions.className = 'view-card-actions';

  const btnEdit = document.createElement('button');
  btnEdit.className = 'btn btn-small btn-ghost';
  btnEdit.textContent = 'Edit';
  btnEdit.onclick = () => {
    writeSheetView(b.view);
    openSheet({ kind: 'edit', targetBlockId: b.id });
  };

  const btnSave = document.createElement('button');
  btnSave.className = 'btn btn-small btn-ghost';
  btnSave.textContent = 'Save';
  btnSave.onclick = () => {
    const name = (b.view.name || '').trim() || viewLabel(b.view);
    state.savedViews.unshift({ id: crypto.randomUUID(), name, view: b.view, createdAt: nowIso() });
    saveState(state);
    openDrawer('sidePanel');
    setPanelTab('views');
    renderSide();
  };

  const btnDel = document.createElement('button');
  btnDel.className = 'icon-btn';
  btnDel.textContent = '✕';
  btnDel.title = 'Delete view';
  btnDel.onclick = () => {
    doc.blocks = doc.blocks.filter((x) => x.id !== b.id);
    saveState(state);
    render();
  };

  actions.appendChild(btnEdit);
  actions.appendChild(btnSave);
  actions.appendChild(btnDel);

  head.appendChild(left);
  head.appendChild(actions);

  const results = runView(b.view, state.ui.currentType, state.ui.currentId).slice(0, 8);
  const body = document.createElement('div');
  body.className = 'view-card-body mini-list';

  if (!results.length) {
    body.innerHTML = `<div class="mini-item"><div>No results</div><div class="small">Try changing filters.</div></div>`;
  } else {
    results.forEach((r) => {
      const item = document.createElement('div');
      item.className = 'mini-item';
      item.innerHTML = `<div>${escapeHtml(shorten(r.text, 120))}</div><div class="small">${r.status} · ${r.scopeType} · ${escapeHtml(r.scopeTitle)}</div>`;
      item.onclick = () => setCurrentDoc(r.scopeType, r.scopeId);
      body.appendChild(item);
    });
  }

  card.appendChild(head);
  card.appendChild(body);
  main.appendChild(card);

  row.appendChild(bullet);
  row.appendChild(main);
  wrap.appendChild(row);
  return wrap;
}

function renderBlocks() {
  const doc = currentDoc();
  const list = el('blockList');
  list.innerHTML = '';

  doc.blocks.forEach((b) => {
    if (b.type === 'view') list.appendChild(renderViewBlock(doc, b));
    else list.appendChild(renderTextBlock(doc, b));
  });
}

function backlinkItemsForCurrent() {
  const doc = currentDoc();
  const blocks = collectAllBlocks(state).filter((b) => b.type === 'text');
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
  const blocks = collectAllBlocks(state).filter((b) => b.type === 'text');
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

  const blocks = collectAllBlocks(state).filter((b) => b.type === 'text');
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

function renderSavedViews() {
  const root = el('views');
  root.innerHTML = '';
  if (!state.savedViews.length) {
    root.innerHTML = `<div class="mini-item"><div>No saved views</div><div class="small">Save from a View card.</div></div>`;
    return;
  }

  state.savedViews.slice(0, 10).forEach((v) => {
    const box = document.createElement('div');
    box.className = 'view';

    const head = document.createElement('div');
    head.className = 'view-head';

    const left = document.createElement('div');
    left.innerHTML = `<div class="view-title">${escapeHtml(v.name)}</div><div class="view-sub">${escapeHtml(viewLabel(v.view))}</div>`;

    const btnX = document.createElement('button');
    btnX.className = 'icon-btn';
    btnX.textContent = '✕';
    btnX.title = 'Remove saved view';
    btnX.onclick = () => {
      state.savedViews = state.savedViews.filter((x) => x.id !== v.id);
      saveState(state);
      renderSavedViews();
    };

    head.appendChild(left);
    head.appendChild(btnX);
    box.appendChild(head);

    const results = runView(v.view, state.ui.currentType, state.ui.currentId).slice(0, 5);
    const list = document.createElement('div');
    list.className = 'mini-list';

    if (!results.length) {
      list.innerHTML = `<div class="mini-item"><div>No results</div><div class="small">Try editing a View card.</div></div>`;
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
  renderSavedViews();
}

function applyEditViewById(blockId, nextView) {
  const doc = currentDoc();
  const target = doc.blocks.find((x) => x.id === blockId);
  if (!target || target.type !== 'view') return;
  target.view = nextView;
  target.updatedAt = nowIso();
  saveState(state);
  render();
}

function wireUI() {
  el('btnToggleNav').onclick = () => el('navDrawer').classList.toggle('open');
  el('btnTogglePanel').onclick = () => el('sidePanel').classList.toggle('open');
  el('btnCloseNav').onclick = () => closeDrawer('navDrawer');
  el('btnClosePanel').onclick = () => closeDrawer('sidePanel');

  el('btnToday').onclick = () => {
    const tid = todayId();
    if (!state.journals[tid]) state.journals[tid] = { id: tid, title: tid, createdAt: nowIso(), blocks: [newTextBlock('')] };
    saveState(state);
    setCurrentDoc('journal', tid);
  };

  el('btnAddBlock').onclick = () => {
    const doc = currentDoc();
    const block = newTextBlock('');
    doc.blocks.unshift(block);
    saveState(state);
    editingBlockId = block.id;
    render();
  };

  el('btnAddView').onclick = () => {
    writeSheetView({ name: '', status: 'TODO', scope: 'CURRENT', tag: '', contains: '' });
    openSheet({ kind: 'create', targetBlockId: null });
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
    editingBlockId = null;
    render();
  };

  // tabs
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.onclick = () => setPanelTab(btn.dataset.tab);
  });

  // sheet
  el('overlay').onclick = closeSheet;
  el('btnCloseSheet').onclick = closeSheet;

  el('btnInsertView').onclick = () => {
    const doc = currentDoc();
    const view = readSheetView();

    if (sheetMode.kind === 'edit' && sheetMode.targetBlockId) {
      applyEditViewById(sheetMode.targetBlockId, view);
      closeSheet();
      return;
    }

    doc.blocks.unshift(newViewBlock(view));
    saveState(state);
    closeSheet();
    render();
  };

  el('btnInsertAndSaveView').onclick = () => {
    const doc = currentDoc();
    const view = readSheetView();

    const name = view.name || viewLabel(view);
    state.savedViews.unshift({ id: crypto.randomUUID(), name, view, createdAt: nowIso() });

    if (sheetMode.kind === 'edit' && sheetMode.targetBlockId) {
      applyEditViewById(sheetMode.targetBlockId, view);
    } else {
      doc.blocks.unshift(newViewBlock(view));
    }

    saveState(state);
    closeSheet();
    openDrawer('sidePanel');
    setPanelTab('views');
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
      closeSheet();
      editingBlockId = null;
      render();
    }
  });

  setPanelTab(state.ui.panelTab || 'backlinks');
}

function render() {
  upsertPagesFromLinks();
  renderLists();
  renderDocTitle();
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
