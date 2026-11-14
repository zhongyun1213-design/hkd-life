# 港币生活 · HKD Life

一个可以自行部署、安装到电脑和手机的开源 PWA，包含多币种生活账本和金融事件学习实验室。**运行时不依赖 ChatGPT、OpenAI 账号、Sites、模型 API 或付费 AI 服务。**

MIT 许可，源码可修改、分发。公开仓库：<https://github.com/zhongyun1213-design/hkd-life>。

## 三种用法（先选一个，大多数人只需要第一种）

| 你想要的 | 需要部署吗 | 怎么做 |
|---|---|---|
| 只在自己电脑/手机上记账 | **不需要** | 打开页面直接用；数据在本机 IndexedDB，断网也能记 |
| 手机和电脑看到同一本账 | 需要一个小后端（Cloudflare） | 见「可选：让手机和电脑同步」，有一条命令的脚本 |
| 收系统推送（新闻摘要等） | 需要后端 + 推送密钥 | 同上，脚本会顺手生成 |

**没有任何一步强制你注册 Cloudflare。** 不部署 = 不能跨设备同步、收不到推送，记账、导入账单、预算、实验室这些核心功能都照常可用。

## 作者的线上实例（供体验）

- 安装 / 使用：<https://hkd-life.polyu-push-7e.workers.dev/>
- 源码 ZIP：<https://hkd-life.polyu-push-7e.workers.dev/downloads/hkd-life-source.zip>
- 预构建应用 ZIP：<https://hkd-life.polyu-push-7e.workers.dev/downloads/hkd-life-app.zip>
- 同步地址：`https://hkd-life.polyu-push-7e.workers.dev/api/state`

这是作者自己的 Cloudflare 实例，界面公开可访问，个人账本接口由随机同步密钥保护。**请不要向这个实例写入自己的数据**；自用请按下面的步骤部署自己的 Worker + D1。

其他人使用开源代码时，请自行创建 D1、部署自己的 Worker 并生成自己的密钥；仓库里的数据库 ID 只属于此实例，不提供任何数据库权限。

## 你会得到什么

- 港币 / 人民币账户、收入、支出、实际到账转账换汇、手续费。
- 待支付支出预留、生活费余量、消费分类和备份导入导出。
- 金融事件来源、原始判断、观察数据 CSV、百分比图表、追加复盘、Markdown 导出。
- 本地 IndexedDB：不登录即可用，离线记账；Service Worker 缓存应用资源。
- 可选自建 Cloudflare Worker + D1 同步。打开应用时每 15 秒尝试；联网或回到窗口时也会尝试。
- 冲突明确选择；不同记录自动合并，未改动的旧副本不会复活云端已删除记录。

## 先在电脑使用

安装 Node.js 22.13+（建议 24 LTS），在项目目录运行：

```sh
npm ci
npm test
npm run build
npm start
```

打开 `http://127.0.0.1:4173`。开发模式用 `npm run dev`。预构建的 `hkd-life-app.zip` 解压后无需安装 npm 依赖：Windows 可运行 `start-windows.cmd`；其他系统运行 `node scripts/serve.mjs`。两者均需要 Node.js。不要直接双击 `index.html`，浏览器不允许这样完整运行 ES 模块、Service Worker 与存储。

首次打开：添加账户及初始余额 → 调整参考汇率与日均预算 → 记账。右下角“同步与安装”设置同步。金融实验室通过页脚或侧栏进入。

## 可选：让手机和电脑同步（Cloudflare）

**不需要同步的话，这一整节都可以跳过。** 同步要一个自己的小后端，是因为账本不能放在公共服务器上，而 Cloudflare 的免费额度足够个人用。

### 一条命令（推荐）

在项目根目录运行：

```sh
npm run setup:cloudflare
```

脚本会依次做：浏览器里登录 Cloudflare → 创建 D1 数据库 → 把 `database_id` 写进配置 → 跑数据库迁移 → 生成同步密钥（只把 SHA-256 存到服务端）→ 生成推送密钥 → 构建 → 部署。

跑完会打印：

```
应用地址： https://<你的名字>.workers.dev
同步接口： https://<你的名字>.workers.dev/api/state
同步密钥： <64 位十六进制>
```

这两个值也会写进本机 `.env.sync-local`（已在 `.gitignore` 里）。手机和电脑各自打开应用 → 右下角「同步与安装」→ 填这两个值即可。

