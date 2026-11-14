#!/usr/bin/env node
// 一条命令把「同步 + 推送」需要的东西准备好：
//   Cloudflare 登录 → 建 D1 → 写 database_id → 跑迁移 → 生成同步密钥 → 设 secret → 建 VAPID → 构建 → 部署
// 用法：
//   node scripts/setup-cloudflare.mjs            # 真的执行
//   node scripts/setup-cloudflare.mjs --dry-run  # 只打印步骤，不改任何东西
// 前置：已安装 Node >= 22.13，能联网；Cloudflare 登录会在浏览器里点一次授权。

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const WRANGLER_VERSION = 'wrangler@4.92.0';
const CONFIG = 'sync-worker/wrangler.jsonc';
const DB_NAME = 'hkd-life';
const DRY = process.argv.includes('--dry-run');
const IS_WIN = process.platform === 'win32';

export function parseDatabaseId(output) {
  const text = String(output || '');
  const quoted = /database_id"?\s*[:=]\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i.exec(text);
  if (quoted) return quoted[1];
  const plain = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i.exec(text);
  return plain ? plain[1] : null;
}

export function parseWorkerUrl(output) {
  const match = /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev\/?/i.exec(String(output || ''));
  return match ? match[0].replace(/\/$/, '') : null;
}

function npxName() {
  return IS_WIN ? 'npx.cmd' : 'npx';
}

function run(args, { capture = false, input = null, allowFail = false } = {}) {
  const printable = ['npx', WRANGLER_VERSION, ...args].join(' ');
  console.log(`\n$ ${printable}`);
  if (DRY) return { status: 0, stdout: '' };
  const result = spawnSync(npxName(), ['--yes', WRANGLER_VERSION, ...args], {
    encoding: 'utf8',
    input: input ?? undefined,
    stdio: capture ? ['pipe', 'pipe', 'inherit'] : [input ? 'pipe' : 'inherit', 'inherit', 'inherit']
  });
  if (result.error) {
    console.error('无法启动 npx：', result.error.message);
    process.exit(1);
  }
  if (result.status !== 0 && !allowFail) {
    console.error(`\n这一步失败了：${printable}`);
    console.error('可以重跑本脚本；已经建好的资源不会重复创建。');
    process.exit(result.status || 1);
  }
  return { status: result.status, stdout: result.stdout || '' };
}

function readJsonc(file) {
  return readFileSync(file, 'utf8');
}

function writeDatabaseId(file, id) {
  const text = readJsonc(file);
  const next = text.replace(/"database_id"\s*:\s*"[^"]*"/, `"database_id": "${id}"`);
  if (next === text) throw new Error(`没能在 ${file} 里找到 database_id 字段`);
  writeFileSync(file, next, 'utf8');
}

function workerName(file) {
  const match = /"name"\s*:\s*"([^"]+)"/.exec(readJsonc(file));
  return match ? match[1] : 'hkd-life';
}

function secretPut(name, value) {
  return run(['secret', 'put', name, '--config', CONFIG], { input: `${value}\n` });
}

async function main() {
  console.log('港币生活 · 一键 Cloudflare 部署');
  console.log(DRY ? '（dry-run：只打印计划，不会真的执行）' : '');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    console.error(`需要 Node >= 22.13，当前是 ${process.versions.node}`);
    process.exit(1);
  }
  if (!existsSync(CONFIG)) {
    console.error(`请在项目根目录运行（找不到 ${CONFIG}）`);
    process.exit(1);
  }

  if (DRY) {
    console.log(`
计划执行：
  1. npx wrangler whoami（未登录则 npx wrangler login）
  2. npx wrangler d1 create ${DB_NAME}
  3. 把 database_id 写入 ${CONFIG}
  4. npx wrangler d1 migrations apply DB --remote --config ${CONFIG}
  5. 生成 32 字节同步密钥，SHA-256 写入 secret SYNC_TOKEN_HASH
  6. 生成 VAPID 密钥，写入 secret 与 .env.webpush-local
  7. npm run build && npx wrangler deploy
  8. 输出应用地址与同步密钥，并写入 .env.sync-local`);
    return;
  }

  const name = workerName(CONFIG);
  console.log(`\nWorker 名称：${name}`);

  // 1. 登录状态
  const who = run(['whoami'], { capture: true, allowFail: true });
  if (who.status !== 0) {
    run(['login']);
  } else {
    console.log('已登录 Cloudflare。');
  }

  // 2. 建 D1（已存在就查 id）
  const created = run(['d1', 'create', DB_NAME], { capture: true, allowFail: true });
  let databaseId = parseDatabaseId(created.stdout);
  if (!databaseId) {
    console.log('这个 D1 可能已经存在，尝试从列表里找。');
    const listed = run(['d1', 'list', '--json'], { capture: true, allowFail: true });
    try {
      const rows = JSON.parse(listed.stdout || '[]');
      const found = Array.isArray(rows) ? rows.find((row) => row && row.name === DB_NAME) : null;
      databaseId = found && found.uuid ? found.uuid : null;
    } catch {
      databaseId = null;
    }
  }
  if (!databaseId) {
    console.error('\n没能拿到 database_id。可以手动运行：npx wrangler d1 list，把 id 填进 ' + CONFIG);
    process.exit(1);
  }
  console.log(`database_id：${databaseId}`);
  writeDatabaseId(CONFIG, databaseId);

  // 3. 迁移
  run(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', CONFIG]);

  // 4. 同步密钥：只把 SHA-256 放服务端，原文留给你
  const syncKey = randomBytes(32).toString('hex');
  const syncHash = createHash('sha256').update(syncKey).digest('hex');
  secretPut('SYNC_TOKEN_HASH', syncHash);

  // 5. 推送密钥（有 web-push 就自动生成，失败不阻塞）
  let vapidNote = '未配置（可选）';
  try {
    const { default: webpush } = await import('web-push');
    const keys = webpush.generateVAPIDKeys();
    writeFileSync('.env.webpush-local', `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`, { mode: 0o600 });
    secretPut('VAPID_PUBLIC_KEY', keys.publicKey);
    secretPut('VAPID_PRIVATE_KEY', keys.privateKey);
    vapidNote = '已生成并写入 .env.webpush-local（不要提交）';
  } catch (error) {
    console.warn('跳过推送密钥：', error.message);
  }

  // 6. 构建 + 部署
  console.log('\n$ npm run build');
  const build = spawnSync(IS_WIN ? 'npm.cmd' : 'npm', ['run', 'build'], { stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status || 1);
  const deployed = run(['deploy', '--config', CONFIG], { capture: true });
  const url = parseWorkerUrl(deployed.stdout) || '(部署输出里没解析到地址，请手动查看上面的日志)';

  const envFile = '.env.sync-local';
  writeFileSync(envFile, `SYNC_ENDPOINT=${url}/api/state\nSYNC_KEY=${syncKey}\n`, { mode: 0o600 });

  console.log('\n================ 部署完成 ================');
  console.log('应用地址：', url);
  console.log('同步接口：', `${url}/api/state`);
  console.log('同步密钥：', syncKey);
  console.log('推送密钥：', vapidNote);
  console.log(`\n本机已保存到 ${envFile}（不要提交到 Git）。`);
  console.log('手机和电脑各自打开应用 → 右下角「同步与安装」→ 填上面的同步地址和密钥。');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error('\n出错了：', error.message);
    process.exit(1);
  });
}
