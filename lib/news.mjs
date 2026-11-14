import { XMLParser,XMLValidator } from 'fast-xml-parser';
export const topics={ai:'人工智能',audit:'审计',fintech:'金融科技'};
const patterns={ai:/\bAI\b|artificial intelligence|machine learning|generative|\bLLM\b|agentic|人工智能|人工智慧|大模型|智能体|智能體|機器學習|机器学习/i,audit:/\baudit(?:ing|or|ors)?\b|assurance|IAASB|\bISSA?\b|審計|审计|核數|核数|鉴证|鑒證|会计师|會計師/i,fintech:/fintech|tokeni[sz]|stablecoin|\bCBDC\b|digital (?:currency|bank|asset)|\bpayments?\b|regtech|virtual asset|金融科技|代幣|代币|稳定币|穩定幣|支付|数字货币|數字貨幣|虛擬資產|虚拟资产|數碼港元|数字金融|數字金融/i};
export const sourceFeeds=[
 ...Object.entries({ai:'("人工智能" OR "AI" OR "大模型") when:7d',audit:'("审计" OR "審計" OR "auditing" OR "IAASB") when:7d',fintech:'("金融科技" OR "fintech" OR "稳定币" OR "代幣化") when:7d'}).map(([topic,query])=>({id:'search-'+topic,name:'新闻搜索 · '+topics[topic],topic,kind:'search',url:'https://news.google.com/rss/search?'+new URLSearchParams({q:query,hl:'zh-HK',gl:'HK',ceid:'HK:zh-Hant'}),fallbackURL:'https://www.bing.com/news/search?'+new URLSearchParams({q:{ai:'artificial intelligence',audit:'auditing OR IAASB OR PCAOB',fintech:'fintech OR tokenisation OR stablecoin'}[topic],format:'rss',mkt:'en-HK',qft:'interval="7"'})})),
 {id:'google-ai',name:'Google AI 官方博客',topic:'ai',kind:'official',url:'https://blog.google/technology/ai/rss/'},
 {id:'nvidia',name:'NVIDIA 官方博客',topic:'ai',kind:'official',url:'https://blogs.nvidia.com/feed/'},
 {id:'iaasb',name:'IAASB 官方',topic:'audit',kind:'official',url:'https://www.iaasb.org/rss.xml'},
 {id:'joa',name:'Journal of Accountancy',topic:'audit',kind:'professional',url:'https://www.journalofaccountancy.com/feed.html'},
 {id:'finextra',name:'Finextra 金融科技报道',topic:'fintech',kind:'professional',url:'https://www.finextra.com/rss/headlines.aspx'},
 {id:'hkma-rss',name:'香港金管局 RSS',topic:'fintech',kind:'official',url:'https://www.hkma.gov.hk/chi/other-information/rss/rss_press-release.xml'},
];
export function plainText(value){
 if(value&&typeof value==='object')value=value['#text']||value.__cdata||'';
 return String(value||'').replace(/<\s*(script|style)[\s\S]*?<\/\s*\1\s*>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,s=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[s])).replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=0x10ffff?String.fromCodePoint(c):'';}).replace(/\s+/g,' ').trim();
}
export function canonicalURL(raw){try{let u=new URL(plainText(raw));if((u.hostname==='www.bing.com'||u.hostname==='bing.com')&&u.pathname==='/news/apiclick.aspx'&&u.searchParams.get('url'))u=new URL(u.searchParams.get('url'));if(u.protocol!=='https:'||u.username||u.password)return null;u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid|ref)$/i.test(k))u.searchParams.delete(k);return u.href.length<=2000?u.href:null;}catch{return null;}}
export function classifyNews(text,fallback){const found=Object.keys(topics).filter(t=>patterns[t].test(text));return found.length?found:(fallback?[fallback]:[]);}
export function parseFeed(text,feed){
 if(text.length>2e6||/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('源文件过大或含不支持的实体声明');
 if(feed.format==='hkma'){
  const d=JSON.parse(text);if(d.header?.success!==true||!Array.isArray(d.result?.records))throw Error('金管局接口格式无效');
  return d.result.records.slice(0,100).map(r=>({title:r.title,url:r.link,publishedAt:r.date+'T00:00:00+08:00',source:feed.name,excerpt:''}));
 }
 if(XMLValidator.validate(text)!==true)throw Error('新闻源不是有效的 RSS / Atom');
 const parsed=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',processEntities:false,trimValues:true,parseTagValue:false}).parse(text);
 const items=parsed.rss?.channel?.item??parsed.feed?.entry;
 if(items===undefined&&!parsed.rss?.channel&&!parsed.feed)throw Error('新闻源缺少 RSS / Atom 根节点');
 return (items===undefined?[]:Array.isArray(items)?items:[items]).slice(0,100).map(i=>{
  const links=Array.isArray(i.link)?i.link:[i.link],link=links.find(l=>typeof l==='object'&&(!l['@_rel']||l['@_rel']==='alternate'))||links[0];
 const source=plainText(i.source||i['News:Source'])||feed.name;
  return {title:plainText(i.title),url:typeof link==='string'?link:link?.['@_href']||link?.['#text'],publishedAt:i.pubDate||i.published||i.updated||i['dc:date'],source,excerpt:feed.kind==='search'?'':plainText(i.description||i.summary||'').slice(0,180)};
 });
}
export async function newsId(text){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(h)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function normalizeNews(raw,feed,now=new Date()){
 const title=plainText(raw.title),url=canonicalURL(raw.url),date=new Date(raw.publishedAt),age=+now-+date;
 if(!title||title.length>700||!url||!Number.isFinite(+date)||age< -6*3600000||age>30*86400000)return null;
 const publisher=plainText(raw.source||'');
 const suffix=publisher.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const titleWithoutPublisher=publisher?title.replace(new RegExp('\\s[-–—|]\\s'+suffix+'$','i'),'').trim():title;
 const categories=classifyNews(title+' '+(raw.excerpt||''),feed.kind==='search'||feed.id==='iaasb'?feed.topic:null);
 if(feed.id==='finextra'&&!categories.includes('fintech'))categories.push('fintech');
 if(!categories.length)return null;
 const fingerprint=titleWithoutPublisher.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
 const id=await newsId(fingerprint);
 const commentary=/^(?:www\.)?(?:note\.com|medium\.com|reddit\.com)$/.test(new URL(url).hostname)||new URL(url).hostname.endsWith('.substack.com');
 const kind=commentary?'commentary':feed.kind==='official'?'official':feed.kind==='professional'?'professional':'media';
 return {id,title:feed.kind==='search'?titleWithoutPublisher:title,url,publishedAt:date.toISOString(),source:plainText(raw.source||feed.name).slice(0,120),excerpt:plainText(raw.excerpt).slice(0,180),topics:categories,kind,feedId:feed.id,discoveredAt:now.toISOString(),score:({official:20,professional:15,media:0,commentary:-50}[kind])+(categories.length>1?5:0)+Math.max(0,30-age/3600000)};
}
export function combineNews(oldItems,incoming,now=new Date()){
 const map=new Map();for(const a of [...oldItems,...incoming]){if(!a?.id||+now-Date.parse(a.publishedAt)>30*86400000)continue;const old=map.get(a.id);if(!old){map.set(a.id,a);continue;}const rank={official:3,professional:2,media:1,commentary:0};const preferred=(rank[a.kind]||0)>(rank[old.kind]||0)||a.feedId===old.feedId?a:old;map.set(a.id,{...preferred,topics:[...new Set([...old.topics,...a.topics])],discoveredAt:old.discoveredAt});}
 return [...map.values()].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||b.score-a.score).slice(0,450);
}
export function recommendedNews(articles,topic='all',now=new Date()){
 return articles.filter(a=>(topic==='all'||a.topics.includes(topic))&&+now-Date.parse(a.publishedAt)<=7*86400000).sort((a,b)=>{
  const score=a=>a.score+Math.max(0,48-(+now-Date.parse(a.publishedAt))/3600000);return score(b)-score(a);
 });
}
export function digestSlot(frequency,time){
 const local=new Date(+time+8*3600000),hour=local.getUTCHours(),day=local.toISOString().slice(0,10);
 if(frequency==='hourly')return `${day}-${String(hour).padStart(2,'0')}`;
 if(hour===9)return day+'-morning';if(frequency==='twice'&&hour===19)return day+'-evening';return null;
}
export function pickDigest(articles,preferences,sentIds=[],now=new Date()){
 const sent=new Set(sentIds),eligible=recommendedNews(articles,'all',now).filter(a=>a.topics.some(t=>preferences.includes(t))&&!sent.has(a.id)&&+now-Date.parse(a.publishedAt)<=48*3600000);
 const picked=[];for(const topic of preferences){const a=eligible.find(a=>a.topics.includes(topic)&&!picked.some(p=>p.id===a.id));if(a)picked.push(a);}return [...picked,...eligible.filter(a=>!picked.some(p=>p.id===a.id))].slice(0,6);
}
export const researchQuestions={ai:'这项进展的能力、成本或适用范围，有哪些可核查的证据？',audit:'涉及哪些审计准则、独立性或质量管理变化？适用范围是什么？',fintech:'这是试点还是正式上线？参与方、监管要求与实际用途是什么？'};
