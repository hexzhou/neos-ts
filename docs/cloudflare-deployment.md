# Cloudflare 部署

网页通过 Cloudflare Workers Static Assets 部署到 https://neos.ihex.dev。
部署配置见仓库根目录的 `wrangler.jsonc`。

## 首次部署

部署工具要求 Node.js 22 或更高版本。

```bash
npm ci
npx wrangler login
npm run deploy
```

Cloudflare 账号需要拥有 `ihex.dev` 域名的管理权限。Wrangler 会为
`neos.ihex.dev` 创建 Worker 自定义域名及对应的 DNS 和证书配置。

## 后续更新

```bash
npm ci
npm run deploy
```

部署命令会先执行 `npm run build`，再上传 `dist`。生产构建读取
`neos.config.prod.json`，并包含 `neos-assets` 下的 WebAssembly、图片和音频。
不要使用 `build:prod`，该命令保留了原站的 CDN 路径。

只部署浏览器网页及静态资源，不运行或上传 `agent/` 中的 AI Agent，
也不需要配置 LLM 凭据。登录、匹配、卡牌数据和对战继续使用生产配置中的外部服务。
新域名下的登录回调和外部服务跨域权限需要由对应服务支持。

SPA 回退已启用，直接访问或刷新 `/match/`、`/build`、`/duel` 等路径
会加载同一应用入口。

Git 远程 `origin` 为 `git@github.com:hexzhou/neos-ts.git`，
`upstream` 保留原仓库。当前使用 Wrangler 手动部署；推送到 GitHub 不会自动发布。
