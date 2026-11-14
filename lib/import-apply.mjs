import { digest,uuidFor,categoryFor } from './statement-import.mjs';
export async function prepareImport(parsed,fileName,fileId){
 const refs=new Map();for(const g of parsed.groups)refs.set(g.id,await digest(g.id));
 return {...parsed,fileName,fileId,batchId:await uuidFor('batch|'+fileId),groups:parsed.groups.map(g=>({...g,importRef:refs.get(g.id)})),rows:await Promise.all(parsed.rows.map(async r=>({...r,key:await digest(r.sourceKey),id:await uuidFor('transaction|'+r.sourceKey)})))};
}
export function importStatus(preview,state){
 const known=new Set([...(state.imports||[]).flatMap(b=>b.keys),...state.transactions.map(t=>t.source?.key).filter(Boolean)]);
 const ids=new Set(state.transactions.map(t=>t.id));
 return preview.rows.map(r=>known.has(r.key)||ids.has(r.id)?'duplicate':'new');
}
export async function applyImport(state,preview,mappings,edits={},now=new Date().toISOString()){
 if(preview.errors.length||preview.checks.some(c=>!c.ok))throw Error('有未解决的解析或核对错误，不能导入');
 const next=structuredClone(state);next.imports??=[];const statuses=importStatus(preview,next),newAccounts=[],accountMap=new Map();
 if(statuses.every(s=>s==='duplicate')&&next.imports.some(b=>b.id===preview.batchId))return {state:next,added:0,duplicates:statuses.length};
 for(const g of preview.groups){
  if(preview.rows.some(r=>r.groupId===g.id)&&!preview.rows.some((r,i)=>r.groupId===g.id&&statuses[i]==='new'))continue;
  const choice=mappings[g.id];if(!choice)throw Error('请为所有账单账户选择归属');
  if(choice.account!=='new'){
   const a=next.accounts.find(a=>a.id===choice.account);if(!a||a.currency!==g.currency)throw Error('导入账户的币种不匹配');accountMap.set(g.id,a.id);
  }else{
   const id=await uuidFor('account|'+g.importRef),existing=next.accounts.find(a=>a.id===id);
   if(existing){if(existing.currency!==g.currency)throw Error('账户币种冲突');accountMap.set(g.id,id);continue;}
   const opening=choice.opening;if(!Number.isSafeInteger(opening))throw Error('请填写有效的期初余额');
   next.accounts.push({id,name:choice.name||g.name,currency:g.currency,opening,importRef:g.importRef,...(g.openingDate?{openingDate:g.openingDate}:{})});newAccounts.push(id);accountMap.set(g.id,id);
  }
 }
 let added=0,duplicates=0;
 for(let i=0;i<preview.rows.length;i++){
  const r=preview.rows[i];if(statuses[i]==='duplicate'){duplicates++;continue;}
  const type=edits[r.key]?.type||r.type,direction=type==='movement'?(edits[r.key]?.direction||r.direction):undefined;
  next.transactions.push({id:r.id,type,...(direction?{direction}:{}),account:accountMap.get(r.groupId),to:'',amount:r.amount,received:0,fee:0,category:edits[r.key]?.category||(type==='movement'?'资金往来':r.category),note:r.description.slice(0,500),date:r.date,planId:'',source:{provider:preview.source,key:r.key,fileId:preview.fileId,batchId:preview.batchId,fileName:preview.fileName,location:r.location,timestamp:r.timestamp,status:r.status,raw:r.raw}});added++;
 }
 const batch={id:preview.batchId,provider:preview.source,fileName:preview.fileName,fileId:preview.fileId,importedAt:now,detected:preview.rows.length,added,duplicates,keys:preview.rows.map(r=>r.key),newAccounts,checks:preview.checks};
 if(!next.imports.some(b=>b.id===batch.id))next.imports.push(batch);
 return {state:next,added,duplicates};
}
export function undoImport(state,batchId){
 const next=structuredClone(state),batch=(next.imports||[]).find(b=>b.id===batchId);if(!batch)throw Error('该导入批次不存在');
 next.transactions=next.transactions.filter(t=>t.source?.batchId!==batchId);
 next.imports=next.imports.filter(b=>b.id!==batchId);
 next.accounts=next.accounts.filter(a=>!batch.newAccounts.includes(a.id)||next.transactions.some(t=>t.account===a.id||t.to===a.id));return next;
}
