export function changes(baseline,points){
 return [...points].sort((a,b)=>a.date.localeCompare(b.date)).map(p=>({...p,change:(p.value/baseline-1)*100}));
}
export function parseObservationCSV(text){
 const rows=[];let row=[],field='',quoted=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(field);field='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}
  else field+=c;
 }
 if(quoted)throw Error('CSV 引号未闭合');
 row.push(field);if(row.some(x=>x.trim()))rows.push(row);
 if(!rows.length)throw Error('CSV 为空');
 const header=rows.shift().map(x=>x.trim().toLowerCase());
 if(!['date','value','source'].every(k=>header.includes(k)))throw Error('CSV 需包含 date,value,source 列；可加 note,benchmark 列');
 return rows.map((r,i)=>{
  const get=k=>r[header.indexOf(k)]?.trim()||'',date=get('date'),value=Number(get('value')),source=get('source');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(value)||value<=0||!source)throw Error(`CSV 第 ${i+2} 行日期、数值或来源不完整`);
  const benchmark=get('benchmark')?Number(get('benchmark')):null;
  if(benchmark!==null&&(!Number.isFinite(benchmark)||benchmark<=0))throw Error(`CSV 第 ${i+2} 行基准数值无效`);
  return {date,value,source,note:get('note'),benchmark};
 });
}
export function eventPrompt(e){return `请帮助我复核一个金融学习记录，不提供买卖建议。\n事件：${e.title}\n原始来源：${e.url}\n事件日期：${e.eventDate}\n记录时间：${e.recordedAt}\n研究对象：${e.target}\n原始假设：${e.hypothesis}\n方向：${e.direction}\n观察截止：${e.horizon}\n证伪条件：${e.invalidates}\n观察数据：${JSON.stringify(e.observations)}\n请分别列出：1. 机制中遗漏的条件；2. 其他可能解释；3. 需要查证的数据；4. 相关性与因果的区别。无法访问来源时请明确说明，不要编造引用或行情。`;
}
