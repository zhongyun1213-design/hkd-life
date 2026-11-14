# 港币生活 HKD Life — 交给 DeepSeek 的项目完整交接资料

整理日期：2026-11-15（香港/上海时间）。代码版本：1.3.3，另含同版本的快捷指令诊断修复。本文依据当前工作区源码、README、测试及实际操作记录整理，不包含个人账单、密钥或设备推送端点。

## 1. 项目目标与用户需求

用户是香港理工大学大二人工智能专业学生，方向包括金融科技。项目用于日常多币种记账、历史账单导入、消费分析，以及金融事件研究与新闻推荐。

用户明确要求：开源、自己拥有代码、电脑和手机可独立访问/安装、多设备同步，不依赖打开 GPT、ChatGPT 登录或模型 API。早晚新闻摘要偏好为香港时间 09:00、19:00。NETHAO LIMITED 消费默认归娱乐。后续要求研究 Apple Pay/微信付款后自动记账，并支持导入覆盖更长时期的账单时只新增 A−B。

参考项目只是思路来源，不能混为一谈：本项目没有 Gist 同步、Gmail 邮件处理、Canvas 作业导入或系统日历订阅。实际使用 React/Vite + Cloudflare Worker/D1；不是“纯前端无后端”。

## 2. 入口、交付和开发状态

- 在线：https://hkd-life.polyu-push-7e.workers.dev/
- 金融实验室：https://hkd-life.polyu-push-7e.workers.dev/#/lab
- 线上源码：https://hkd-life.polyu-push-7e.workers.dev/downloads/hkd-life-source.zip
- 线上预构建包：https://hkd-life.polyu-push-7e.workers.dev/downloads/hkd-life-app.zip
- 同步 API：https://hkd-life.polyu-push-7e.workers.dev/api/state
- 当前工作区：E:\Algorithm&Finance\hkd-life
- MIT 许可。公开下载源码不等于已有公开 GitHub 仓库；目前未创建公开 GitHub 仓库。
- 本地 Git 最新提交是 4b54a58（新闻推送版本）；1.3.1—1.3.3 后续修改已在工作区、源码发布包和线上部署，但尚未全部提交。此前提交失败原因为未配置 Git 作者身份，不要只检出旧提交作为最新代码。
- 本次交接 ZIP 以当前工作区文件为准；不包含 node_modules、.git、.env、.dev.vars、真实账单、数据库导出。
- iPhone 是添加到主屏幕的 PWA；电脑 Chrome/Edge 可安装。不是 IPA/APK/EXE 原生安装包。

## 3. 已实现功能

### 3.1 日常财务账本

支持 HKD/CNY 账户、初始余额、收入、支出、本人账户转账、换汇实际扣款/到账及手续费、非收入消费的资金转入/转出、待支付支出预留、账户余额、消费分类筛选、备份导入导出。

金额按整数分存储。参考汇率可手动调整，不是实时行情，历史折算也使用当前参考汇率。预算预测使用最近最多30天的日均消费；记录跨度不足7天时使用用户设定预算。未记账日期计入跨度，数据不足会影响预测。预留支付关联的支出不混入日常消费预测。预留不自动周期重复。

NETHAO LIMITED 匹配忽略大小写、全角和多空格，支出默认娱乐；不将收入或资金往来误归娱乐。允许用户覆盖分类。批量修改只作用于选中支出的分类，支持撤销及并发变更检查，不改金额、账户、原始账单字段。

### 3.2 历史账单导入与 A−B 去重

支持微信支付原始 XLSX 和汇丰原始文字版 PDF。文件、PDF密码在本地处理；确认后的明细原文与来源信息按同步配置上传自己的 D1。扫描件、未知版式、缺行或余额核对失败会报错并阻止导入，不能声称支持所有时期和所有银行版式。

微信：按表头逐行读取，核对导出汇总；Excel 日期序号保持原始钟面时间。原始消费与独立退款分别保留，不凭“已退款”状态抹掉原始扣款。失败/取消、中性交易保留原文并按实际方向处理。

汇丰：按文本坐标识别日期、描述、存入、支出、余额；处理跨页、省略日期、跨年和外币账户；逐段以及期初＋存入−支出＝期末核对。入账日期与描述中的消费日期区分。

