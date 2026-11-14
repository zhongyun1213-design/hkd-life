import {generateVAPIDKeys} from 'web-push';
import {existsSync,writeFileSync} from 'node:fs';
const path='.env.webpush-local';
if(existsSync(path)){console.log('Existing local Web Push keys retained.');}else{
 const keys=generateVAPIDKeys();writeFileSync(path,`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`,{mode:0o600});console.log('Web Push keys created in ignored .env.webpush-local; do not publish this file.');
}
