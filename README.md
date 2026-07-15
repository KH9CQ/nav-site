# nav-site · 极简导航

纯静态前端 +（可选）Cloudflare Pages Functions。支持分类导航、深/浅色、密码管理。无图片、无构建、**不需要安装 Wrangler / Node**。

## 目录结构

```text
nav-site/
├── index.html              # 页面
├── css/style.css
├── js/app.js
├── _headers                # 安全头与缓存（Pages 识别）
├── _redirects
├── functions/              # 仅「连 Git 部署」时生效：云端读写 + 密码
│   └── api/
│       ├── data.js
│       ├── auth.js
│       └── save.js
├── .gitignore
└── README.md
```

没有 `wrangler.toml`、没有 `package.json`，避免网页「直接上传」误判为需 CLI 项目。

## 你刚才报错的原因

Cloudflare **直接上传** 若扫到 `wrangler.toml`，会提示：

> 暂不支持需要构建过程的项目……请改用 wrangler deploy

本仓库已去掉该文件。请按下面两种方式之一重新部署（**不要装 CLI**）。

---

## 方式 A：网页「直接上传」（最快，零 Git）

适合先上线看看效果。

### 能做什么

| 能力 | 是否可用 |
|------|----------|
| 浏览 / 搜索 / 深色模式 | ✅ |
| 密码管理编辑 | ✅（数据存在**当前浏览器** localStorage） |
| 多设备云端同步 | ❌（直接上传一般不带上 Functions） |

管理密码默认：**`admin`**  
（浏览器控制台可改：`localStorage.setItem('nav-site-local-pass', '新密码')`）

### 步骤

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Upload assets**（直接上传）
2. 项目名称随意，例如 `nav-site`
3. **只上传这些静态文件**（不要上传整个含 README 的「工程说明」也行，但关键是不要带 wrangler 配置）：
   - `index.html`
   - `css/` 文件夹
   - `js/` 文件夹
   - `_headers`、`_redirects`（可选，建议带上）
4. **不要上传**：`functions/`、`README.md`、`.gitignore`（直传用不上；带 `functions` 有时也会被当成复杂项目）
5. 部署完成后打开 `https://你的项目.pages.dev`

**实操技巧**：在资源管理器中进入 `nav-site`，只选中上面 3～5 项再拖进上传区；或先把它们复制到一个临时空文件夹再整夹上传。

---

## 方式 B：连接 Git（推荐长期用，仍不用 CLI）

多设备同步、密码存在 Cloudflare、数据进 KV。

1. 把 **整个** `nav-site` 文件夹推到 GitHub / GitLab（一个独立小仓库最省事）
2. Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. 构建设置：

   | 项 | 填什么 |
   |----|--------|
   | Framework preset | **None** |
   | Build command | **留空** |
   | Build output directory | **`/`** 或 **`.`**（静态文件在仓库根目录） |
   | Root directory | 留空（仓库根就是本站时） |

4. 部署成功后，打开项目 **Settings → Bindings**（或 Variables）：

   | 类型 | 名称 | 说明 |
   |------|------|------|
   | KV Namespace | `NAV_KV` | 先到左侧 KV 新建一个，再绑到这里 |
   | Secret | `ADMIN_PASSWORD` | 你的管理密码 |

5. 绑定后点一次 **重新部署**，再打开站点 → **管理** → 用 `ADMIN_PASSWORD` 登录保存。

底部提示「数据：云端存储」即表示 API + KV 已生效。

---

## 功能一览

| 功能 | 说明 |
|------|------|
| 分类导航 | 多分类 + 顶部锚点 |
| 搜索 | 过滤名称 / 备注 / URL |
| 深色模式 | 跟随系统，可切换并记住 |
| 管理编辑 | 改标题、分类、链接（增删改） |
| 数据 | 有 API+KV → 云端；否则 → 本机 localStorage |

## 本地预览（可选）

有 Python 时：

```powershell
cd D:\codex_projs\cowork_projs\nav-site
python -m http.server 8787
```

打开 `http://localhost:8787`，默认管理密码 `admin`。

## 安全提示

- 个人导航级别鉴权，勿与重要账户共用密码
- Secret 只在 Cloudflare 网页填写，不要写进仓库、不要发聊天