先看看它要做什么、不动任何东西：`npm run setup:cloudflare -- --dry-run`。

### 或者手动一步步来

前端和同步 API 可以部署到同一个 Worker 地址；这是你的 Cloudflare 账号，不经过任何 GPT 服务。静态界面公开可下载，个人数据接口必须使用密钥。

1. 在 Cloudflare 创建自己的账号；以下命令会打开浏览器登录。

```sh
npx --yes wrangler@4.92.0 login
npx --yes wrangler@4.92.0 d1 create hkd-life
```

2. 将上一步返回的 `database_id` 填入 `sync-worker/wrangler.jsonc`，替换 `REPLACE_WITH_YOUR_D1_DATABASE_ID`。可修改 Worker `name`，避免重名。

```sh
npx --yes wrangler@4.92.0 d1 migrations apply DB --remote --config sync-worker/wrangler.jsonc
npm run build
npx --yes wrangler@4.92.0 deploy --config sync-worker/wrangler.jsonc
```

3. 生成一组随机同步密钥，并将哈希设置为服务端 secret。前一条命令会在你自己的终端显示密钥及其哈希，请妥善保存；不要提交到 Git。

```sh
node scripts/create-sync-key.mjs
npx --yes wrangler@4.92.0 secret put SYNC_TOKEN_HASH --config sync-worker/wrangler.jsonc
```

在 secret 提示里粘贴 **SHA-256 哈希**（64 位十六进制），不是原始密钥。再部署一次确保 secret 生效：

```sh
npx --yes wrangler@4.92.0 deploy --config sync-worker/wrangler.jsonc
```

4. 在手机和电脑分别打开部署得到的 HTTPS 地址。进入“同步与安装”，两端填写相同信息：

- 地址：`https://你的地址.workers.dev/api/state`
- 密钥：生成脚本显示的**原始同步密钥**

保存连接，确认显示“已同步”。在另一台设备打开或点击立即同步，即可看到相同账本。没有配置这一步时，两台设备各自保存在本机，不会凭空互通。

5. 安装到设备：

- **iPhone / iPad**：Safari 打开 HTTPS 地址 → 分享 → 添加到主屏幕。若系统提供“作为网页 App 打开”，启用它。
- **Android**：Chrome 菜单 → 安装应用 / 添加到主屏幕。
- **Windows / macOS**：Chrome 或 Edge 菜单 → 安装应用 / 将此页安装为应用。

安装后从图标直接启动，不需要打开 GPT。第一次访问必须联网，缓存完成后可离线打开。PWA 不是 APK、IPA 或 EXE 原生程序；部分浏览器提供的安装选项会不同。手机访问电脑的 HTTP 局域网 IP 不能替代 HTTPS 部署来测试 PWA 安装。

## 可选：GitHub Pages 放前端，Worker 只做同步

将源码上传到你自己的公开仓库，GitHub Settings → Pages → Source 选择 GitHub Actions，运行附带的 `.github/workflows/pages.yml`。构建使用相对资源地址和 hash 路由，可放在仓库子路径。

把 `sync-worker/wrangler.jsonc` 的 `vars.ALLOWED_ORIGINS` 设置为你的 Pages **来源**，例如 `https://yourname.github.io`（不带 `/仓库名`），再部署 Worker。前端填写 Worker 的 `/api/state` 地址。默认只允许同源连接；不使用 `*`。

静态网页任何人都可以获取；账本数据不会打包进网页。每个部署只是一位用户的一本共享账本，持有密钥的设备获得相同读写权限。不要把同步密钥写进前端代码、二维码网址、GitHub Actions 文件或公开仓库。

## 数据、隐私与同步规则

