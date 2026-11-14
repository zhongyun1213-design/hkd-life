// Read-only sample verification. No statement content is written into the repository.
// Usage: node scripts/check-statements.mjs /path/to/wechat.xlsx /path/to/hsbc.pdf
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {parseWeChat,parseHSBC,totals,digest} from '../lib/statement-import.mjs';
import {prepareImport,applyImport} from '../lib/import-apply.mjs';
import {emptyState,balances} from '../lib/finance.mjs';
import {stateSchema} from '../lib/validation.mjs';
import {workbookSheets} from '../lib/xlsx-rows.mjs';
const [xlsx,pdfPath]=process.argv.slice(2);if(!xlsx||!pdfPath)throw Error('Pass paths to a WeChat XLSX and an HSBC PDF');
const book=XLSX.read(readFileSync(xlsx),{type:'buffer',cellDates:false});
const wx=parseWeChat(workbookSheets(XLSX,book));
const task=getDocument({data:new Uint8Array(readFileSync(pdfPath)),password:process.env.STATEMENT_PDF_PASSWORD||'',verbosity:0}),pdf=await task.promise,pages=[];
try{for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),vp=p.getViewport({scale:1}),text=await p.getTextContent();pages.push({number:i,width:vp.width,height:vp.height,items:text.items.filter(t=>t.str?.trim()).map(t=>({text:t.str,x:t.transform[4],y:vp.height-t.transform[5],width:t.width,height:t.height}))});}}finally{await task.destroy();}
const hsbc=parseHSBC(pages);let state=emptyState();
for(const [i,p] of [wx,hsbc].entries()){
 assert.deepEqual(p.errors,[]);assert.ok(p.checks.every(c=>c.ok));
 const preview=await prepareImport(p,i?'sample.pdf':'sample.xlsx',await digest('sample-'+i));
 const maps=Object.fromEntries(p.groups.map(g=>[g.id,{account:'new',opening:g.opening??0,name:g.name}]));
 const imported=await applyImport(state,preview,maps);assert.equal(imported.added,p.rows.length);assert.equal(stateSchema.safeParse(imported.state).success,true);
 const repeated=await applyImport(imported.state,preview,maps);assert.equal(repeated.added,0);state=imported.state;
 const b=balances(state);for(const g of preview.groups.filter(g=>g.opening!==null)){const a=state.accounts.find(a=>a.importRef===g.importRef);assert.equal(b[a.id],g.closing);}
 console.log(JSON.stringify({provider:p.source,rows:p.rows.length,incomeCount:totals(p.rows).incomeCount,expenseCount:totals(p.rows).expenseCount,checks:p.checks.length,passed:true}));
}
console.log('All source rows imported exactly once, balances and schemas verified; no source data written.');
