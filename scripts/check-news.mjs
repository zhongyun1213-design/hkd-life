// Live source smoke test; uses an in-memory database and never reads the ledger.
import{DatabaseSync}from'node:sqlite';import{readFileSync}from'node:fs';
import{refreshNews}from'../sync-worker/news-refresh.mjs';
const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../sync-worker/migrations/0002_news.sql',import.meta.url),'utf8'));
const DB={prepare(sql){const wrapper=args=>({bind(...a){return wrapper(a);},async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){const result=sqlite.prepare(sql).run(...args);return{meta:{changes:result.changes}};}});return wrapper([]);}};
const news=await refreshNews({DB});console.log(JSON.stringify({articleCount:news.articles.length,sources:news.sources},null,2));
if(!news.sources.some(s=>s.ok))process.exitCode=1;
