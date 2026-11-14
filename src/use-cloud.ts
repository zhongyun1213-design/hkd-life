import { useSyncExternalStore } from 'react';
import { subscribe,getSnapshot,saveState,sync,setError } from './store.mjs';
export function useCloud(){
 const data:any=useSyncExternalStore(subscribe,getSnapshot,getSnapshot);
 return {...data,load:()=>sync(),save:(state:any)=>saveState(state,data.revision),setError};
}
