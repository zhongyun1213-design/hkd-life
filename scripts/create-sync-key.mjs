import { randomBytes,createHash } from 'node:crypto';
const key=randomBytes(32).toString('base64url');
console.log('同步密钥（只填到你自己的设备，妥善保管）：\n'+key);
console.log('\n服务端 SYNC_TOKEN_HASH（复制到 wrangler secret put 的提示中）：\n'+createHash('sha256').update(key).digest('hex'));
