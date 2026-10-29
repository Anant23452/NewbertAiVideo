import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { plan, speech } from '../lib/providers.mjs';
import { buildTimeline, scriptFor } from '../lib/domain.mjs';
import { audioDuration, render } from '../lib/render.mjs';

// Dedicated local prototype artifacts; no credentials are written to outputs.
const dir = resolve('artifacts/first-prototype');
async function saved(name) {
  try { return JSON.parse(await readFile(join(dir, name), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function save(name, value) { await writeFile(join(dir, name), JSON.stringify(value, null, 2)); }

try {
  await mkdir(dir, { recursive: true });
  let storyboard = await saved('storyboard.json');
  if (!storyboard) {
    storyboard = await plan({ topic: 'Explain binary numbers using 5 as an example. Maximum 65 spoken words total.', language: 'Hinglish', audience: 'College students' });
    await save('storyboard.json', storyboard);
  }
  console.log('Storyboard saved: four scenes explaining binary numbers.');
  let source = await saved('speech.json');
  if (source && scriptFor(source.scenes) !== scriptFor(storyboard.scenes)) {
    throw new Error('The script changed after narration was saved. Use a new output folder to generate a new prototype.');
  }
  if (!source) {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY || '' }, signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Cannot list ElevenLabs voices. Enable Voices: Read permission on your API key, and check its account access.');
    }
    const { voices = [] } = await response.json();
    const configured = process.env.ELEVENLABS_VOICE_ID;
    const stock = voices.filter(v => v.category === 'premade' || v.category === 'default');
    const voice = configured ? voices.find(v => v.voice_id === configured) :
      stock.find(v => /hindi|indian/i.test(JSON.stringify(v.labels || {}))) || stock[0];
    if (!voice) throw new Error('No suitable default voice is available. Select an account-accessible voice and set ELEVENLABS_VOICE_ID.');
    console.log(`Generating narration with ${voice.name}; this uses your ElevenLabs allowance.`);
    const result = await speech(storyboard.scenes, voice.voice_id);
    if (!result.audio_base64 || !result.alignment) throw new Error('ElevenLabs returned incomplete audio or timestamps.');
    source = { voice: { id: voice.voice_id, name: voice.name }, scenes: storyboard.scenes, alignment: result.alignment };
    await writeFile(join(dir, 'audio.mp3'), Buffer.from(result.audio_base64, 'base64'));
    await save('speech.json', source);
    let env = await readFile('.env', 'utf8');
    const setting = `ELEVENLABS_VOICE_ID=${voice.voice_id}`;
    env = /^ELEVENLABS_VOICE_ID=.*$/m.test(env) ? env.replace(/^ELEVENLABS_VOICE_ID=.*$/m, setting) : `${env}\n${setting}\n`;
    await writeFile('.env', env);
  } else console.log('Reusing saved narration without another speech request.');
  const duration = await audioDuration(dir);
  if (duration > Number(process.env.MAX_AUDIO_SECONDS || 180)) throw new Error('Narration exceeds the configured duration limit.');
  const timeline = buildTimeline(storyboard.scenes, source.alignment, duration);
  await save('timeline.json', timeline);
  console.log(`Rendering ${duration.toFixed(2)} seconds with synchronized captions and motion graphics.`);
  await render(dir, timeline, duration);
  await save('result.json', { duration, voice: source.voice, model: storyboard.model, video: 'video.mp4' });
  console.log(`Video ready: ${join(dir, 'video.mp4')}`);
} catch (error) {
  console.error(error.name === 'TimeoutError' ? 'Provider timed out. Check provider usage before retrying.' : error.message);
  process.exitCode = 1;
}