每笔来源标识经过 SHA-256；交易 ID 为确定性 UUID。微信来源键结合交易单号、时间和收支方向；缺单号时采用组合字段。汇丰缺少逐笔单号时采用账户、币种、日期、方向、金额、完整描述和重复出现序号。

先导入 B，再导入覆盖更长范围的 A：只追加未出现的来源键，即 A−B；旧记录的备注和分类不被覆盖。文件名、文件内容哈希变化不会单独导致重复入账。导入预览展示新增和重复跳过数量。索引使用 Set，避免逐行扫描全部历史交易。

重要边界：这不是跨任意来源的语义去重。手动记账、微信账单、银行账单、Apple Pay 之间没有共同标识时，只提示疑似重复。汇丰同日同描述同额多笔按出现序号保留，若新导出截断同日重复序列，可能产生歧义，需要人工核对。不能仅凭同日同金额自动删除。

导入历史保存所有已识别来源键；用户主动删除某笔后，旧文件不会自动将其复活。撤销批次删除该批次新增记录，已有编辑也会随之删除，需先备份。撤销后可重导；重叠批次的历史键仍应审慎处理。

### 3.3 金融实验室研究记录

研究事件包含标题、来源链接、事件日期、记录时间、研究对象、原始假设、方向、基线、基准、观察截止日、证伪条件、置信度、观察数据和追加复盘。支持 CSV 观察数据、百分比变化图、Markdown 导出、复制 AI 复核提示词。

原始事件/观察/复盘采用历史保护，修正应追加记录。服务端首次接收时记录时间；离线本机时间不等于可证明的事前预测。自己控制数据库仍可改库，所以不是不可篡改审计系统。没有自动交易、自动行情或买卖执行。

### 3.4 自动新闻推荐与系统通知

主题：人工智能、审计、金融科技。每小时 Cron 拉取新闻；香港时间09:00、19:00默认发送有新内容的摘要。每台设备可改主题和频率；无新内容不发空通知。

9个逻辑源：三个主题的 Google News RSS 搜索（失败切 Bing RSS）；Google AI、NVIDIA、IAASB、Journal of Accountancy、Finextra、香港金管局 RSS。不是全网无限爬取，也不是大模型自动理解新闻。按关键词、发布时间和来源类型排序，来源短摘录展示，规则生成推荐理由及研究问题。

缓存最多30天/450条；推荐主要近7天；通知候选为近48小时且未推送条目，单次最多6条。标题规范化去重，优先官方来源；个人观点文章降权。失败源保留旧缓存，页面展示成功时间与源状态；前端本机缓存可离线读。

Web Push：使用 web-push 库的 VAPID/aes128gcm，经 FCM/APNs/Mozilla/WNS 等服务发送；不是手写加密协议。SW 接收并显示通知，点击进入实验室。设备端点、订阅公钥、偏好和去重状态在 D1 独立表，不把账本内容放入通知。

已发生的真实问题：Cloudflare fetch 不支持 redirect:'error'，导致发送之前即503。已改为 redirect:'manual'，3xx视为失败，禁止跟随重定向传递推送凭据。修复后 Apple 推送服务曾返回接收成功；不等于已经证明手机最终显示或每次定时都可靠送达。

需要用户逐设备同意通知；iPhone从主屏幕PWA开启。系统权限、网络、专注模式可能影响显示。服务已接收、手机已显示、定时任务实际成功必须分开表述。

### 3.5 PWA 离线、更新与同步

IndexedDB 本机保存，离线可记账。SW 缓存静态资源；页面导航网络优先、离线回退；哈希静态资源当前缓存优先，保留一个旧版本缓存，API不缓存。

新版本检测：等待注册就绪后监听安装；前台每60秒、窗口focus、恢复联网、visibilitychange主动检查。注册 updateViaCache:'none'。出现提示后用户点击更新，通过 SKIP_WAITING 和 controllerchange 刷新，避免自动丢失表单。

同步：前台每15秒及联网/focus时尝试；应用关闭不保证后台同步。云端快照 revision 条件更新，旧版本拒绝409；客户端保存上次成功同步基线，进行 base/local/remote 三方合并。不同条目/字段自动合并，同字段冲突、删除编辑冲突显式选择；不是 DeepSeek参考项目的 updatedAt+墓碑算法。

