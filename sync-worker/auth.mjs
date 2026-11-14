export async function tokenHash(token){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function authorized(request,env){
 const auth=request.headers.get('Authorization')||'',token=auth.startsWith('Bearer ')?auth.slice(7):'',expected=env.SYNC_TOKEN_HASH||'';
 if(token.length<32||token.length>256||!/^[a-f0-9]{64}$/.test(expected))return false;
 const actual=await tokenHash(token);let diff=0;for(let i=0;i<64;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);return diff===0;
}
