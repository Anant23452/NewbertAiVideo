// Narrow-screen handoff correction to a design export; not application code.
import { readFile, writeFile } from 'node:fs/promises';
const file='docs/ui/product/07-publishing.html';
let html=await readFile(file,'utf8');
const style='<style id="handoff-mobile-account">@media(max-width:767px){[class~="gap-3.5"]{min-width:0;align-items:flex-start}[class~="gap-3.5"]>div{min-width:0}[class~="gap-3.5"] [class~="gap-2"]{flex-wrap:wrap}[class~="gap-3.5"] p{overflow-wrap:anywhere}}</style>';
if(!html.includes('handoff-mobile-account'))html=html.replace('</head>',style+'</head>');
html=html.replace('Draft exports publish directly to Reels.','Schedules use an exact ready video version.');
await writeFile(file,html);
console.log('Applied mobile account-card wrapping to the local publishing design export.');