## 4. Apple Pay 快捷指令：当前进度（最需要接续的部分）

接收接口已实现并部署：POST /api/capture/apple-pay。

请求头：Authorization: Bearer <用户自己的同步密钥>；Content-Type: application/json。不要向 DeepSeek 提供真实密钥，不要放进URL。

请求体示例（虚构账户，dryRun为布尔值）：

```json
{
  "eventId": "20261115-0900-4000-8000-123450000000",
  "accountName": "我的港币卡",
  "currency": "HKD",
  "amount": "12.34",
  "merchant": "示例商户",
  "dryRun": true
}
```

accountName必须对应唯一且已同步的同币种账户。不自动新建账户、不自动换汇。金额为元、最多两位小数，服务端转整数分，必须大于0。dryRun必须明确提供布尔值；true只校验不写账。接口清理字段名两端空白，币种trim并大写；不猜测字典/列表等错误类型。错误返回字段名、类型、收到的键名，不回传字段值、密钥或财务明细。

dryRun=false时新增expense；备注Apple Pay · 商户，类别按现有商户规则识别；日期使用请求接收时的香港日期。通过原快照API校验、CAS写入；并发冲突最多4轮。同eventId生成相同交易ID，已存在时内容一致返回duplicate；内容冲突返回409。用户删除该交易后重放的情况并没有独立永久幂等流水表。

用户手机的实际配置：
1. 快捷指令→自动化→钱包交易→选择卡片→立即运行→界面显示“创建新快捷指令”。不是旧指导里不存在的“新建空白自动化”。
2. 用户系统搜索UUID无结果，改为“当前日期”→“格式化日期”→自定义：
   `yyyyMMdd-HHmm-'4000-8000'-ssSSS'0000000'`
   这是时间派生的合法UUID格式字符串，不是真随机UUID；同一时间精度内运行有碰撞可能，不能夸大唯一性。多次运行产生新编号，因此整条重跑不是相同请求的自动重试。
3. 获取URL内容→上述接口→POST→JSON；eventId选“格式化后的日期”。若系统将日期变量转成其他格式，可先用“文本”操作固定输出。
4. 固定文本字段连接测试已经由用户截图确认成功：ok=true，dryRun=true，未写入账本。
5. 最初一些字段漏填；服务端曾只报笼统错误，后补逐字段诊断，现已查明漏填而非已证实的iOS网络故障。
6. 用户将amount选为“输入快捷指令的信息”的交易类型下“数量”，merchant选“商家”；属性列表包含交易、卡片或凭证、商家、数量、名称。需要确保勾选数量，而非整笔交易。
7. 当前仍应保持dryRun=true。没有确认真实付款字段的金额正确性，也没有确认dryRun=false后的用户实际入账成功。
8. 用户问八达通充值是否触发，答复为不能保证：所选规则是轻触钱包卡片，App内充值和自动增值不应默认视为相同触发。用户充值后要求查看，云端检查无Apple Pay记录；但dryRun不保存请求历史，不能用“无记录”断言“没触发”。用户尚未提供本次充值的触发成功结果。

缺口：没有离线排队/自动补传；没有测试请求历史/最近收到状态；没有完整真实交易字段回显核对页面；目前响应dryRun只说明格式通过，不证明金额等于真实扣款。不能宣称所有Apple Pay、线上支付、Apple Watch、八达通增值都覆盖。

八达通充值应按账户间资金转移处理；当前快捷指令接口只新增expense，尚未支持自动充值转账分流。不能用此接口默默把充值和后续实际消费各算一次。微信个人支付尚未接入自动记账，商户账单API不能当作个人消费接口。

## 5. 架构与数据模型

```
iPhone PWA / 桌面浏览器
  ├─ React UI + IndexedDB（账本、同步基线、配置）
  ├─ Service Worker（静态缓存、更新、推送接收）
  └─ HTTPS + 同步密钥
       ↓
Cloudflare Worker（静态资源 + API + hourly Cron）
  ├─ D1 snapshots：单用户整本账本JSON、revision、updated_at
  ├─ D1 news_cache / news_locks
  ├─ D1 news_subscriptions / news_deliveries
  ├─ RSS源：每小时抓取
  └─ VAPID加密 → 浏览器推送服务

iPhone快捷指令 → POST capture/apple-pay → 原快照API/CAS → D1
```

