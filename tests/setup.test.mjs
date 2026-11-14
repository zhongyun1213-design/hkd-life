import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDatabaseId, parseWorkerUrl } from '../scripts/setup-cloudflare.mjs';

test('从 wrangler d1 create 的输出里取出 database_id', () => {
  const toml = `✅ Successfully created DB 'hkd-life'
To access your new D1 database in your Worker, add the following snippet to your configuration file:
[[d1_databases]]
binding = "DB"
database_name = "hkd-life"
database_id = "2ce4c6b0-cdaf-4cc9-99c4-acc8c1d436b2"`;
  assert.equal(parseDatabaseId(toml), '2ce4c6b0-cdaf-4cc9-99c4-acc8c1d436b2');
});

test('没有 database_id 字段时也能从纯 UUID 里取', () => {
  assert.equal(parseDatabaseId('created: 8b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e'), '8b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e');
  assert.equal(parseDatabaseId('什么都没有'), null);
});

test('从部署输出里取出 workers.dev 地址，并去掉结尾斜杠', () => {
  assert.equal(
    parseWorkerUrl('Deployed hkd-life triggers\n  https://hkd-life.polyu-push-7e.workers.dev\n'),
    'https://hkd-life.polyu-push-7e.workers.dev'
  );
  assert.equal(parseWorkerUrl('Deployed\n  https://hkd-life.example.workers.dev/\n'), 'https://hkd-life.example.workers.dev');
  assert.equal(parseWorkerUrl('no url here'), null);
});
