import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState,balances,summary,today } from '../lib/finance.mjs';
function fixture(){const s=emptyState();s.accounts=[{id:'h',currency:'HKD',opening:100000},{id:'c',currency:'CNY',opening:100000}];s.settings.rate=1.1;return s;}
test('香港日期为 ISO 日期',()=>assert.match(today(),/^\d{4}-\d{2}-\d{2}$/));
test('跨币种换汇按实际扣款到账；手续费只扣一次',()=>{const s=fixture();s.transactions=[{type:'transfer',account:'c',to:'h',amount:10000,received:10900,fee:100,date:'2026-11-13'}];assert.deepEqual(balances(s),{h:110900,c:89900});assert.equal(summary(s,'2026-11-13').spent,0);});
test('预留扣减可用金额，已支付预留不再扣减',()=>{const s=fixture();s.plans=[{amount:10000,currency:'CNY',due:'2026-11-15',paid:false}];assert.equal(summary(s,'2026-11-13').reserved,110.00000000000001);s.plans[0].paid=true;assert.equal(summary(s,'2026-11-13').reserved,0);});
test('数据不足采用设定预算；收入不会降低消费',()=>{const s=fixture();s.transactions=[{type:'expense',account:'h',amount:3000,date:'2026-11-13'},{type:'income',account:'h',amount:50000,date:'2026-11-13'}];assert.equal(summary(s,'2026-11-13').daily,120);assert.equal(summary(s,'2026-11-13').spent,30);});
test('成熟记录使用实际日均，预留支付不混入日常预测',()=>{const s=fixture();s.transactions=[{type:'expense',account:'h',amount:7000,date:'2026-11-07'},{type:'expense',account:'h',amount:50000,date:'2026-11-13',planId:'rent'}];const r=summary(s,'2026-11-13');assert.equal(r.observed,7);assert.equal(r.daily,10);assert.equal(r.spent,570);});
test('过期预留继续保留，未来窗口外不扣，负余额余量为零',()=>{const s=fixture();s.settings.nextIncome='2026-11-20';s.plans=[{amount:999999,currency:'HKD',due:'2026-11-01',paid:false},{amount:10000,currency:'HKD',due:'2026-11-21',paid:false}];const r=summary(s,'2026-11-13');assert.equal(r.reserved,9999.99);assert.equal(r.runway,0);});
