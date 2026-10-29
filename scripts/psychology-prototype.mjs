import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { speech } from '../lib/providers.mjs';
import { buildTimeline, scriptFor, validateScenes } from '../lib/domain.mjs';
import { audioDuration, render } from '../lib/render.mjs';
import { wrap } from '../public/scene.js';

const dir = resolve('artifacts/psychology-spotlight');
const scenes = validateScenes([
  { title: 'SAB DEKH RAHE HAIN?', narration: 'क्लास में एक छोटा सा गलत जवाब दिया, और लगा सब तुम्हें ही देख रहे हैं? शायद तुम्हारा दिमाग उस पल पर कुछ ज़्यादा ही रोशनी डाल रहा है।', labels: ['YOU', 'EVERYONE?'], kind: 'concept' },
  { title: 'THE SPOTLIGHT EFFECT', narration: 'इसे स्पॉटलाइट इफ़ेक्ट कहते हैं। हम अक्सर अपनी हरकतों और दिखावे पर दूसरों का ध्यान असल से ज़्यादा समझ लेते हैं। इसका मतलब यह नहीं कि कोई कभी ध्यान नहीं देता।', labels: ['What you feel', 'What others notice'], kind: 'comparison' },
  { title: 'ZOOM OUT.', narration: 'तुम अपने अनुभव के सेंटर में हो। लेकिन दूसरे लोग भी अपनी क्लास, काम और अगली बात के बारे में सोच रहे हो सकते हैं। तुम्हारी छोटी गलती उनके लिए उतनी बड़ी घटना नहीं होती।', labels: ['CLASS', 'WORK', 'WHAT NEXT?'], kind: 'flow' },
  { title: 'ONE MOMENT. NOT YOU.', narration: 'अगली बार ऐसा लगे, तो खुद से पूछो: क्या मेरे पास सच में कोई सबूत है कि सब मुझे जज कर रहे हैं? एक पल की गलती, तुम्हारी पूरी पहचान नहीं है।', labels: ['Pause', 'Check the evidence', 'Keep going'], kind: 'steps' }
]);
const sources = [{ title: 'Gilovich, Medvec & Savitsky (2000), The spotlight effect in social judgment', url: 'https://pubmed.ncbi.nlm.nih.gov/10707330/' }];
const esc = s => String(s).replace(/[{}\\\r\n]/g, ' ');
const clock = s => { const n = Math.round(s * 100); return `${Math.floor(n / 360000)}:${String(Math.floor(n / 6000) % 60).padStart(2,'0')}:${String(Math.floor(n / 100) % 60).padStart(2,'0')}.${String(n % 100).padStart(2,'0')}`; };
const col = h => '&H' + h.slice(4,6) + h.slice(2,4) + h.slice(0,2) + '&';
function composition(timeline, duration) {
  let out = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Nirmala UI,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  const event = (layer,a,b,t) => { if (b>a) out += `Dialogue: ${layer},${clock(a)},${clock(b)},Default,,0,0,0,,${t}\n`; };
  const text = (s,t,x,y,size,value,color='F4F5FA',extra='') => event(5,s,t,`{\\an7\\pos(${x},${y})\\fs${size}\\c${col(color)}\\fad(220,180)${extra}}${wrap(value,size>65?20:38).map(esc).join('\\N')}`);
  const path = (a,b,d,color,extra='',layer=1) => event(layer,a,b,`{\\an7\\pos(0,0)\\c${col(color)}\\bord0\\fad(350,250)${extra}\\p1}${d}{\\p0}`);
  const line = (a,b,x,y,x2,y2,color='9D80FF',width=3) => {
    const d=`m ${x} ${y} l ${x2} ${y2}`;
    path(a,b,d,color,`\\bord${width+9}\\3c${col(color)}\\blur18\\alpha&HAA&`,0);
    path(a,b,d,color,`\\bord${width}\\3c${col(color)}\\blur1`,2);
  };
  const circle = (a,b,x,y,r,color='A18BFF',fill=false) => {
    const pts=Array.from({length:65},(_,i)=>`${Math.round(x+r*Math.cos(i*Math.PI/32))} ${Math.round(y+r*Math.sin(i*Math.PI/32))}`);
    path(a,b,`m ${pts[0]} l ${pts.slice(1).join(' ')}`,color, fill?'':`\\alpha&HFF&\\3a&H30&\\bord2\\3c${col(color)}\\blur1`);
  };
  const person = (a,b,x,y,bright=false) => {
    const c=bright?'E6E0FF':'555265';
    circle(a,b,x,y,25,c,true);
    path(a,b,`m ${x-39} ${y+80} b ${x-39} ${y+30} ${x+39} ${y+30} ${x+39} ${y+80} l ${x+39} ${y+105} ${x-39} ${y+105}`,c);
  };
  timeline.forEach((s,i)=>{
    const a=s.start,b=s.end;
    text(a,b,78,110,24,'MIND / FIELD NOTES','A18BFF','\\fsp4');
    text(a,b,850,110,24,`0${i+1} / 04`,'807A94');
    text(a+.15,b,78,242,86,s.title,'F6F3FF','\\b1');
    line(a,b,80,490,1000,490,'5D497F',1);
    // A soft electric filament: two long fades per scene, never a strobe.
    const bolt='m 1000 540 l 952 645 1005 658 935 790 987 773 917 910';
    path(a,b,bolt,'8C68FF','\\bord16\\3c&HFF688C&\\blur24\\alpha&HAA&',0);
    path(a,b,bolt,'C6ACFF','\\bord2\\3c&HFFACC6&\\blur1',2);
    if(i===0){
      path(a+.3,b,'m 540 580 l 310 1130 770 1130','342052','\\alpha&HC0&\\blur28',0);
      circle(a+.5,b,540,1000,190);circle(a+.7,b,540,1000,225,'473358');
      person(a+.5,b,540,950,true);
      [210,870].forEach(x=>{person(a+.9,b,x,1010);line(a+1.2,b,x,980,465+(x>540?150:0),970,'473358',1);});
      text(a+.7,b,393,1260,34,'THE IMAGINARY SPOTLIGHT','BAA8E8');
    } else if(i===1){
      circle(a+.3,b,320,910,160);circle(a+.5,b,760,910,78,'7DE5E0');
      text(a+.4,b,245,875,42,'FEELS','D8CCFF');text(a+.6,b,697,875,35,'SEEN','9BF4ED');
      text(a+.5,b,166,1150,31,'YOUR ESTIMATE','BCA9EE');text(a+.7,b,634,1150,31,'ACTUAL ATTENTION','8CDAD6');
      text(a+.8,b,154,1290,26,'Concept illustration — not measured values','827C91');
    } else if(i===2){
      circle(a+.3,b,540,945,245,'473358');person(a+.4,b,540,900,true);
      [[280,760,'CLASS'],[800,760,'WORK'],[280,1150,'MY PLANS'],[800,1150,'WHAT NEXT?']].forEach(([x,y,label],k)=>{
        line(a+.5+k*.13,b,540,945,x,y,'554071',1);person(a+.6+k*.13,b,x,y-30);text(a+.8+k*.13,b,x-80,y+100,27,label,'AA9EBE');
      });
    } else {
      ['PAUSE.','CHECK THE EVIDENCE.','KEEP GOING.'].forEach((v,k)=>{
        const y=690+k*205;circle(a+.3+k*.3,b,130,y+28,24,k===2?'7DE5E0':'A18BFF');
        text(a+.35+k*.3,b,190,y,43,v,k===2?'A7F6EB':'E0D8F5');
        if(k<2)line(a+.4+k*.3,b,130,y+57,130,y+176,'514261',1);
      });
      text(a+.7,b,118,1340,29,'A moment is not your whole identity.','B7A8CF');
    }
    for(const cap of s.captions) event(8,cap.start,Math.min(cap.end+.06,b),`{\\an2\\pos(540,1630)\\fs48\\bord5\\3c&H000000&\\c&HFFFFFF&\\fad(60,60)}${wrap(cap.text,32).map(esc).join('\\N')}`);
    text(a,b,80,1800,22,'PSYCHOLOGY  /  THE SPOTLIGHT EFFECT','82768F');
    line(a,b,80,1750,80+920*((i+1)/4),1750,'9D80FF',2);
  });
  return out;
}
try {
  await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'storyboard.json'),JSON.stringify({scenes,sources,reviewNotes:'General educational explanation; the circles are conceptual, not quantitative data.'},null,2));
  let source;try{source=JSON.parse(await readFile(join(dir,'speech.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(source&&source.script!==scriptFor(scenes))throw new Error('Saved speech belongs to a different script.');
  if(!source){
    console.log('Generating Hindi/Hinglish narration with the configured voice.');
    const result=await speech(scenes,process.env.ELEVENLABS_VOICE_ID);
    if(!result.audio_base64||!result.alignment)throw new Error('Incomplete narration response.');
    await writeFile(join(dir,'audio.mp3'),Buffer.from(result.audio_base64,'base64'));
    source={script:scriptFor(scenes),alignment:result.alignment,voiceId:process.env.ELEVENLABS_VOICE_ID};
    await writeFile(join(dir,'speech.json'),JSON.stringify(source));
  }
  const duration=await audioDuration(dir);
  const timeline=buildTimeline(scenes,source.alignment,duration);
  await writeFile(join(dir,'timeline.json'),JSON.stringify(timeline,null,2));
  console.log(`Rendering ${duration.toFixed(2)}s, black background, electric violet / ice mint lighting.`);
  await render(dir,timeline,duration,{background:'#000000',composition:composition(timeline,duration)});
  await writeFile(join(dir,'result.json'),JSON.stringify({duration,voiceId:source.voiceId,sources,style:'Black / electric violet / ice mint',video:'video.mp4'},null,2));
  console.log(`Ready: ${join(dir,'video.mp4')}`);
}catch(e){console.error(e.message);process.exitCode=1;}
