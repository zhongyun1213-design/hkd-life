import { merchantExpenseCategory } from './categories.mjs';
const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
export function cents(value){
 const text=String(value??'').trim().replace(/^(?:HKD|CNY|RMB|HK\$)/i,'').replace(/[,￥¥$\s]/g,'');
 if(!/^[-+]?\d+(?:\.\d{1,2})?$/.test(text))throw Error('金额格式无法确认：'+String(value));
 const neg=text.startsWith('-'),[whole,decimal='']=text.replace(/^[-+]/,'').split('.');
 const n=Number(whole)*100+Number(decimal.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n>1e12)throw Error('金额超出支持范围');return neg?-n:n;
}
const clean=v=>v instanceof Date?v.toISOString().replace('T',' ').replace(/\.\d{3}Z$/,''):String(v??'').trim();
function isoDate(v){
 if(v instanceof Date)return `${v.getUTCFullYear()}-${String(v.getUTCMonth()+1).padStart(2,'0')}-${String(v.getUTCDate()).padStart(2,'0')}`;
 const m=clean(v).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);if(!m)throw Error('日期格式无法确认：'+clean(v));const d=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;if(new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)throw Error('日期无效');return d;
}
export const signedAmount=r=>r.direction==='in'?r.amount:r.direction==='out'?-r.amount:0;
export function totals(rows){return rows.reduce((s,r)=>{s.count++;if(r.direction==='in'){s.income+=r.amount;s.incomeCount++;}else if(r.direction==='out'){s.expense+=r.amount;s.expenseCount++;}else{s.neutral+=r.amount;s.neutralCount++;}return s;},{count:0,income:0,expense:0,neutral:0,incomeCount:0,expenseCount:0,neutralCount:0});}
export function categoryFor(text,type='expense'){
 const merchant=type==='expense'?merchantExpenseCategory(text):null;if(merchant)return merchant;
 if(/退款|退回|refund/i.test(text))return '退款';if(/CASH REBATE|返现|回赠/i.test(text))return '返现';
 if(/MTR|港鐵|港铁|地铁|巴士|交通/i.test(text))return '交通';
 if(/KEETA|美团|餐|饭|咖啡|麦当劳|肯德基|food|coffee/i.test(text))return '餐饮';
 if(/DEEPSEEK|OPENAI|课程|教材|学费|API|COLAB/i.test(text))return '学习';
 if(/PARKNSHOP|超市|百佳|拼多多|JD.COM|商场/i.test(text))return '购物';return '其他';
}
function addRow(result,row){const ordinal=result.rows.filter(r=>r.sourceKey===row.sourceKey||r.sourceKey.startsWith(row.sourceKey+'|occurrence:')).length;if(ordinal)row.sourceKey+='|occurrence:'+ordinal;row.index=result.rows.length;result.rows.push(row);}
export function parseWeChat(sheets){
 const result={source:'wechat',label:'微信支付 Excel',rows:[],groups:[],errors:[],warnings:[],checks:[],period:'',declared:null};let found=false;
 for(const sheet of sheets){
 const data=sheet.rows;const header=data.findIndex(r=>r.some(c=>clean(c)==='交易时间')&&r.some(c=>clean(c)==='收/支'));
 if(header<0)continue;found=true;const names=data[header].map(clean),column=name=>names.indexOf(name),required=['交易时间','交易类型','交易对方','商品','收/支','金额(元)','支付方式','当前状态','交易单号'];
 if(required.some(n=>column(n)<0)){result.errors.push('微信表头缺少必需字段，请使用微信原始导出账单');continue;}
 const pre=data.slice(0,header).flat().map(clean).join('\n');result.period=pre.match(/起始时间[^\n]+/)?.[0]||'';
 const expected={count:Number(pre.match(/共\s*(\d+)\s*笔记录/)?.[1]),incomeCount:Number(pre.match(/(?:^|\n)收入[：:]\s*(\d+)笔/)?.[1]),expenseCount:Number(pre.match(/(?:^|\n)支出[：:]\s*(\d+)笔/)?.[1])};
 for(const [name,key] of [['收入','income'],['支出','expense'],['中性交易','neutral']]){const m=pre.match(new RegExp('(?:^|\\n)'+name+'[：:]\\s*(\\d+)笔\\s*([\\d,.]+)元'));if(m){expected[key]=cents(m[2]);expected[key+'Count']=Number(m[1]);}}
 if(Number.isFinite(expected.count))result.declared=expected;
 for(let i=header+1;i<data.length;i++){
  const raw=data[i];if(raw.every(v=>!clean(v)))continue;
  const get=n=>raw[column(n)],line=`${sheet.name} 第 ${i+1} 行`;
  try{
   const date=isoDate(get('交易时间')),timestamp=get('交易时间') instanceof Date?date+' '+get('交易时间').toISOString().slice(11,19):clean(get('交易时间')).replace('T',' '),classification=clean(get('收/支')),amount=cents(get('金额(元)'));
   if(amount<0)throw Error('微信金额为负数，需要人工核实');
   const kind=clean(get('交易类型')),status=clean(get('当前状态')),method=clean(get('支付方式')),counterparty=clean(get('交易对方')),product=clean(get('商品')),orderId=clean(get('交易单号'));
   let direction=classification==='收入'?'in':classification==='支出'?'out':classification==='/'||classification==='不计收支'||classification==='中性交易'?'none':null;
   if(!direction)throw Error('无法确认收支方向：'+classification);
   let ledgerType=direction==='in'?'income':direction==='out'?'expense':'movement';
   if(/交易关闭|已取消|支付失败|转账失败|待支付|已撤销/.test(status)){direction='none';ledgerType='movement';}
   // A refunded purchase remains a debit. Its separate refund is another credit.
   // Status alone must never erase the original debit.
   if(classification==='/'||classification==='不计收支'||classification==='中性交易'){
    if(/零钱提现|提现/.test(kind))direction='out';else if(/充值/.test(kind))direction='in';
    else if(/零钱通转入|存入零钱通/.test(kind))direction='out';else if(/零钱通转出|零钱通转取/.test(kind))direction='in';
    else if(amount>0)result.warnings.push(line+'：中性交易保留原文，未确认现金方向，不计余额变动');
   }
   if(amount===0){direction='none';ledgerType='movement';}
   const groupId='wechat|'+(method&&method!=='/'?method:'零钱');
   if(!result.groups.some(g=>g.id===groupId))result.groups.push({id:groupId,name:'微信 · '+(method&&method!=='/'?method:'零钱'),currency:'CNY',opening:null,closing:null,openingDate:null});
   const sourceKey=['wechat',orderId||[timestamp,kind,counterparty,product,amount].join('|'),timestamp,classification].join('|');
   addRow(result,{sourceKey,groupId,date,timestamp,amount,direction,type:ledgerType,category:categoryFor(kind+' '+counterparty+' '+product,ledgerType),description:[counterparty,product!=='/'?product:''].filter(Boolean).join(' · '),location:line,raw:Object.fromEntries(names.map((n,j)=>[n,clean(raw[j])])),status,orderId,review:/转账|红包|充值|提现|OCTOPUS/i.test(kind+' '+counterparty),sourceDirection:classification});
  }catch(e){result.errors.push(line+'：'+e.message);}
 }
 }
 if(!found)result.errors.push('没有找到微信账单表头，请导入微信支付原始 .xlsx 文件');
 if(result.declared){const t=totals(result.rows.map(r=>({...r,direction:r.sourceDirection==='收入'?'in':r.sourceDirection==='支出'?'out':'none'})));
  for(const key of ['count','incomeCount','expenseCount','neutralCount','income','expense','neutral'])if(Number.isFinite(result.declared[key])){const ok=t[key]===result.declared[key];result.checks.push({label:'微信 '+({count:'总笔数',incomeCount:'收入笔数',expenseCount:'支出笔数',neutralCount:'中性笔数',income:'收入金额',expense:'支出金额',neutral:'中性金额'}[key]),ok,expected:result.declared[key],actual:t[key]});if(!ok)result.errors.push('微信汇总不匹配：'+key+'，请检查未解析行');}
 }
 if(result.rows.some(r=>/已全额退款|退款成功/.test(r.status)))result.warnings.push('已退款的原始消费和独立退款流水均保留，不会只凭状态删掉扣款。');
 return result;
}
export function groupLines(items){
 const sorted=items.filter(t=>clean(t.text)).sort((a,b)=>a.y-b.y||a.x-b.x),lines=[];
 for(const item of sorted){let line=lines.at(-1);if(!line||Math.abs(line.y-item.y)>2){line={y:item.y,items:[]};lines.push(line);}line.items.push(item);}
 for(const l of lines){l.items.sort((a,b)=>a.x-b.x);l.text=l.items.map(i=>clean(i.text)).join(' ');}
 return lines;
}
function bankDate(text,statementDate){const m=text.match(/^(\d{1,2})\s*([A-Za-z]{3})$/);if(!m)return null;const month=months.indexOf(m[2].toLowerCase());if(month<0)throw Error('无法识别月份');let year=Number(statementDate.slice(0,4));if(month+1>Number(statementDate.slice(5,7)))year--;return isoDate(`${year}-${month+1}-${m[1]}`);}
export function parseHSBC(pages){
 const result={source:'hsbc',label:'汇丰 PDF 结单',rows:[],groups:[],errors:[],warnings:[],checks:[],period:'',declared:null};
 const first=groupLines(pages[0]?.items||[]),full=first.map(l=>l.text).join('\n');
 const sm=full.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
 if(!sm){result.errors.push('无法读取结单日期。扫描件、加密或其他版式需先转换为可选中文字的原始结单');return result;}
 const month=months.indexOf(sm[2].slice(0,3).toLowerCase())+1,statementDate=isoDate(`${sm[3]}-${month}-${sm[1]}`);
 result.period='结单日 '+statementDate;
 const accountRef=full.match(/\b\d{3}-\d{6}-\d{3}\b/)?.[0];if(!accountRef){result.errors.push('无法确认汇丰账户标识');return result;}
 const printedPages=Number(full.match(/Page\s+1\s+of\s+(\d+)/i)?.[1]);if(printedPages&&printedPages!==pages.length)result.errors.push('PDF 页数与结单标注不一致，可能缺页，不能保证完整导入');
 let currency='HKD',currentDate=null,pending=[],inForeign=false,group=null,headers=0;
 function ensure(ccy){const id='hsbc|'+accountRef+'|'+ccy;group=result.groups.find(g=>g.id===id);if(!group){group={id,name:'汇丰 · '+ccy+' · '+accountRef.slice(-3),currency:ccy,opening:null,closing:null,openingDate:null,running:null};result.groups.push(group);}currency=ccy;return group;}
 for(const page of pages){
  const lines=groupLines(page.items);let columns=null,active=false;
  if(!lines.length){result.errors.push(`第 ${page.number} 页没有可读取文字，可能为扫描页`);continue;}
  for(let i=0;i<lines.length;i++){
   const l=lines[i],txt=l.text;
   if(/Foreign Currency Savings/i.test(txt)){if(pending.length){result.errors.push('跨币种前存在未匹配金额的交易描述');pending=[];}inForeign=true;active=false;columns=null;continue;}
   if(/HKD\s*(?:Savings|Current)/i.test(txt)&&!columns&&!/\d{3}-\d{6}/.test(txt)){inForeign=false;currency='HKD';}
   const dep=l.items.find(t=>/^Deposit$/i.test(clean(t.text))),withdraw=l.items.find(t=>/^Withdrawal$/i.test(clean(t.text))),balance=l.items.find(t=>/^Balance$/i.test(clean(t.text)));
   if(dep&&withdraw&&balance&&/Date/.test(txt)){headers++;columns={dep:dep.x-15,withdraw:withdraw.x-15,balance:balance.x-15,date:l.items.find(t=>/^Date$/.test(clean(t.text)))?.x||59,description:(l.items.find(t=>/^Transaction Details$/i.test(clean(t.text)))?.x||104)-5};active=true;continue;}
   if(!active)continue;
   if(/The Hongkong and Shanghai|IPSSTM|Total Relationship Balance|Important Notice|Thank you for choosing/i.test(txt)){active=false;continue;}
   if(l.y>page.height-35)continue;
   const items=l.items,at=(a,b)=>items.filter(t=>t.x>=a&&t.x<b).map(t=>clean(t.text)).join(' ').trim();
   const dateText=at(0,columns.description),dateMatch=dateText.match(/(?:^|\s)(\d{1,2}\s+[A-Za-z]{3})(?:\s|$)/);
   if(inForeign){const ccy=dateText.match(/\b[A-Z]{3}\b/)?.[0];if(ccy){if(!['CNY','HKD'].includes(ccy)){result.errors.push('暂不支持 '+ccy+' 账户币种，不能完整导入');active=false;continue;}ensure(ccy);}}
   if(!group||(!inForeign&&currency==='HKD'&&group.currency!=='HKD'))ensure(currency);
   if(dateMatch)try{currentDate=bankDate(dateMatch[1],statementDate);}catch(e){result.errors.push(`第 ${page.number} 页：`+e.message);}
   const description=at(columns.description,columns.dep),depText=at(columns.dep,columns.withdraw),withdrawText=at(columns.withdraw,columns.balance),balanceText=at(columns.balance,Infinity);
   const parseMoney=(s,signed=false)=>{if(!s)return null;const normalized=s.replace(/\s+/g,'');if(!/^-?\d[\d,]*\.\d{2}(?:DR|CR)?$/i.test(normalized))throw Error('金额列无法识别：'+s);const n=cents(normalized.replace(/DR|CR/gi,''));return signed&&/DR$/i.test(normalized)?-Math.abs(n):n;};
   let deposit,withdrawal,bal;
   try{deposit=parseMoney(depText);withdrawal=parseMoney(withdrawText);bal=parseMoney(balanceText,true);}catch(e){result.errors.push(`第 ${page.number} 页 y=${Math.round(l.y)}：`+e.message);continue;}
   const location=`第 ${page.number} 页 · ${currentDate||'日期待定'} · 行 ${i+1}`;
   if(/B\/F\s*BALANCE|BROUGHT FORWARD|BALANCE BROUGHT FORWARD/i.test(description)){
    if(pending.length){result.errors.push(location+'：期初前有未匹配交易');pending=[];}
    if(bal===null)result.errors.push(location+'：期初余额缺失');
    else if(group.opening===null){group.opening=bal;group.running=bal;group.closing=bal;group.openingDate=currentDate;}
    else if(group.running!==bal)result.errors.push(location+'：承前余额与前页不一致');
    continue;
   }
   if(/C\/F\s*BALANCE|CARRIED FORWARD|BALANCE CARRIED FORWARD/i.test(description)){
    if(bal!==null&&group.running!==bal)result.errors.push(location+'：结转余额不匹配');continue;
   }
   if(description)pending.push(description);
   if(deposit!==null||withdrawal!==null){
    if(!currentDate){result.errors.push(location+'：交易日期缺失');continue;}
    if(deposit!==null&&withdrawal!==null){result.errors.push(location+'：同一行同时出现存入与支出，需要人工核实');continue;}
    const amount=deposit??withdrawal,direction=deposit!==null?'in':'out',desc=pending.join(' / ');pending=[];
    if(!desc)result.errors.push(location+'：交易描述缺失');
    if(group.running===null)result.errors.push(location+'：缺少期初余额，无法核对完整流水');else group.running+=direction==='in'?amount:-amount;
    const sourceKey=['hsbc',accountRef,currency,currentDate,direction,amount,desc.replace(/\s+/g,' ').toUpperCase()].join('|');
    addRow(result,{sourceKey,groupId:group.id,date:currentDate,timestamp:currentDate,amount,direction,type:amount===0?'movement':direction==='in'?'income':'expense',category:categoryFor(desc,direction==='in'?'income':'expense'),description:desc,location,raw:{日期:currentDate,交易详情:desc,存入:depText,支出:withdrawText,余额:balanceText,页码:String(page.number)},status:'已入账',orderId:'',review:/OCTOPUS|TRANSFER|REMIT|FPS|转账/i.test(desc)});
   }
   if(bal!==null){const ok=group.running===bal;result.checks.push({label:location+' 余额核对',ok,expected:bal,actual:group.running});if(!ok)result.errors.push(location+'：逐段余额不平，可能遗漏或错列。禁止确认导入');group.closing=bal;}
  }
 }
 if(pending.length)result.errors.push('结单末尾有未解析的交易描述：'+pending.join(' / '));
 if(!headers)result.errors.push('未找到汇丰存入 / 支出 / 余额列');
 for(const g of result.groups){if(g.opening===null)result.errors.push(g.name+'：没有识别到期初余额');const rr=result.rows.filter(r=>r.groupId===g.id);if(g.running!==g.closing)result.errors.push(g.name+'：最后一笔之后没有可核对的结余');result.checks.push({label:g.name+' 期初＋存入－支出＝期末',ok:g.opening!==null&&g.running===g.closing,expected:g.closing,actual:g.running});delete g.running;g.count=rr.length;}
 if(!result.rows.length&&result.groups.length===0)result.errors.push('没有识别到账户流水');
 result.warnings.push('汇丰按入账日期记录，消费描述中的交易日保留在原文；同一天重复金额的交易不会被合并。八达通充值等可在预览中改为“资金转出”，避免后续重复计算消费。');
 return result;
}
export async function digest(text){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function uuidFor(text){const h=await digest(text);return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
