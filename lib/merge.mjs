export const collections=['accounts','transactions','plans','events'];
export function same(a,b){
 const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
}
// Three-way merge keeps a persisted last-synced base. Missing records are deletions,
// so an unchanged stale copy cannot resurrect a remotely deleted record.
export function mergeStates(base,local,remote,choices={}){
 const conflicts=[];
 function merge(b,l,r,path){
  if(same(l,r))return structuredClone(l);
  if(same(l,b))return structuredClone(r);
  if(same(r,b))return structuredClone(l);
  if(l&&r&&typeof l==='object'&&typeof r==='object'){
   if(Array.isArray(l)&&Array.isArray(r)&&l.every(x=>x?.id)&&r.every(x=>x?.id)){
    const bm=new Map((b||[]).map(x=>[x.id,x])),lm=new Map(l.map(x=>[x.id,x])),rm=new Map(r.map(x=>[x.id,x]));
    return [...new Set([...rm.keys(),...lm.keys(),...bm.keys()])].map(id=>merge(bm.get(id),lm.get(id),rm.get(id),path+'/'+id)).filter(x=>x!==undefined);
   }
   if(!Array.isArray(l)&&!Array.isArray(r))return Object.fromEntries([...new Set([...Object.keys(b||{}),...Object.keys(l),...Object.keys(r)])].map(k=>[k,merge(b?.[k],l[k],r[k],path+'/'+k)]).filter(([,v])=>v!==undefined));
  }
  if(choices[path]==='remote')return structuredClone(r);
  if(choices[path]==='local')return structuredClone(l);
  conflicts.push({path,base:b,local:l,remote:r});return structuredClone(l);
 }
 return {state:merge(base,local,remote,''),conflicts};
}
