/**
 * 极简导航 — 前端逻辑
 * - 优先请求 /api/data（Cloudflare Pages Functions + KV）
 * - 无后端时回退到 localStorage，本地也可完整使用
 */

const STORAGE_KEY = 'nav-site-data';
const AUTH_KEY = 'nav-site-auth';
const THEME_KEY = 'nav-theme';

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

function hostOf(url) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '');
  } catch {
    return url || '';
  }
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
async function loadData() {
  try {
    const res = await fetch('/api/data', { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const json = await res.json();
      useRemote = true;
      state = sanitizeData(json);
      $('#storage-hint').textContent = '数据：云端存储';
      return;
    }
  } catch {
    /* offline / pure static */
  }

  useRemote = false;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      state = sanitizeData(JSON.parse(raw));
    } catch {
      state = structuredClone(DEFAULT_DATA);
    }
  } else {
    state = structuredClone(DEFAULT_DATA);
  }
  $('#storage-hint').textContent = '数据：本机 localStorage（未连接云端 API）';
}

function sanitizeData(data) {
  const base = structuredClone(DEFAULT_DATA);
  if (!data || typeof data !== 'object') return base;
  return {
    title: String(data.title || base.title),
    subtitle: String(data.subtitle ?? base.subtitle),
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
      : base.categories,
  };
}

async function saveData(data, password) {
  if (useRemote) {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, data }),
    });
    if (res.status === 401) {
      throw new Error('密码错误');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `保存失败 (${res.status})`);
    }
    return;
  }

  // 本地模式：密码固定为 admin（可在 README 说明；纯静态无服务端密钥）
  const localPass = localStorage.getItem('nav-site-local-pass') || 'admin';
  if (password !== localPass) {
    throw new Error('密码错误（本地默认 admin）');
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/* ---------- Render ---------- */
function render() {
  document.title = state.title || '导航';
  $('#site-title').textContent = state.title || '导航';
  const sub = $('#site-subtitle');
  sub.textContent = state.subtitle || '';
  sub.hidden = !state.subtitle;

  const q = ($('#search').value || '').trim().toLowerCase();
  const cats = state.categories
    .map((cat) => {
      const links = cat.links.filter((l) => {
        if (!q) return true;
        const hay = `${l.name} ${l.desc} ${l.url} ${cat.name}`.toLowerCase();
        return hay.includes(q);
      });
      return { ...cat, links };
    })
    .filter((c) => c.links.length > 0 || !q);

  const nav = $('#cat-nav');
  nav.innerHTML = cats
    .map((c) => `<a href="#cat-${c.id}">${escapeHtml(c.name)}</a>`)
    .join('');
  nav.hidden = cats.length === 0;

  const main = $('#main');
  if (!cats.length) {
    main.innerHTML = `<p class="empty">${q ? '没有匹配的链接' : '暂无内容，点击「管理」添加'}</p>`;
    return;
  }

  main.innerHTML = cats
    .map(
      (cat) => `
      <section class="cat" id="cat-${escapeAttr(cat.id)}">
        <h2>${escapeHtml(cat.name)}</h2>
        <div class="links">
          ${cat.links
            .map((l) => {
              const href = normalizeUrl(l.url);
              const desc = l.desc || hostOf(l.url);
              return `
                <a class="link-card" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">
                  <span class="name">${escapeHtml(l.name)}</span>
                  <span class="desc">${escapeHtml(desc)}</span>
                </a>`;
            })
            .join('')}
        </div>
      </section>`
    )
    .join('');
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

/* ---------- Admin UI ---------- */
function openAuth() {
  $('#auth-error').hidden = true;
  $('#auth-password').value = '';
  $('#dlg-auth').showModal();
  requestAnimationFrame(() => $('#auth-password').focus());
}

function openAdmin() {
  editDraft = structuredClone(state);
  $('#edit-title').value = editDraft.title || '';
  $('#edit-subtitle').value = editDraft.subtitle || '';
  renderEditCats();
  $('#save-msg').hidden = true;
  $('#dlg-admin').showModal();
}

function renderEditCats() {
  const root = $('#edit-cats');
  root.innerHTML = '';

  editDraft.categories.forEach((cat, ci) => {
    const box = document.createElement('div');
    box.className = 'edit-cat';
    box.innerHTML = `
      <div class="edit-cat-head">
        <input type="text" data-cat-name value="${escapeAttr(cat.name)}" placeholder="分类名" />
        <button type="button" class="btn sm" data-add-link>＋链接</button>
        <button type="button" class="btn sm danger" data-del-cat>删除分类</button>
      </div>
      <div class="edit-links"></div>`;

    const linksEl = $('.edit-links', box);
    cat.links.forEach((link, li) => {
      linksEl.appendChild(makeLinkRow(ci, li, link));
    });

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

    root.appendChild(box);
  });
}

function makeLinkRow(ci, li, link) {
  const row = document.createElement('div');
  row.className = 'edit-link';
  row.innerHTML = `
    <input type="text" data-f="name" value="${escapeAttr(link.name)}" placeholder="名称" />
    <input type="url" data-f="url" value="${escapeAttr(link.url)}" placeholder="https://..." />
    <button type="button" class="btn sm danger" data-del-link>删</button>
    <input type="text" data-f="desc" value="${escapeAttr(link.desc || '')}" placeholder="备注（可选）" style="grid-column: 1 / -2" />
  `;

  $$('input[data-f]', row).forEach((input) => {
    input.addEventListener('input', () => {
      const f = input.getAttribute('data-f');
      editDraft.categories[ci].links[li][f] = input.value;
    });
  });
  $('[data-del-link]', row).addEventListener('click', () => {
    editDraft.categories[ci].links.splice(li, 1);
    renderEditCats();
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
    } else {
      const localPass = localStorage.getItem('nav-site-local-pass') || 'admin';
      if (password !== localPass) {
        err.textContent = '密码错误（本地默认 admin）';
        err.hidden = false;
        return;
      }
    }

    adminPassword = password;
    isAuthed = true;
    sessionStorage.setItem(AUTH_KEY, '1');
    $('#dlg-auth').close();
    openAdmin();
  } catch {
    err.textContent = '验证失败，请稍后重试';
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

  // 未登录会话里没有密码时，要求重新输入
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
  $('#btn-theme').addEventListener('click', toggleTheme);
  $('#search').addEventListener('input', render);

  $('#btn-admin').addEventListener('click', () => {
    if (isAuthed && adminPassword) openAdmin();
    else openAuth();
  });

  $('#form-auth').addEventListener('submit', handleAuthSubmit);
  $('#btn-save').addEventListener('click', handleSave);
  $('#btn-logout').addEventListener('click', logout);
  $('#btn-add-cat').addEventListener('click', () => {
    editDraft.categories.push({
      id: uid('cat'),
      name: '新分类',
      links: [],
    });
    renderEditCats();
  });

  $$('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close');
      document.getElementById(id)?.close();
    });
  });
}

/* ---------- Init ---------- */
bind();
await loadData();
render();
