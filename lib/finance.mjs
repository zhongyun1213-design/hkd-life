export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
export const daysBetween = (a,b) => Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);
export const emptyState = () => ({ accounts: [], transactions: [], plans: [], settings: { rate: 1.08, daily: 120, nextIncome: '', rateDate: today() }, events: [], imports: [] });
export const toHKD = (minor,currency,rate) => minor / 100 * (currency === 'CNY' ? rate : 1);
export function balances(state) {
 const result = Object.fromEntries(state.accounts.map(a=>[a.id,a.opening]));
 for(const t of state.transactions) {
  if(t.type === 'movement'){result[t.account]+=(t.direction==='in'?t.amount:t.direction==='out'?-t.amount:0);continue;}
  if(t.type === 'income') result[t.account] += t.amount;
  else result[t.account] -= t.amount + (t.type === 'transfer' ? t.fee : 0);
  if(t.type === 'transfer') result[t.to] += t.received;
 }
 return result;
}
export function summary(s,date=today()) {
 const b=balances(s),rate=s.settings.rate;
 const total=s.accounts.reduce((n,a)=>n+toHKD(b[a.id],a.currency,rate),0);
 const horizon=s.settings.nextIncome && s.settings.nextIncome>=date ? s.settings.nextIncome : new Date(Date.parse(date+'T00:00:00Z')+30*86400000).toISOString().slice(0,10);
 const pending=s.plans.filter(p=>!p.paid && p.due<=horizon);
 const reserved=pending.reduce((n,p)=>n+toHKD(p.amount,p.currency,rate),0);
 const recent=s.transactions.filter(t=>t.type==='expense' && daysBetween(t.date,date)>=0 && daysBetween(t.date,date)<30);
 const first=recent.map(t=>t.date).sort()[0];
 const observed=first?Math.min(30,daysBetween(first,date)+1):0;
 const spent=recent.reduce((n,t)=>n+toHKD(t.amount,s.accounts.find(a=>a.id===t.account)?.currency,rate),0);
 const everydaySpent=recent.filter(t=>!t.planId).reduce((n,t)=>n+toHKD(t.amount,s.accounts.find(a=>a.id===t.account)?.currency,rate),0);
 const daily=observed>=7 ? everydaySpent/observed : s.settings.daily;
 const free=total-reserved;
 return {total,reserved,free,daily,spent,observed,pending,horizon,runway:daily>0?Math.max(0,Math.floor(free/daily)):null,b};
}
