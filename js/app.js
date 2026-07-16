/**
 * 极简导航
 * - 前台：分类锚点 + 外站搜索 + 分区链接（无站名介绍）
 * - 后台：标题/副标题/分类名/备注仍可编辑并入库
 * - 数据：/api/* + KV；本地开发可用 localStorage
 */

const STORAGE_KEY = 'nav-site-data';
const AUTH_KEY = 'nav-site-auth';
const THEME_KEY = 'nav-theme';
const ENGINE_KEY = 'nav-search-engine';

const SEARCH_ENGINES = {
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  baidu: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`,
  ddg: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
};

const DEFAULT_DATA = {
  title: '导航',
  subtitle: '常用站点 · 极简入口',
  categories: [
    {
      id: 'work',
      name: '工作',
      links: [
        { id: 'gh', name: 'GitHub', url: 'https://github.com', desc: '代码托管' },
        { id: 'cf', name: 'Cloudflare', url: 'https://dash.cloudflare.com', desc: 'Pages / DNS' },
        { id: 'notion', name: 'Notion', url: 'https://www.notion.so', desc: '笔记协作' },
      ],
    },
    {
      id: 'dev',
      name: '开发',
      links: [
        { id: 'mdn', name: 'MDN', url: 'https://developer.mozilla.org', desc: 'Web 文档' },
        { id: 'caniuse', name: 'Can I use', url: 'https://caniuse.com', desc: '兼容性' },
        { id: 'regex', name: 'Regex101', url: 'https://regex101.com', desc: '正则调试' },
      ],
    },
    {
      id: 'tools',
      name: '工具',
      links: [
        { id: 'translate', name: 'DeepL', url: 'https://www.deepl.com/translator', desc: '翻译' },
        { id: 'excalidraw', name: 'Excalidraw', url: 'https://excalidraw.com', desc: '白板' },
        { id: 'json', name: 'JSON Crack', url: 'https://jsoncrack.com', desc: 'JSON 可视化' },
      ],
    },
  ],
};

/** @type {typeof DEFAULT_DATA} */
let state = structuredClone(DEFAULT_DATA);
let editDraft = null;
let useRemote = false;
let isAuthed = sessionStorage.getItem(AUTH_KEY) === '1';
let adminPassword = '';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeUrl(url) {
  const t = (url || '').trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function isLocalHost() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replaceAll("'", '&#39;');
}

/* ---------- Theme ---------- */
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  setTheme(cur === 'dark' ? 'light' : 'dark');
}

/* ---------- Data ---------- */
function sanitizeData(data) {
  if (!data || typeof data !== 'object') return structuredClone(DEFAULT_DATA);
  return {
    title: String(data.title || DEFAULT_DATA.title),
    subtitle: String(data.subtitle ?? DEFAULT_DATA.subtitle),
    categories: Array.isArray(data.categories)
      ? data.categories.map((c) => ({
          id: String(c.id || uid('cat')),
          name: String(c.name || '未命名'),
          links: Array.isArray(c.links)
            ? c.links.map((l) => ({
                id: String(l.id || uid('link')),
                name: String(l.name || '未命名'),
                url: String(l.url || ''),
                desc: String(l.desc || ''),
              }))
            : [],
        }))
      : structuredClone(DEFAULT_DATA.categories),
  };
}

function setStorageHint(text) {
  const el = $('#storage-hint');
  if (el) el.textContent = text;
}

async function loadData() {
  try {
    const res = await fetch('/api/data', { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const json = await res.json();
        if (json && !json.error) {
          useRemote = true;
          state = sanitizeData(json);
          setStorageHint('云端存储');
          return;
        }
      }
    }
  } catch {
    /* ignore */
  }

  useRemote = false;

  if (isLocalHost()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state = raw ? sanitizeData(JSON.parse(raw)) : structuredClone(DEFAULT_DATA);
    } catch {
      state = structuredClone(DEFAULT_DATA);
    }
    setStorageHint('本机开发 localStorage');
    return;
  }

  // 线上无 API：只展示默认/草稿，不冒充全站
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? sanitizeData(JSON.parse(raw)) : structuredClone(DEFAULT_DATA);
  } catch {
    state = structuredClone(DEFAULT_DATA);
  }
  setStorageHint('未连接云端 API');
}

async function saveData(data, password) {
  if (useRemote) {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, data }),
    });
    if (res.status === 401) throw new Error('密码错误');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `保存失败 (${res.status})`);
    }
    return;
  }

  if (!isLocalHost()) {
    throw new Error('全站保存需要云端 API + KV');
  }

  const localPass = localStorage.getItem('nav-site-local-pass') || 'admin';
  if (password !== localPass) throw new Error('密码错误（本地默认 admin）');
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/* ---------- Render（前台极简） ---------- */
function render() {
  // 标题/副标题仅用于浏览器标签，页面上不展示
  document.title = state.title || '导航';

  const cats = state.categories.filter((c) => c.links && c.links.length);

  const nav = $('#cat-nav');
  if (nav) {
    nav.innerHTML = cats
      .map((c) => `<a href="#cat-${escapeAttr(c.id)}">${escapeHtml(c.name)}</a>`)
      .join('');
    nav.hidden = cats.length === 0;
  }

  const main = $('#main');
  if (!main) return;

  if (!cats.length) {
    main.innerHTML = '<p class="empty">暂无内容，点击「管理」添加</p>';
    return;
  }

  // 分区保留；不渲染分类名、不渲染备注/介绍
  main.innerHTML = cats
    .map(
      (cat) => `
      <section class="cat" id="cat-${escapeAttr(cat.id)}" aria-label="${escapeAttr(cat.name)}">
        <div class="links">
          ${cat.links
            .map((l) => {
              const href = normalizeUrl(l.url);
              return `<a class="link-card" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.name)}</a>`;
            })
            .join('')}
        </div>
      </section>`
    )
    .join('');
}

/* ---------- Web search ---------- */
function initWebSearch() {
  const form = $('#web-search');
  if (!form) return;

  const saved = localStorage.getItem(ENGINE_KEY);
  if (saved && SEARCH_ENGINES[saved]) {
    const radio = form.querySelector(`input[name="engine"][value="${saved}"]`);
    if (radio) radio.checked = true;
  }

  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.name === 'engine' && SEARCH_ENGINES[t.value]) {
      localStorage.setItem(ENGINE_KEY, t.value);
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = ($('#q')?.value || '').trim();
    if (!q) {
      $('#q')?.focus();
      return;
    }
    const engine = form.querySelector('input[name="engine"]:checked')?.value || 'google';
    const build = SEARCH_ENGINES[engine] || SEARCH_ENGINES.google;
    window.open(build(q), '_blank', 'noopener,noreferrer');
  });
}

/* ---------- Admin ---------- */
function openAuth() {
  $('#auth-error').hidden = true;
  $('#auth-password').value = '';
  const hint = $('#dlg-auth .hint');
  if (hint) {
    if (useRemote) {
      hint.textContent = '输入 Cloudflare 中的 ADMIN_PASSWORD';
    } else if (isLocalHost()) {
      hint.textContent = '本地开发默认密码 admin';
    } else {
      hint.textContent = '云端 API 未就绪时无法写入全站，仅本机草稿';
    }
  }
  $('#dlg-auth').showModal();
  requestAnimationFrame(() => $('#auth-password').focus());
}

function openAdmin() {
  editDraft = structuredClone(state);
  $('#edit-title').value = editDraft.title || '';
  $('#edit-subtitle').value = editDraft.subtitle || '';
  renderEditCats();
  const msg = $('#save-msg');
  if (msg) msg.hidden = true;
  $('#dlg-admin').showModal();
}

/** 数组内相邻交换，用于分类/链接排序 */
function swapItems(arr, i, j) {
  if (i < 0 || j < 0 || i >= arr.length || j >= arr.length || i === j) return false;
  const t = arr[i];
  arr[i] = arr[j];
  arr[j] = t;
  return true;
}

function renderEditCats() {
  const root = $('#edit-cats');
  root.innerHTML = '';
  const catCount = editDraft.categories.length;

  editDraft.categories.forEach((cat, ci) => {
    const box = document.createElement('div');
    box.className = 'edit-cat';
    box.innerHTML = `
      <div class="edit-cat-head">
        <div class="sort-btns" title="分类顺序">
          <button type="button" class="btn sm sort" data-cat-up ${ci === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn sm sort" data-cat-down ${ci >= catCount - 1 ? 'disabled' : ''}>↓</button>
        </div>
        <input type="text" data-cat-name value="${escapeAttr(cat.name)}" placeholder="分类名（前台锚点用）" />
        <button type="button" class="btn sm" data-add-link>＋链接</button>
        <button type="button" class="btn sm danger" data-del-cat>删除分类</button>
      </div>
      <div class="edit-links"></div>`;

    const linksEl = $('.edit-links', box);
    const linkCount = cat.links.length;
    cat.links.forEach((link, li) => linksEl.appendChild(makeLinkRow(ci, li, link, linkCount)));

    $('[data-cat-name]', box).addEventListener('input', (e) => {
      editDraft.categories[ci].name = e.target.value;
    });
    $('[data-add-link]', box).addEventListener('click', () => {
      editDraft.categories[ci].links.push({
        id: uid('link'),
        name: '新链接',
        url: 'https://',
        desc: '',
      });
      renderEditCats();
    });
    $('[data-del-cat]', box).addEventListener('click', () => {
      if (!confirm(`删除分类「${cat.name}」？`)) return;
      editDraft.categories.splice(ci, 1);
      renderEditCats();
    });
    $('[data-cat-up]', box)?.addEventListener('click', () => {
      if (swapItems(editDraft.categories, ci, ci - 1)) renderEditCats();
    });
    $('[data-cat-down]', box)?.addEventListener('click', () => {
      if (swapItems(editDraft.categories, ci, ci + 1)) renderEditCats();
    });

    root.appendChild(box);
  });
}

function makeLinkRow(ci, li, link, linkCount) {
  const row = document.createElement('div');
  row.className = 'edit-link';
  row.innerHTML = `
    <div class="sort-btns" title="链接顺序">
      <button type="button" class="btn sm sort" data-link-up ${li === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" class="btn sm sort" data-link-down ${li >= linkCount - 1 ? 'disabled' : ''}>↓</button>
    </div>
    <input type="text" data-f="name" value="${escapeAttr(link.name)}" placeholder="名称" />
    <input type="url" data-f="url" value="${escapeAttr(link.url)}" placeholder="https://..." />
    <button type="button" class="btn sm danger" data-del-link>删</button>
    <input type="text" data-f="desc" value="${escapeAttr(link.desc || '')}" placeholder="备注（前台不显示）" class="edit-desc" />
  `;

  $$('input[data-f]', row).forEach((input) => {
    input.addEventListener('input', () => {
      editDraft.categories[ci].links[li][input.getAttribute('data-f')] = input.value;
    });
  });
  $('[data-del-link]', row).addEventListener('click', () => {
    editDraft.categories[ci].links.splice(li, 1);
    renderEditCats();
  });
  $('[data-link-up]', row)?.addEventListener('click', () => {
    if (swapItems(editDraft.categories[ci].links, li, li - 1)) renderEditCats();
  });
  $('[data-link-down]', row)?.addEventListener('click', () => {
    if (swapItems(editDraft.categories[ci].links, li, li + 1)) renderEditCats();
  });
  return row;
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const password = $('#auth-password').value;
  const err = $('#auth-error');
  err.hidden = true;

  try {
    if (useRemote) {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        err.textContent = '密码错误';
        err.hidden = false;
        return;
      }
    } else if (isLocalHost()) {
      const localPass = localStorage.getItem('nav-site-local-pass') || 'admin';
      if (password !== localPass) {
        err.textContent = '密码错误（本地默认 admin）';
        err.hidden = false;
        return;
      }
    } else if (!password) {
      err.textContent = '请输入密码';
      err.hidden = false;
      return;
    }

    adminPassword = password;
    isAuthed = true;
    sessionStorage.setItem(AUTH_KEY, '1');
    $('#dlg-auth').close();
    openAdmin();
  } catch {
    err.textContent = '验证失败';
    err.hidden = false;
  }
}

async function handleSave() {
  const msg = $('#save-msg');
  msg.hidden = true;

  editDraft.title = $('#edit-title').value.trim() || '导航';
  editDraft.subtitle = $('#edit-subtitle').value.trim();
  editDraft.categories = editDraft.categories
    .map((c) => ({
      ...c,
      name: (c.name || '').trim() || '未命名',
      links: c.links
        .map((l) => ({
          ...l,
          name: (l.name || '').trim() || '未命名',
          url: normalizeUrl(l.url),
          desc: (l.desc || '').trim(),
        }))
        .filter((l) => l.url && l.url !== 'https://'),
    }))
    .filter((c) => c.name);

  if (!adminPassword) {
    $('#dlg-admin').close();
    openAuth();
    return;
  }

  try {
    await saveData(editDraft, adminPassword);
    state = structuredClone(editDraft);
    render();
    msg.textContent = '已保存';
    msg.style.color = 'var(--ok)';
    msg.hidden = false;
  } catch (e) {
    msg.textContent = e.message || '保存失败';
    msg.style.color = 'var(--danger)';
    msg.hidden = false;
    if (String(e.message).includes('密码')) {
      isAuthed = false;
      sessionStorage.removeItem(AUTH_KEY);
      adminPassword = '';
    }
  }
}

function logout() {
  isAuthed = false;
  adminPassword = '';
  sessionStorage.removeItem(AUTH_KEY);
  $('#dlg-admin').close();
}

/* ---------- Bind ---------- */
function bind() {
  $('#btn-theme')?.addEventListener('click', toggleTheme);
  initWebSearch();

  $('#btn-admin')?.addEventListener('click', () => {
    if (isAuthed && adminPassword) openAdmin();
    else openAuth();
  });

  $('#form-auth')?.addEventListener('submit', handleAuthSubmit);
  $('#btn-save')?.addEventListener('click', handleSave);
  $('#btn-logout')?.addEventListener('click', logout);
  $('#btn-add-cat')?.addEventListener('click', () => {
    editDraft.categories.push({ id: uid('cat'), name: '新分类', links: [] });
    renderEditCats();
  });

  $$('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => document.getElementById(btn.getAttribute('data-close'))?.close());
  });
}

bind();
await loadData();
render();
