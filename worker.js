/**
 * Cloudflare Worker：
 * - /api/* 读写 KV
 * - / 与 /index.html 注入导航数据，减少浏览器二次请求
 * 绑定：NAV_KV、ADMIN_PASSWORD、ASSETS
 */

const KEY = 'nav:data';
const MAX_BYTES = 200_000;

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

function json(data, status = 200, cacheControl = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
    },
  });
}

function isValidData(data) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.title !== 'string') return false;
  if (typeof data.subtitle !== 'string') return false;
  if (!Array.isArray(data.categories)) return false;
  for (const c of data.categories) {
    if (!c || typeof c !== 'object') return false;
    if (typeof c.id !== 'string' || typeof c.name !== 'string') return false;
    if (!Array.isArray(c.links)) return false;
    for (const l of c.links) {
      if (!l || typeof l !== 'object') return false;
      if (typeof l.id !== 'string' || typeof l.name !== 'string' || typeof l.url !== 'string') {
        return false;
      }
    }
  }
  return true;
}

/** 读导航 JSON（公开） */
async function getNavData(env) {
  if (!env.NAV_KV) return DEFAULT_DATA;
  try {
    const raw = await env.NAV_KV.get(KEY);
    if (!raw) return DEFAULT_DATA;
    return JSON.parse(raw);
  } catch {
    return DEFAULT_DATA;
  }
}

async function handleDataGet(env) {
  try {
    const data = await getNavData(env);
    // 公开读：边缘可短缓存，管理保存后最多约 1 分钟内边缘可能略旧
    return json(data, 200, 'public, max-age=30, s-maxage=60, stale-while-revalidate=120');
  } catch {
    return json({ error: '读取失败' }, 500);
  }
}

async function handleAuth(request, env) {
  const admin = env.ADMIN_PASSWORD;
  if (!admin) return json({ error: '服务端未配置 ADMIN_PASSWORD' }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '无效请求' }, 400);
  }
  if (typeof body?.password !== 'string' || body.password !== admin) {
    return json({ error: '密码错误' }, 401);
  }
  return json({ ok: true });
}

async function handleSave(request, env) {
  const admin = env.ADMIN_PASSWORD;
  if (!admin) return json({ error: '服务端未配置 ADMIN_PASSWORD' }, 503);
  if (!env.NAV_KV) return json({ error: '未绑定 NAV_KV' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '无效请求' }, 400);
  }

  if (typeof body?.password !== 'string' || body.password !== admin) {
    return json({ error: '密码错误' }, 401);
  }
  if (!isValidData(body.data)) {
    return json({ error: '数据格式无效' }, 400);
  }

  const clean = {
    title: body.data.title.slice(0, 80),
    subtitle: body.data.subtitle.slice(0, 160),
    categories: body.data.categories.map((c) => ({
      id: String(c.id).slice(0, 64),
      name: String(c.name).slice(0, 64),
      links: c.links.map((l) => ({
        id: String(l.id).slice(0, 64),
        name: String(l.name).slice(0, 80),
        url: String(l.url).slice(0, 500),
        desc: String(l.desc || '').slice(0, 120),
      })),
    })),
  };

  const payload = JSON.stringify(clean);
  if (payload.length > MAX_BYTES) return json({ error: '数据过大' }, 413);

  try {
    await env.NAV_KV.put(KEY, payload);
    return json({ ok: true });
  } catch {
    return json({ error: '写入失败' }, 500);
  }
}

/** 首页注入数据：浏览器少一次 /api/data 往返 */
async function serveIndex(request, env) {
  if (!env.ASSETS) return new Response('ASSETS binding missing', { status: 500 });

  const assetReq = new Request(new URL('/index.html', request.url), request);
  const assetRes = await env.ASSETS.fetch(assetReq);
  if (!assetRes.ok) return assetRes;

  const [html, data] = await Promise.all([assetRes.text(), getNavData(env)]);

  // 防止 </script> 截断
  const safe = JSON.stringify(data).replace(/</g, '\\u003c');
  const boot = `<script>window.__NAV_BOOT__=${safe}</script>`;
  const out = html.includes('</head>')
    ? html.replace('</head>', `${boot}\n</head>`)
    : boot + html;

  return new Response(out, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/data' && request.method === 'GET') {
      return handleDataGet(env);
    }
    if (path === '/api/auth' && request.method === 'POST') {
      return handleAuth(request, env);
    }
    if (path === '/api/save' && request.method === 'POST') {
      return handleSave(request, env);
    }
    if (path.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404);
    }

    // 首页走注入；其它静态资源直出 ASSETS（由 wrangler run_worker_first 控制）
    if (request.method === 'GET' && (path === '/' || path === '/index.html')) {
      return serveIndex(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('ASSETS binding missing', { status: 500 });
  },
};
