import React from 'react';
import { createRoot } from 'react-dom/client';
import Ledger from './ledger';
import Lab from './lab/lab';
import { initialize } from './store.mjs';
import { ConnectionPanel } from './connection';
import './styles.css';
function App(){const [route,setRoute]=React.useState(location.hash);React.useEffect(()=>{const fn=()=>setRoute(location.hash);window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn);},[]);return <><ConnectionPanel/>{route==='#/lab'?<Lab/>:<Ledger name="我"/>}</>;}
initialize().then(()=>createRoot(document.getElementById('root')!).render(<App/>)).catch(()=>{document.getElementById('root')!.textContent='本机存储不可用。请允许此站点使用浏览器存储，并使用普通浏览模式后重试。';});
if('serviceWorker'in navigator&&import.meta.env.PROD)navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{});