- 本机数据保存在当前浏览器或已安装 PWA 的 IndexedDB 中；同步地址和密钥也只存本机，不进入账本备份。
- 云端数据在你自己的 Cloudflare D1；服务端只配置同步密钥的 SHA-256 哈希，通信使用 HTTPS。**云端账本没有端到端加密**；Cloudflare 是存储服务提供方。
- 服务端使用 SQL 条件版本更新，拒绝旧版本覆盖；客户端使用上次成功同步的基线做三方合并。基线和未同步修改一起持久保存。
- 不同条目或不同字段的修改自动合并。相同字段同时修改、删除与编辑冲突时，选择保留本机还是云端；可以先下载本机备份。
- 关联记录不能同时成立（例如两端分别支付同一预留）时，提示整份账本冲突，先备份再明确选择，避免静默生成重复支出。
- 网络失败不撤销本机保存。务必区分“本机已保存”和“已同步”；App 关闭期间不保证后台同步。
- 清除浏览器数据、删除安装的 App 或操作系统回收存储，可能删除本机副本。定期导出备份，不把浏览器存储当作唯一备份。
- 原始事件、观察和复盘采用追加留痕。服务端第一次接收事件时使用服务端时间；离线记录的本机时间不能证明事前预测。自己部署并控制数据库的人仍可直接改库，本功能不是不可篡改审计系统。
- 恢复旧备份不能抹掉云端已经存在的实验室历史；修正通过追加复盘完成。旧版 GPT 站点的 JSON 备份可导入，迁移不会自动读取那个站点的数据。

## 金融实验室：事件推荐与系统推送（1.3）

金融实验室默认进入“事件推荐”，可切换 AI、审计、金融科技，搜索标题或来源，并将报道带入研究事件表单。自动填入标题、来源、链接和报道发布日期；实际事件日期、假设、基线与证伪条件仍需自行确认填写。

来源包括三个主题的新闻搜索 RSS（Google，失败时切换 Bing），Google AI、NVIDIA、IAASB、香港金管局的官方 RSS，以及 Journal of Accountancy、Finextra 的专业报道。不是无限制的全网爬虫；来源与范围可在 `lib/news.mjs` 中配置。按关键词、时间和来源类型排序，官方和专业媒体优先，识别到的个人平台文章标为观点并降低排序，近 7 天内容进入推荐，存储最多 30 天的缓存；相同标题去重，优先官方发布。摘要使用来源短摘录，不调用付费模型编造解释或投资结论。推荐理由及研究问题是规则提示，不等于已核实的事件影响。

Worker 配置了每小时的 Cron Trigger。新闻缓存及推送设备存入独立 D1 表，不读取或覆盖财务账本。源失败时保留缓存，并在页面显示失败来源和上次成功时间。前端另有本机缓存，离线可阅读上次推荐。浏览推荐无需同步密钥；手动触发搜索和设备订阅管理需要自己的同步密钥。

**默认通知频率为香港时间每天 09:00、19:00，各一份有新内容的摘要。** 每台设备可选主题、改为每日早间或每小时有新事件时推送。没有新内容不发空通知；仅近 48 小时且未发过的事件进入摘要。同设备同一时段采用数据库记录去重，过期推送订阅自动移除。Cron 使用 UTC，因此对应 UTC 01:00、11:00；平台调度和系统通知展示可能有延迟。

在金融实验室点击“开启此设备通知”，由自己批准系统权限。iPhone / iPad 要求 iOS / iPadOS 16.4+，先添加到主屏幕，再从 App 图标打开；普通 Safari 标签不支持同样的订阅方式。电脑需要支持 Push API 的浏览器。先更新应用，确保新 Service Worker 已激活。每台设备分别开启，关闭一台不会停掉其他设备。可点击“发送测试通知”；“服务已接收”不代表操作系统已经展示，专注模式、权限和网络会影响到达。

Web Push 使用 VAPID 签名和 aes128gcm 加密，经浏览器的 FCM / APNs / Mozilla 等系统推送服务投递，不经 GPT。服务端只保存设备推送端点与订阅公钥、主题、频率、去重状态；不把账本内容放入通知。推送端点属于敏感设备信息，不应公开；不开启通知就不会创建设备订阅。

自部署时，先应用全部 D1 迁移，再执行：

```sh
node scripts/create-webpush-keys.mjs
npx --yes wrangler@4.92.0 secret put VAPID_PUBLIC_KEY --config sync-worker/wrangler.jsonc
npx --yes wrangler@4.92.0 secret put VAPID_PRIVATE_KEY --config sync-worker/wrangler.jsonc
```

分别粘贴本机 `.env.webpush-local` 中对应的值。该文件被 Git 和发布打包排除；已有密钥会保留，不自动轮换。不要轮换后继续沿用旧设备订阅。将 `NEWS_SITE_ORIGIN` 改成自己的 HTTPS 网站地址，保留 `nodejs_compat`、Cron 和静态资源设置，最后部署。GitHub Pages 分离部署时同步接口须允许 Pages 来源，页面会使用已配置同步服务的来源请求新闻 API。

