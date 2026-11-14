// Excel serial dates are wall-clock values, not UTC instants. Do not round-trip
// through a Date constructed in the device timezone (that shifts HK dates by 8h).
export function workbookSheets(XLSX,book){
 return book.SheetNames.map(name=>{
  const rows=XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,raw:true,defval:null});
  const header=rows.findIndex(r=>r.some(c=>String(c??'').trim()==='交易时间'));
  if(header>=0){const index=rows[header].findIndex(c=>String(c??'').trim()==='交易时间');for(let i=header+1;i<rows.length;i++)if(typeof rows[i][index]==='number'){
   const d=XLSX.SSF.parse_date_code(rows[i][index],{date1904:!!book.Workbook?.WBProps?.date1904});
   if(d){const date=new Date(Date.UTC(d.y,d.m-1,d.d,d.H,d.M,Math.round(d.S+(d.u||0))));rows[i][index]=date.toISOString().slice(0,19).replace('T',' ');}
  }}
  return {name,rows};
 });
}
