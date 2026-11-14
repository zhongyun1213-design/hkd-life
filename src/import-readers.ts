import { parseWeChat,parseHSBC } from '../lib/statement-import.mjs';
import { workbookSheets } from '../lib/xlsx-rows.mjs';
import pdfWorkerURL from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
export async function readStatement(file:File,password=''){
 if(file.size>20*1024*1024)throw Error('文件超过 20MB，请按月导出账单');
 const bytes=await file.arrayBuffer();
 const fileId=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(/\.xlsx$/i.test(file.name)){
  const XLSX=await import('xlsx');
  const book=XLSX.read(bytes,{type:'array',cellDates:false});
  return {...parseWeChat(workbookSheets(XLSX,book)),fileId};
 }
 if(/\.pdf$/i.test(file.name)){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerURL;
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),password,disableFontFace:true,verbosity:0});
  try{
   const pdf=await task.promise;if(pdf.numPages>100)throw Error('结单超过 100 页，请分期导出');
   const pages=[];
   for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);if(page.rotate!==0)throw Error('当前不支持旋转版式 PDF，请导出原始正向结单');
    const viewport=page.getViewport({scale:1}),text=await page.getTextContent();
    pages.push({number:i,width:viewport.width,height:viewport.height,items:text.items.filter((t:any)=>typeof t.str==='string'&&t.str.trim()).map((t:any)=>({text:t.str,x:t.transform[4],y:viewport.height-t.transform[5],width:t.width,height:t.height}))});
    page.cleanup();
   }
   return {...parseHSBC(pages),fileId};
  }catch(e:any){if(e.name==='PasswordException')throw Error('PDF 需要正确的打开密码，请在上方填写后重新读取');throw e;}
  finally{await task.destroy();}
 }
 throw Error('请选择 .xlsx 账单或文字版 .pdf 结单');
}
