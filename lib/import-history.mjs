import { same } from './merge.mjs';
export function protectImportHistory(previous,next){
 for(const t of previous.transactions){if(!t.source)continue;const n=next.transactions.find(n=>n.id===t.id);if(n&&!same(n.source,t.source))throw Error('导入原文和来源标识不能改写，请更新应用后重试');}
 for(const b of previous.imports||[]){if(!(next.imports||[]).some(n=>n.id===b.id)&&next.transactions.some(t=>t.source?.batchId===b.id))throw Error('导入批次仍有流水，不能删除其来源记录');}
}
