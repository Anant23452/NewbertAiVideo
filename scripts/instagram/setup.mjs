import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
await mkdir('.local',{recursive:true});
try{await writeFile('.local/instagram-token.key',randomBytes(32).toString('hex')+'\n',{flag:'wx',mode:0o600});console.log('Created a dedicated local Instagram token encryption key in ignored storage. No value is printed.');}
catch(e){if(e.code!=='EEXIST')throw e;if(!/^[a-f0-9]{64}$/i.test((await readFile('.local/instagram-token.key','utf8')).trim()))throw Error('Existing local token key is invalid; no key was replaced.');console.log('Existing local token encryption key preserved.');}
console.log('Meta app credentials still require operator setup. No Meta requests were made.');
