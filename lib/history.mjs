const locked=['id','title','url','source','eventDate','recordedAt','target','hypothesis','direction','baseline','benchmarkBaseline','horizon','invalidates','confidence'];
export function protectHistory(previous,next,now=new Date().toISOString()){
 for(const old of previous){
  const current=next.find(e=>e.id===old.id);
  if(!current)throw Error('已存档事件不能删除，请使用归档；旧备份不能抹去原始判断');
  for(const key of locked)if(JSON.stringify(old[key])!==JSON.stringify(current[key]))throw Error('原始判断已锁定，请在复盘中追加修正');
  for(const field of ['observations','reviews']){
   if(old[field].length>current[field].length||old[field].some((v,i)=>JSON.stringify(v)!==JSON.stringify(current[field][i])))throw Error('历史观察和复盘不能改写，请追加更正记录');
  }
 }
 for(const e of next){
  const old=previous.find(p=>p.id===e.id);
  if(!old)e.recordedAt=now;
  for(let i=old?.reviews.length||0;i<e.reviews.length;i++)e.reviews[i].at=now;
  const ids=[...e.observations,...e.reviews].map(x=>x.id);if(new Set(ids).size!==ids.length)throw Error('观察或复盘存在重复 ID');
 }
 return next;
}
