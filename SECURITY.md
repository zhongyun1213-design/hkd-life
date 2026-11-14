# 安全说明

## 报告问题

请**不要**在公开的 Issue 里放真实账单、同步密钥、VAPID 私钥、Cloudflare 凭据或数据库导出。

- 安全问题：用 GitHub 的 [Private vulnerability reporting](https://github.com/zhongyun1213-design/hkd-life/security/advisories/new)（仓库 Security 标签页）私下报告。
- 一般缺陷：开 Issue，但请用虚构数据复现。

## 这个项目里哪些东西绝对不能公开

| 内容 | 位置 | 泄露后果 |
|---|---|---|
| 同步密钥（原始值） | 各设备的浏览器存储 / 本机 `.env.sync-local` | 可读写整本账本 |
| `SYNC_TOKEN_HASH` | Worker secret | 只是哈希，泄露影响较小，但仍不要公开 |
| VAPID 私钥 | Worker secret / 本机 `.env.webpush-local` | 可向你的设备推送伪造通知 |
| Cloudflare API / OAuth 凭据 | 本机配置 | 可操作你的账号 |
| 真实账单与数据库导出 | 本机 | 个人财务隐私 |

## 已知的安全边界

- 同步密钥可以读写整本账本，**没有**「只能新增一笔」的最小权限令牌；Apple Pay 快捷指令目前复用的就是这把全权密钥。
- 服务端只保存密钥的 SHA-256，用恒定时间比较；传输走 HTTPS，但 **D1 里的账本不是端到端加密**——Cloudflare 作为基础设施方能接触明文。
- 前端与 Worker 同源时最简单；分离部署（例如 GitHub Pages）必须显式配置 `ALLOWED_ORIGINS`，否则 API 会拒绝跨域请求。
- 推送只允许发往已知的浏览器推送服务域名（FCM / APNs / Mozilla / WNS），不接受任意 URL。
- 这是一个**单人**应用：一个部署对应一本账本、一把密钥，不是多租户平台。

## 部署建议

- 用 `scripts/create-sync-key.mjs` 生成随机密钥，只把哈希放进 Worker secret。
- 定期轮换密钥（轮换后所有设备需要重新填写）。
- 不要把 `.env*`、`.dev.vars*`、`release/`、`dist/` 提交进 Git——`.gitignore` 已经覆盖。
