import { readdir,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const files=[];async function walk(dir){for(const d of await readdir(dir,{withFileTypes:true})){if(d.name==='downloads')continue;const p=path.join(dir,d.name);if(d.isDirectory())await walk(p);else if(d.name!=='sw.js')files.push(p.replaceAll('\\','/').replace(/^dist\//,''));}}
await walk('dist');const hash=createHash('sha256');for(const f of files.sort())hash.update(await readFile('dist/'+f));const version=hash.digest('hex').slice(0,16);
await writeFile('dist/sw.js',`const CACHE='hkd-life-${version}';const FILES=${JSON.stringify(files)};const root=self.registration.scope;
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new URL(f,root).href)))));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();if(e.data?.type==='PUSH_CAPABILITIES')e.ports?.[0]?.postMessage({push:true});});
self.addEventListener('activate',e=>e.waitUntil((async()=>{const keys=(await caches.keys()).filter(k=>k.startsWith('hkd-life-'));const previous=keys.filter(k=>k!==CACHE).at(-1);await Promise.all(keys.filter(k=>k!==CACHE&&k!==previous).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/api/')||!u.href.startsWith(root))return;
if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match(new URL('index.html',root).href))));return;}
if(FILES.some(f=>new URL(f,root).href===u.href)||u.pathname.includes('/assets/'))e.respondWith(caches.open(CACHE).then(c=>c.match(e.request)).then(c=>c||caches.match(e.request)).then(c=>c||fetch(e.request)));});
self.addEventListener('push',e=>{let data={};try{data=e.data?.json()||{};}catch{}const title=String(data.title||'金融实验室 · 新事件推荐').slice(0,100);e.waitUntil(self.registration.showNotification(title,{body:String(data.body||'打开金融实验室查看最新推荐。').slice(0,500),icon:new URL('icon-192.png',root).href,badge:new URL('icon-192.png',root).href,tag:String(data.tag||'news-update').slice(0,80),data:{url:new URL('./#/lab',root).href}}));});
self.addEventListener('notificationclick',e=>{e.notification.close();const target=new URL('./#/lab',root).href;e.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if(client.url.startsWith(root)&&'focus'in client){await client.navigate(target);return client.focus();}}return self.clients.openWindow(target);})());});
`);
console.log('Offline shell generated:',version,files.length,'assets');
