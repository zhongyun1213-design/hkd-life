import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changes,parseObservationCSV } from '../lib/lab.mjs';
import { protectHistory } from '../lib/history.mjs';
test('CSV 支持 BOM、CRLF、逗号和双引号转义',()=>{const rows=parseObservationCSV('\uFEFFdate,value,source,note\r\n2026-11-13,100,"official, report","say ""hi"""\r\n');assert.equal(rows[0].source,'official, report');assert.equal(rows[0].note,'say "hi"');assert.equal(rows[0].benchmark,null);});
test('CSV 缺列、非法数字、不闭合引号拒绝',()=>{assert.throws(()=>parseObservationCSV('date,value\n2026-11-13,1'));assert.throws(()=>parseObservationCSV('date,value,source\n2026-11-13,NaN,test'));assert.throws(()=>parseObservationCSV('"bad'));});
test('变动按固定基线计算并按日期排序',()=>{const p=changes(100,[{date:'2026-11-13',value:110},{date:'2026-11-12',value:90}]);assert.ok(Math.abs(p[0].change+10)<1e-9);assert.ok(Math.abs(p[1].change-10)<1e-9);});
test('原始判断锁定、记录不能抹除，服务端确定时间',()=>{const e={id:'a',hypothesis:'original',recordedAt:'client',observations:[],reviews:[]};protectHistory([],[e],'server');assert.equal(e.recordedAt,'server');assert.throws(()=>protectHistory([e],[{...e,hypothesis:'rewritten'}]));assert.throws(()=>protectHistory([e],[]));const next=structuredClone(e);next.reviews.push({id:'r',text:'修正',at:'client'});protectHistory([e],[next],'server2');assert.equal(next.reviews[0].at,'server2');});
test('观察数据只能追加，修正通过新记录说明',()=>{const e={id:'a',observations:[{id:'p',value:10}],reviews:[]};const next=structuredClone(e);next.observations[0].value=11;assert.throws(()=>protectHistory([e],[next]));next.observations[0].value=10;next.observations.push({id:'q',value:11});assert.doesNotThrow(()=>protectHistory([e],[next]));});
