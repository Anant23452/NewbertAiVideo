// Offline design-review artifacts only; no application routes or services.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');
const dir = resolve('docs/ui/product');
const items=[];
for(const file of (await readdir(dir)).filter(f=>/^\d\d-.*\.json$/.test(f)).sort()) {
  const item=JSON.parse(await readFile(join(dir,file),'utf8'));
  const png=await readFile(join(dir,item.slug+'.png'));
  item.pixelWidth=png.readUInt32BE(16);item.pixelHeight=png.readUInt32BE(20);
  const h=Math.min(item.pixelHeight,Math.round(item.pixelWidth*.82));
  const args=['-hide_banner','-loglevel','error','-y','-i',join(dir,item.slug+'.png'),'-vf',`crop=${item.pixelWidth}:${h}:0:0,scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2:color=0x08080B`,'-frames:v','1',join(dir,item.slug+'-thumb.png')];
  const r=spawnSync(ffmpeg,args,{windowsHide:true});if(r.status)throw new Error('Thumbnail failed: '+item.slug);
  const html=await readFile(join(dir,item.slug+'.html'),'utf8');
  item.responsiveMarkers={breakpointClasses: /(?:sm|md|lg|xl):/.test(html),mediaQueries:/@media/.test(html),viewport:/name=["']viewport["']/.test(html)};
  item.claimsToReview=[...html.matchAll(/.{0,50}(?:4K|60\s?fps|unlimited|\d+\s?%|full ownership|guaranteed).{0,90}/gi)].map(m=>m[0]);
  items.push(item);
}
const args=['-hide_banner','-loglevel','error','-y'];
items.forEach(x=>args.push('-i',join(dir,x.slug+'-thumb.png')));
const layout=items.map((_,i)=>`${(i%3)*640}_${Math.floor(i/3)*480}`).join('|');
args.push('-filter_complex',items.map((_,i)=>`[${i}:v]`).join('')+`xstack=inputs=${items.length}:layout=${layout}:fill=0x08080B[out]`,'-map','[out]','-frames:v','1',resolve('docs/ui/product-screens-overview.png'));
const r=spawnSync(ffmpeg,args,{windowsHide:true});if(r.status)throw new Error('Overview generation failed');
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cards=items.map((x,i)=>`<article><a href="product/${x.slug}.png"><img src="product/${x.slug}-thumb.png" alt="${esc(x.title)} desktop design" loading="lazy"></a><div><small>${String(i+1).padStart(2,'0')} / DESKTOP CONCEPT</small><h2>${esc(x.title)}</h2><p><a href="product/${x.slug}.png">Full screenshot</a> · <a href="product/${x.slug}.html">Stitch HTML export</a></p></div></article>`).join('\n');
await writeFile('docs/ui/PRODUCT-DESIGN-REVIEW.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Newbert AI Video — design review</title><style>*{box-sizing:border-box}body{margin:0;background:#08080b;color:#f5f2fa;font:16px/1.6 system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:40px 24px}h1{font-size:clamp(28px,4vw,48px);line-height:1.15}a{color:#b9a7ff}p{color:#b7b0c5}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:24px}article{background:#111116;border:1px solid #302b40;border-radius:16px;overflow:hidden}article img{display:block;width:100%;height:auto}article div{padding:20px}h2{font-size:20px;margin:8px 0}small{color:#7de5e0}header{margin-bottom:32px}a:focus-visible{outline:3px solid #a18bff;outline-offset:4px}</style><main><header><small>DESIGN REVIEW · SAMPLE DATA · 29 OCTOBER 2026</small><h1>Your creation workspace,<br>from idea to finished video.</h1><p>${items.length} desktop concepts matching the approved black/violet/mint homepage. These are design exports, not functioning application screens. See the responsive-review report for narrow-viewport checks; interaction and accessibility validation remain for implementation. Publishing is planned.</p><p><a href="https://stitch.withgoogle.com/projects/2520368196713015322">Open Stitch project</a> · <a href="stitch-homepage-v1.png">Approved homepage direction</a> · <a href="PRODUCT-SCREENS-V1.md">Flow and responsive handoff</a> · <a href="product/responsive-review.json">Responsive review report</a></p></header><section class="grid">${cards}</section></main></html>`);
await writeFile('docs/ui/product/manifest.json',JSON.stringify({date:'2026-10-29',status:'Desktop concepts for review',projectId:'2520368196713015322',screens:items},null,2)+'\n');
console.log(JSON.stringify(items.map(x=>({title:x.title,width:x.pixelWidth,height:x.pixelHeight,responsiveMarkers:x.responsiveMarkers,claimsToReview:x.claimsToReview})),null,2));
