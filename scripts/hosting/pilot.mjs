// Free pilot: API and worker share one sleeping instance, never two paid resources.
// Durable PostgreSQL leases survive suspension; this is not an always-on worker.
import { spawn } from 'node:child_process';
const children=[];
let stopping=false;
const stop=(exitCode=0)=>{
  if(stopping)return;
  stopping=true;process.exitCode=exitCode;
  for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');
  setTimeout(()=>{for(const child of children)if(child.exitCode===null)child.kill('SIGKILL')},25000).unref();
};
for(const file of ['dist/apps/api/src/main.js','dist/apps/worker/src/main.js']){
  const child=spawn(process.execPath,[file],{stdio:'inherit',env:process.env,windowsHide:true});
  children.push(child);
  child.on('error',()=>stop(1));
  child.on('exit',(code)=>{if(!stopping)stop(code || 1)});
}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>stop());
