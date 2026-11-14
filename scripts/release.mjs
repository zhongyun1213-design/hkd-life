import { readdir,readFile,writeFile,mkdir,stat } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
// Small dependency-free ZIP writer (stored entries) keeps release packaging portable.
const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
const crc32=buf=>{let c=0xffffffff;for(const b of buf)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
async function walk(dir){const files=[];for(const item of await readdir(dir,{withFileTypes:true})){if(['.wrangler','node_modules','.git'].includes(item.name)||item.name.startsWith('.env')||item.name.startsWith('.dev.vars'))continue;const p=path.join(dir,item.name);if(item.isDirectory())files.push(...await walk(p));else files.push(p.replaceAll('\\','/'));}return files;}
async function zip(target,files){const chunks=[],central=[];let offset=0;for(const file of files.sort()){const data=await readFile(file),name=Buffer.from(file),crc=crc32(data),head=Buffer.alloc(30);head.writeUInt32LE(0x04034b50);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);head.writeUInt16LE(0x21,12);head.writeUInt32LE(crc,14);head.writeUInt32LE(data.length,18);head.writeUInt32LE(data.length,22);head.writeUInt16LE(name.length,26);chunks.push(head,name,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(0x21,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=head.length+name.length+data.length;}const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);await writeFile(target,Buffer.concat([...chunks,directory,end]));}
await stat('dist/sw.js');await mkdir('release',{recursive:true});
const roots=['src','lib','public','scripts','tests','sync-worker','.github'];const source=['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','README.md','PROJECT_HANDOFF.md','LICENSE','THIRD_PARTY_NOTICES.md','.gitignore','start-windows.cmd'];
for(const d of roots)source.push(...await walk(d));
// Allowlist release inputs, never crawl the working tree or include runtime secrets.
const safe=source.filter(p=>!p.split('/').some(s=>s.startsWith('.dev.vars')||s.startsWith('.env')||s==='.wrangler'||s==='node_modules'));
await zip('release/hkd-life-source.zip',safe);
await zip('release/hkd-life-app.zip',[(await walk('dist')).filter(p=>!p.startsWith('dist/downloads/')),'scripts/serve.mjs','start-windows.cmd','README.md','PROJECT_HANDOFF.md','LICENSE','THIRD_PARTY_NOTICES.md'].flat());
let sums='';for(const f of ['hkd-life-source.zip','hkd-life-app.zip'])sums+=createHash('sha256').update(await readFile('release/'+f)).digest('hex')+'  '+f+'\n';await writeFile('release/SHA256SUMS.txt',sums);console.log('Created source and app ZIPs in release/');
