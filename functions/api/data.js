/**
 * GET /api/data — 读取导航数据（公开）
 * KV binding: NAV_KV
 */

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

const KEY = 'nav:data';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.NAV_KV) {
    return json(DEFAULT_DATA);
  }

  try {
    const raw = await env.NAV_KV.get(KEY);
    if (!raw) return json(DEFAULT_DATA);
    return json(JSON.parse(raw));
  } catch {
    return json({ error: '读取失败' }, 500);
  }
}