状态对象：accounts、transactions、plans、settings、events、imports。transactions包含id/type/account/to/amount/received/fee/category/note/date/planId，可选direction/source。source保留provider/key/fileId/batchId/fileName/location/timestamp/status/raw。导入批次保存keys、added/duplicates、checks、新增账户等。

数据库迁移：0001_snapshots.sql建立单行快照表；0002_news.sql建立缓存、锁、订阅、投递记录。同一个部署是单用户共享密钥账本，不是多人租户平台。

主要API：
- GET/PUT /api/state：鉴权、读快照/条件更新。
- GET /api/news：公开新闻缓存。
- GET /api/news/config：公开VAPID公钥及默认设置，非私钥。
- POST /api/news/refresh：鉴权、手动刷新、有冷却和锁。
- GET /api/news/diagnostics：鉴权、签名加密自检。
- GET /api/news/subscription?id=...：鉴权、查询设备订阅。
- POST/DELETE /api/news/subscriptions：鉴权、保存或关闭设备。
- POST /api/news/test：鉴权、测试通知、限频。
- POST /api/capture/apple-pay：鉴权、金额校验、dryRun或新增支出。

## 6. 代码导航

| 路径 | 职责 |
|---|---|
| src/main.tsx / ledger.tsx / styles.css | 入口、路由、日常账本界面 |
| src/store.mjs / use-cloud.ts | IndexedDB、保存、同步、订阅状态 |
| src/connection.tsx / sw-updates.mjs | 同步安装设置、冲突UI、更新检测 |
| src/statement-import.tsx / import-readers.ts | 账单解析入口、预览、PDF/XLSX加载 |
| src/lab/lab.tsx / news-panel.tsx | 研究记录、新闻卡片、设备通知管理 |
| lib/finance.mjs / categories.mjs | 财务计算、商户与批量分类 |
| lib/validation.mjs / merge.mjs | Zod数据约束、三方合并 |
| lib/statement-import.mjs / xlsx-rows.mjs | 解析、坐标、金额、日期与来源键 |
| lib/import-apply.mjs / import-history.mjs | 来源去重、写入撤销、历史保护 |
| lib/lab.mjs / history.mjs | 观察CSV、变化计算、实验历史保护 |
| lib/news.mjs | 新闻源、RSS解析、筛选去重、摘要时段 |
| sync-worker/index.mjs / auth.mjs / capture.mjs | 路由、快照API、鉴权、快捷指令 |
| sync-worker/news-refresh.mjs / news-push.mjs / news-routes.mjs | 源刷新、Web Push、新闻API与Cron |
| sync-worker/wrangler.jsonc / migrations | Worker绑定、部署、数据库结构 |
| scripts/build-sw.mjs / release.mjs / serve.mjs | SW生成、ZIP发布、本地运行 |
| scripts/check-news.mjs / check-statements.mjs | 在线源或用户账单本机核验 |
| scripts/create-sync-key.mjs / create-webpush-keys.mjs | 生成自有部署的密钥 |
| tests/*.test.mjs | 财务、分类、同步、账单、新闻、历史、更新测试 |
| public / .github/workflows/pages.yml | manifest/icons、可选Pages构建 |

关键依赖按package-lock锁定：React19.2.6、TypeScript5.9.3、Vite8.0.13、Zod3.25.76、SheetJS0.20.3、pdfjs-dist6.5系列、fast-xml-parser5.12.0、web-push4.0.0、lucide-react。Web Push库为MPL2，应用自有代码MIT；见THIRD_PARTY_NOTICES.md。

## 7. 安全与账号边界

本机忽略文件.env.sync-local保存同步原始密钥等；.env.webpush-local保存VAPID公私钥。绝不能交给其他AI、放源码ZIP、写进前端、公开日志或截图。Cloudflare OAuth凭据也不应分享。

同步密钥可读写整本共享账本，当前快捷指令复用它，没有单独“只能新增”的最小权限令牌。浏览器配置不进入账本备份。服务端保存同步密钥SHA256，恒定时间比较；数据HTTPS传输，但D1账本不是端到端加密。Cloudflare、浏览器推送服务是第三方基础设施，不能声称数据不经过任何第三方服务器。

来源CORS默认同源；分离前端需显式ALLOWED_ORIGINS。推送服务地址白名单及订阅密钥长度检查，禁止任意URL发送。RSS限制大小、协议和XML实体。数据与新闻表独立。不要为了排障把真实快照、完整日志、推送订阅或账单打进交接包。

## 8. 本地运行、测试、自部署

Node.js >=22.13；npm ci → npm test → npx tsc --noEmit → npm run build → npm start。默认本地http://127.0.0.1:4173。开发用npm run dev。解压预构建包可node scripts/serve.mjs或start-windows.cmd，仍需要Node；不能双击index.html代替服务。

本次整理重新运行57项node:test：57通过、0失败。类型检查另行运行。覆盖真实SQLite条件写入、三方合并、财务计算、合成账单解析/重叠导入、来源保护、RSS/日期/降级、香港推送时段与去重、Web Push接收端解密及VAPID验证、更新生命周期、快捷指令鉴权/金额/幂等/dryRun/诊断。57项通过不代表完成所有真机/所有银行版式的端到端验证。

自部署简要步骤：
1. npm ci；在自己的Cloudflare登录Wrangler，创建D1。
2. 修改sync-worker/wrangler.jsonc的Worker名称、database_id、NEWS_SITE_ORIGIN；不能将现有用户实例误当成自己的免费后端。
3. npx wrangler@4.92.0 d1 migrations apply DB --remote --config sync-worker/wrangler.jsonc
4. 生成自己的同步密钥，把SHA256作为SYNC_TOKEN_HASH Worker secret；原始密钥填客户端。
5. 若需推送，生成自己的VAPID密钥，分别配置VAPID_PUBLIC_KEY与VAPID_PRIVATE_KEY secret。不要随意轮换已有推送私钥。
6. npm run build；npx wrangler@4.92.0 deploy --config sync-worker/wrangler.jsonc。
7. 前端和Worker同源最简单；GitHub Pages分离时配置允许来源。
8. npm run release生成source/app ZIP及SHA256SUMS，不包含依赖目录或运行时secret。

Windows开发注意：本目录包含&。已有环境曾用node.cmd包装器导致路径参数解析问题；优先使用实际node.exe或正确单引号路径。无需把开发者机器上的借用Wrangler路径当成项目运行依赖。

## 9. 已知问题、下一步建议与接续约束

优先事项：真实刷卡触发验证；安全的最近请求状态（至少时间、dryRun、成功/失败，不保存密钥）；用dryRun核对实际金额/商户/卡；明确币种/账户映射；离线队列与稳定请求ID；充值/退款/撤销处理；Apple Pay与后续银行账单对账；快捷指令独立受限令牌；新旧客户端兼容与测试。

不能将“接口收到”说成“账目已写入”；不能将“dryRun格式校验通过”说成“金额真实准确”；不能将“推送服务201/200”说成“手机已展示”；不能将A−B来源键去重说成任意渠道完全自动识别同笔交易。

如果继续实现，保留已有真实账本和现有同步机制，不要擅自重置D1/IndexedDB、修改账户初始余额或批量重分类；别用真实消费数据写测试。先检查工作区未提交变更，不要覆盖它们。

## 10. 可以直接发给 DeepSeek 的任务说明

请先阅读本文与源码，以当前工作区/ZIP为准，不要假设旧Git提交就是最新版本。这个项目是实际运行中的独立开源PWA，不要重写成依赖GPT的工具。请区分已实现、仅服务端验证、仅用户界面配置、尚未真机验证四种状态。当前重点是Apple Pay快捷指令可靠入账与后续账单对账，请评估真实交易字段、事件ID、权限隔离、币种账户映射、离线补传、充值退款及跨来源重复。请先给出基于代码的具体问题和最小改进方案，保留已有数据与功能，不要索要或公开同步密钥、VAPID私钥、Cloudflare凭据或原始个人账单。
