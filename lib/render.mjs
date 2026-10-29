import { spawn } from 'node:child_process';
import { writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { sceneObjects, wrap, palette } from '../public/scene.js';
import { AppError } from './domain.mjs';
const require = createRequire(import.meta.url);
export function encoder() { if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH; try { return require('ffmpeg-static'); } catch { return null; } }
function run(args, cwd, timeout = 240000) {
  return new Promise((resolve, reject) => {
    const bin = encoder(); if (!bin) return reject(new AppError('Video rendering needs FFmpeg. Install dependencies or set FFMPEG_PATH.', 422));
    const child = spawn(bin, args, { cwd, windowsHide: true, timeout }); let stderr = '';
    child.stderr.on('data', d => { stderr = (stderr + d.toString()).slice(-16000); });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(stderr) : reject(new AppError('The video encoder failed. Your narration and storyboard are saved.', 500)));
  });
}
export async function audioDuration(dir) {
  const stderr = await run(['-hide_banner', '-i', 'audio.mp3', '-f', 'null', '-'], dir);
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) throw new AppError('Could not measure narration duration.');
  return +match[1] * 3600 + +match[2] * 60 + +match[3];
}
function time(s) { const c = Math.round(s * 100); return `${Math.floor(c / 360000)}:${String(Math.floor(c / 6000) % 60).padStart(2, '0')}:${String(Math.floor(c / 100) % 60).padStart(2, '0')}.${String(c % 100).padStart(2, '0')}`; }
function color(hex) { return '&H' + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3) + '&'; }
function safe(s) { return String(s).replace(/[{}\\\r\n]/g, ' '); }
export function assDocument(timeline) {
  let ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Nirmala UI,42,&H00FFFFFF,&H00FFFFFF,&H00101626,&H00101626,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const event = (layer, start, end, text) => { if (end > start) ass += `Dialogue: ${layer},${time(start)},${time(end)},Default,,0,0,0,,${text}\n`; };
  timeline.forEach((scene, i) => {
    sceneObjects(scene, i).forEach(op => {
      const start = scene.start + op.delay;
      const motion = `\\move(${op.x + 35},${op.y},${op.x},${op.y},0,450)\\fad(300,0)`;
      if (op.type === 'rect') event(0, start, scene.end, `{${motion}\\c${color(op.color)}\\p1}m 0 0 l ${op.w} 0 ${op.w} ${op.h} 0 ${op.h}{\\p0}`);
      else event(1, start, scene.end, `{${motion}\\fs${op.size}\\c${color(op.color)}}${wrap(op.text, op.max || 50).map(safe).join('\\N')}`);
    });
    for (const cap of scene.captions) {
      const lines = wrap(cap.text, 34);
      if (lines.length > 2) throw new AppError('A caption is too long for two lines. Shorten the narration phrase.');
      event(3, cap.start, Math.min(cap.end + .08, scene.end), `{\\an2\\pos(540,1640)\\fs48\\bord13\\3c${color(palette.bg)}\\c${color(palette.ink)}}${lines.map(safe).join('\\N')}`);
    }
  }); return ass;
}
export async function render(dir, timeline, duration, options = {}) {
  await writeFile(join(dir, 'composition.ass'), options.composition || assDocument(timeline));
  await run(['-hide_banner', '-y', '-f', 'lavfi', '-i', `color=c=${options.background || palette.bg}:s=1080x1920:r=30`, '-i', 'audio.mp3', '-vf', 'ass=composition.ass', '-t', String(Math.ceil(duration * 30) / 30), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', 'video.mp4'], dir, 600000);
  const output = await stat(join(dir, 'video.mp4'));
  if (output.size < 1000) throw new AppError('The generated video file is incomplete.');
  await run(['-v', 'error', '-i', 'video.mp4', '-f', 'null', '-'], dir, 120000);
}