`node scripts/check-news.mjs` 可在不读取账本的情况下检查在线新闻源。自动测试覆盖源失败与缓存、日期与去重、香港时段、真实 SQLite 订阅记录、VAPID 签名验证及接收端解密；不能代替自己的手机实际通知验证。

参考：[WebKit 的 iOS Web Push 要求](https://webkit.org/blog/13878/)、[Cloudflare Cron 的 UTC 时区](https://developers.cloudflare.com/workers/configuration/cron-triggers/)、[金管局公开新闻接口](https://apidocs.hkma.gov.hk/documentation/press-releases/)、[Web Push 库](https://github.com/web-push-libs/web-push)。

## 消费分类与批量修改（1.2）

收支明细支持按关键词、交易类型及消费分类筛选。勾选单笔支出，或“全选当前筛选结果中的支出”，再点击“批量修改分类”。切换筛选或离开页面会清空选择，避免误改隐藏记录。收入、转账和资金往来不能被批量选为消费。

批量操作只修改分类，不修改金额、日期、账户或原始账单数据；本次操作可撤销。若其他设备已修改所选记录，提示重新选择，避免覆盖；撤销也会检查是否发生后续分类修改。

## 导入往期账单（1.1）

打开“导入账单”，选择原始账单文件（`.xlsx` 或文字版 `.pdf`），点击“读取并预览”。PDF 如有打开密码，可在本机填写；不支持纯扫描图片，需要原始可提取文字的结单。

所有解析都在设备本地完成，PDF 解析器和 Excel 解析器也随应用缓存，断网可用。**原文件和打开密码不上传。确认后的交易原文、来源文件名、时间、金额与导入历史，会按你的现有同步配置更新到自己的云端账本。** 开发验证使用的用户样本不放进仓库或公开下载包。

1. 核对导入笔数、金额、重复记录与各账户余额。无法解析的行、缺页、金额列不明或余额核对失败会阻止导入，不会静默略过后显示完成。
2. 为每个原始账户 / 微信支付方式选择已有账户或新建账户，币种必须一致。汇丰的期初余额只用于新账户的初始余额，不作为收入；已有账户的初始余额不会自动改动。微信账单通常不含期初余额，新账户默认 0，需按实际补充。
3. 逐笔检查记账方向。已全额退款的原扣款与独立退款都保留。充值、提现、本人账户间资金转移可选“资金转入 / 转出”，只影响账户余额，不计消费或收入；其他中性、失败或取消记录仍保留原文。
4. 确认后一次写入本机。导入历史可以撤销批次，删除该批次新增记录；已编辑过的这些记录也会被撤销，请先备份。

每笔流水保留来源标识和原字段，可在“收支明细”点击原文按钮查看。重复文件、改名文件和可识别的重叠流水按来源键去重；同日同金额的不同真实交易分别保留。已导入后手动删除的记录，会通过导入历史的来源键继续防止旧文件将其复活；主动撤销批次后可以重导。

没有共同来源标识的手工流水或其他渠道账单，只做疑似重复提示，不自动吞掉记录。汇丰缺少逐笔交易号的记录，以账户、入账日期、方向、金额、完整描述及同日重复序号识别；不同导出范围若截断同日重复序列，仍须人工核对。不能保证任意银行、任意历史 PDF 版式都能自动识别，无法识别时明确报错。

微信 Excel 的日期序号按 UTC+8 钟面时间原样还原，不借设备时区转换；汇丰以结单日期推断交易年份，沿用省略日期、跨页日期上下文，按存入 / 支出 / 余额列的坐标读取，逐段校验余额。外币消费描述中的原币金额与汇率保留，实际入账金额以对应账户的币种列为准。

开发者可用 `node scripts/check-statements.mjs <微信xlsx路径> <汇丰pdf路径>` 在本机验证自己的样本。测试只输出核对概况，不将源文件写入仓库。自动测试中的账单数据均为合成示例。

## 预测口径

金额存为整数分。换汇记录实际扣款、到账和手续费，不算消费。消费分布包含实际消费，日常预测排除关联预留的支出，避免房租拉高日常开销。近期消费跨度不足 7 天时使用手动日均预算，否则使用最近最多 30 天的日均值；未记账日期按零消费计入，需要持续记录。

未支付预留扣到下次生活费到账日；未设置时取未来 30 天，过期未付继续保留。初始汇率 1.08 是可修改的计算示例，并非实时行情；历史消费折算也采用当前参考汇率。预留按具体日期录入，不自动重复。无银行直连或自动行情；新闻源抓取见金融实验室章节。

## 技术与验证

React + TypeScript + Vite，IndexedDB，Service Worker，原生 Web Crypto，Cloudflare Worker / D1。没有 Sites SDK、ChatGPT 登录或 OpenAI API 依赖。AI 复核按钮只生成可复制的文本，使用其他 AI 是可选操作。

`npm test`：财务计算、CSV、历史保护、三方合并、真实 SQLite 的同步接口鉴权与原子版本更新。`npx tsc --noEmit`：类型检查。`npm run release`：生成源码 ZIP 与预构建应用 ZIP，不包含个人数据、密钥、node_modules。

参考：[PWA 安装](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)、[Worker 静态资源](https://developers.cloudflare.com/workers/static-assets/)、[D1 迁移](https://developers.cloudflare.com/d1/reference/migrations/)。


### v1.3.1 通知与更新修复

- Web Push 请求使用 Cloudflare 支持的 `redirect: manual`，3xx 按发送失败处理，禁止跳转传递推送凭据。
- 应用等待 Service Worker 注册就绪后监听新版本；前台每 60 秒、恢复前台和联网时主动检查，并禁用更新脚本的 HTTP 缓存。保留用户点击更新以免丢失未保存表单。
- 线上 iPhone 订阅测试已获 Apple 推送服务接收；服务接收不等于系统已展示通知。


### v1.3.2 长时期账单增量导入

账单 A 覆盖已导入 B 时，仅新增流水标识未出现的 A−B。文件改名、导出范围变化和行排序变化不影响匹配；原有备注和分类保留。同日同金额的独立流水仍保留。预览显示新增和重复跳过数量。手动记录或跨支付渠道的疑似重复需要人工核对，不按金额自动删除。使用集合索引避免长账单逐行扫描全部历史记录。


### v1.3.3 Apple Pay 快捷指令接收

POST `/api/capture/apple-pay`，请求头 Authorization: Bearer <自己的同步密钥>。JSON字段：eventId(UUID，每笔生成一次，重试保持不变)、accountName(已同步且唯一的账户名)、currency(HKD或CNY)、amount(元，两位小数)、merchant(商户名)、dryRun(布尔，true只检查不入账)。成功返回ok/message，失败返回error。复用快照API的权限、版本和历史校验，并发冲突最多重试4次。不自动创建账户或跨币种换算；缺少金额、未知账户均拒绝。日期使用接收时的香港日期，离线时不会自动补传。手动重跑整条快捷指令会产生新UUID，应先检查账本。

iPhone 快捷指令自动化：Wallet/交易 → 指定银行卡 → 立即运行 → 创建新快捷指令（名称随系统界面变化）。添加当前日期、格式化日期和获取URL内容（该用户系统没有生成UUID操作；当前自定义格式见PROJECT_HANDOFF.md），URL为自己的部署地址加上述路径，POST JSON；amount和merchant从快捷指令输入的Amount和Merchant/Name字段选择，accountName固定为该卡的账本账户名，currency固定HKD时只用于港币消费。若没有金额字段，应使用询问输入，不可拿整段交易文本当金额。先用dryRun=true校验（不会产生账目），再改false。添加获取词典值message/error并显示通知，区分记账成功与失败。密钥放请求头，不能放URL或分享的截图中。苹果Wallet交易触发器官方说明：https://support.apple.com/en-mo/guide/shortcuts/apd65c67538a/ios 。具体字段及支付场景覆盖需要实际设备验证。

Apple Pay实时记录与后续银行/微信账单没有共同流水标识，目前仍需人工核对跨来源的疑似重复。不能把同金额同日视为确定重复。

快捷指令字段校验失败时，接口返回 fields 列表及逐字段设置提示，不回传密钥或财务数据。

接口会清理字段名两端空白，并在失败时回传字段名和收到的类型（不包含字段值）；dryRun 必须明确提供布尔值，避免误入账。
