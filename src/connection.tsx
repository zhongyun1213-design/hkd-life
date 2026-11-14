import { useEffect,useState } from 'react';
import { Settings,X,Download,RefreshCw } from 'lucide-react';
import { useCloud } from './use-cloud';
import { configure,sync } from './store.mjs';
import { watchUpdates } from './sw-updates.mjs';
const label=(p:string)=>p==='/__wholeState'?'整份账本（关联记录冲突）':p.replace('/accounts/','账户 / ').replace('/transactions/','交易 / ').replace('/plans/','预留 / ').replace('/settings/','偏好 / ').replace('/events/','事件 / ');
export function ConnectionPanel(){
 const {state,config,busy,status,error,conflicts,pending,lastSync}=useCloud();const [open,setOpen]=useState(false),[choices,setChoices]=useState<Record<string,string>>({}),[install,setInstall]=useState<any>(null),[update,setUpdate]=useState<ServiceWorker|null>(null);
 useEffect(()=>{
  const fn=(e:any)=>{e.preventDefault();setInstall(e);};window.addEventListener('beforeinstallprompt',fn);
  let disposed=false,stop=()=>{};
  if('serviceWorker'in navigator)navigator.serviceWorker.ready.then(r=>{if(!disposed)stop=watchUpdates(r,setUpdate);});
  return()=>{disposed=true;stop();window.removeEventListener('beforeinstallprompt',fn);};
 },[]);
 useEffect(()=>setChoices({}),[conflicts]);
 return <><button className="connection-fab" onClick={()=>setOpen(true)}><Settings size={15}/>同步与安装{pending&&<i/>}{conflicts.length>0&&<b>!</b>}</button>{update&&<div className="update-banner">有新版本可用。保存当前表单后，<button onClick={()=>{let reloaded=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!reloaded){reloaded=true;location.reload();}});update.postMessage({type:'SKIP_WAITING'});}}>更新应用</button></div>}
 {(open||conflicts.length>0)&&<div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="connection-title"><div className="section-head"><h2 id="connection-title">同步与安装</h2><button className="icon" aria-label="关闭同步设置" onClick={()=>setOpen(false)} disabled={conflicts.length>0}><X size={20}/></button></div>
 <p className="connection-status">{status}{lastSync&&<small>上次成功同步：{new Date(lastSync).toLocaleString('zh-CN')}</small>}</p>{error&&<div className="alert">{error}</div>}
 {conflicts.length>0?<><p className="fine-print">这几处内容在两端都发生了变化。选择要保留的版本；其他记录会自动合并。</p><button className="secondary" onClick={()=>{const u=URL.createObjectURL(new Blob([JSON.stringify({format:'hkd-runway-v1',state},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='hkd-life-conflict-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}}>先下载本机备份</button>{conflicts.map((c:any)=><div className="conflict" key={c.path}><strong>{label(c.path)}</strong>{['local','remote'].map(side=><label key={side}><input type="radio" name={c.path} checked={choices[c.path]===side} onChange={()=>setChoices({...choices,[c.path]:side})}/><span>{side==='local'?'保留本机':'保留云端'}<pre>{c[side]===undefined?'（已删除）':JSON.stringify(c[side],null,2)}</pre></span></label>)}</div>)}<button className="primary" disabled={busy||Object.keys(choices).length!==conflicts.length} onClick={()=>sync(choices)}>确认选择并合并</button></>:<>
 <p className="fine-print">无需任何 AI 账号。本机独立使用不需要配置；跨设备时，请在两端填写同一个自建同步 API 地址与密钥。</p>
 <form key={config.endpoint} onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await configure({endpoint:String(f.get('endpoint')||'').trim(),token:String(f.get('token')||'').trim()});}}>
 <label className="field"><span>同步 API 地址</span><input name="endpoint" type="url" placeholder="https://your-worker.workers.dev/api/state" defaultValue={config.endpoint} autoComplete="off"/></label><label className="field"><span>同步密钥（只保存在当前设备）</span><input name="token" type="password" defaultValue={config.token} autoComplete="off"/></label><p className="fine-print">密钥不放进网址，也不包含在备份中。更换服务地址会保留本机账本并重新合并。未连接云端前，另一台设备看不到本机记录。</p><div className="connection-actions"><button className="primary" disabled={busy}>保存连接</button><button className="secondary" type="button" disabled={busy||!config.endpoint} onClick={()=>sync()}><RefreshCw size={14}/>立即同步</button></div></form>
 <hr/><h3>安装到手机与电脑</h3>{install?<button className="secondary" onClick={async()=>{await install.prompt();setInstall(null);}}><Download size={15}/>安装应用</button>:<p className="fine-print">iPhone：用 Safari 打开部署网址 → 分享 → 添加到主屏幕 → 选择作为网页 App 打开（若系统提供）。<br/>Android、电脑 Chrome / Edge：打开部署网址 → 浏览器菜单 → 安装应用。首次打开需联网缓存资源，以后可离线启动。</p>}<p className="fine-print">PWA 安装需要 HTTPS（电脑 localhost 除外）。源码和部署步骤见项目 README。没有 APK / EXE 安装包。</p></>}
 </section></div>}</>;
}
