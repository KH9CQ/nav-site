/**
 * POST /api/save — 保存导航数据（需密码）
 * Secret: ADMIN_PASSWORD
 * KV binding: NAV_KV
 */

const KEY = 'nav:data';
const MAX_BYTES = 200_000; // ~200KB，足够个人导航

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
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

export async function onRequestPost(context) {
  const { request, env } = context;
  const admin = env.ADMIN_PASSWORD;

  if (!admin) {
    return json({ error: '服务端未配置 ADMIN_PASSWORD' }, 503);
  }
  if (!env.NAV_KV) {
    return json({ error: '未绑定 NAV_KV' }, 503);
  }

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

  // 规范化 desc
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
  if (payload.length > MAX_BYTES) {
    return json({ error: '数据过大' }, 413);
  }

  try {
    await env.NAV_KV.put(KEY, payload);
    return json({ ok: true });
  } catch {
    return json({ error: '写入失败' }, 500);
  }
}
