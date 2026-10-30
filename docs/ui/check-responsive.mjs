// Review exported design HTML in headless Edge. Does not start the product app.
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const require=createRequire(join(tmpdir(),'newbert-design-validation','package.json'));
const {chromium}=require('playwright');
const root=resolve('docs/ui');
const manifest=JSON.parse(await readFile(join(root,'product/manifest.json'),'utf8'));
const server=createServer(async(req,res)=>{try{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(root+require('node:path').sep)){res.writeHead(403).end();return;}
  const type={'.html':'text/html; charset=utf-8','.png':'image/png','.json':'application/json'}[extname(path)]||'application/octet-stream';
  const data=await readFile(path);res.writeHead(200,{'Content-Type':type});res.end(data);
}catch{if(!res.headersSent)res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
const results=[];
const selected=new Set(process.argv.slice(2));
if(selected.size){try{const old=JSON.parse(await readFile(join(root,'product/responsive-review.json'),'utf8'));results.push(...old.results.filter(x=>!selected.has(x.slug)));}catch{}}
 await mkdir(join(root,'product/qa'),{recursive:true});
 for(const screen of manifest.screens){
  if(selected.size&&!selected.has(screen.slug))continue;
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/product/${screen.slug}.html`,{waitUntil:'networkidle',timeout:45000});
  await page.evaluate(()=>document.fonts.ready);
  const checks=[];
  for(const width of [1440,768,390,360]){
   await page.setViewportSize({width,height:1000});
   await page.waitForTimeout(120);
   checks.push(await page.evaluate(()=>{
    const w=innerWidth;
    const bad=[...document.querySelectorAll('body *')].filter(e=>{
     if(['SCRIPT','STYLE','SVG','PATH'].includes(e.tagName))return false;
     const s=getComputedStyle(e),r=e.getBoundingClientRect();
     return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&(r.right>w+2||r.left<-2);
    }).slice(0,8).map(e=>({tag:e.tagName,classes:String(e.className).slice(0,180),text:e.textContent.trim().slice(0,100)}));
    return{width:w,pageWidth:document.documentElement.scrollWidth,horizontalOverflow:document.documentElement.scrollWidth>w+2,offscreenElements:bad};
   }));
   if(width===390)await page.screenshot({path:join(root,'product/qa',screen.slug+'-390.png'),fullPage:true});
  }
  const r={slug:screen.slug,title:screen.title,checks,pageErrors:errors};results.push(r);
  console.log(JSON.stringify({slug:r.slug,viewports:checks.map(c=>({width:c.width,overflow:c.horizontalOverflow,pageWidth:c.pageWidth})),pageErrors:errors}));
  await page.close();
 }
 await writeFile(join(root,'product/responsive-review.json'),JSON.stringify({date:'2026-10-29',environment:'Headless Microsoft Edge; local Stitch exports with external Tailwind/fonts',scope:'Geometry/overflow only; not full accessibility, interaction or device validation',results},null,2)+'\n');
}finally{
 try{await browser?.close();}
 finally{await new Promise(r=>server.close(r));}
}
