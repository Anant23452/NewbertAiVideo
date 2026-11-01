import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {speechManifest,align} from '../../apps/api/src/modules/production/timing.js';
import {run,measureAudio,renderVideo} from '../../apps/api/src/modules/production/render.js';
const dir=resolve('test-results/studio-render');await mkdir(dir,{recursive:true});
const scene=(title:string)=>({id:randomUUID(),purpose:'Layout validation fixture',component:'comparison',title,spokenNarration:'एक आसान विचार समझें।',displayNarration:'एक आसान विचार समझें।',textMappings:[],objects:['Idea','Meaning'].map(label=>({id:randomUUID(),type:'node',label,parameters:{shape:'rectangle'}})),cues:[],claimIds:[]});
const content={schemaVersion:1,brief:{topic:'Educational layout fixture',language:'Hindi',audience:'college',mode:'guided'},voice:{catalogVoiceId:'fixture',providerConnectionId:null},style:{preset:'dark_light',accentColor:'#A18BFF'},scenes:[scene('A clearer idea'),scene('Another perspective')],pronunciationOverrides:[],captionOverrides:[]};
await run(['-y','-f','lavfi','-i','sine=frequency=440:duration=4','-c:a','libmp3lame','audio.mp3'],dir);
const manifest=speechManifest(content,{voiceId:'fixture',model:'fixture',credentialVersion:'fixture'}),chars=[...manifest.text],timing=align(manifest,{characters:chars,character_start_times_seconds:chars.map((_,i)=>i/chars.length*3.9),character_end_times_seconds:chars.map((_,i)=>(i+1)/chars.length*3.9)},await measureAudio(dir));
const result=await renderVideo(dir,timing,content);await mkdir('docs/ui/studio',{recursive:true});
for(const [time,name] of [['1','dark'],['3','light']]){await run(['-y','-ss',time,'-i','video.mp4','-frames:v','1',name+'.png'],dir);await writeFile('docs/ui/studio/style-'+name+'.png',await readFile(join(dir,name+'.png')));}
await writeFile('docs/ui/studio/render-validation.json',JSON.stringify({date:new Date().toISOString(),mode:'Synthetic timing and tone for visual QA only; not generated user narration',validation:result.validation,externalProviderCalls:0},null,2));console.log(JSON.stringify(result.validation));
