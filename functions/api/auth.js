/**
 * POST /api/auth — 校验管理密码
 * Secret: ADMIN_PASSWORD
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const admin = env.ADMIN_PASSWORD;

  if (!admin) {
    return json({ error: '服务端未配置 ADMIN_PASSWORD' }, 503);
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

  return json({ ok: true });
}
