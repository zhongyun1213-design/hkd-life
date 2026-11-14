// Watch registration after it is ready, including iOS resumes and long sessions.
export function watchUpdates(registration,onUpdate,{win=window,doc=document}={}){
 let checking=false;
 const inspect=()=>{if(registration.waiting)onUpdate(registration.waiting);};
 const workers=new Set();
 const found=()=>{const worker=registration.installing;if(worker&&!workers.has(worker)){workers.add(worker);worker.addEventListener('statechange',inspect);}inspect();};
 const check=async()=>{inspect();if(checking||doc.visibilityState==='hidden')return;checking=true;try{await registration.update();inspect();}catch{}finally{checking=false;}};
 registration.addEventListener('updatefound',found);found();
 win.addEventListener('focus',check);win.addEventListener('online',check);doc.addEventListener('visibilitychange',check);
 const timer=win.setInterval(check,60000);check();
 return()=>{win.clearInterval(timer);registration.removeEventListener('updatefound',found);for(const worker of workers)worker.removeEventListener('statechange',inspect);win.removeEventListener('focus',check);win.removeEventListener('online',check);doc.removeEventListener('visibilitychange',check);};
}
