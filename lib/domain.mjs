import { wrap } from '../public/scene.js';
export class AppError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export const kinds = ['flow', 'comparison', 'concept', 'steps'];
export function cleanText(value, max = 3000) {
  if (typeof value !== 'string') throw new AppError('Please enter valid text.');
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}
export function brief(input) {
  const topic = cleanText(input.topic, 240);
  if (topic.length < 5) throw new AppError('Add a topic with at least five characters.');
  if (!['Hindi', 'Hinglish'].includes(input.language)) throw new AppError('Choose Hindi or Hinglish.');
  return { topic, language: input.language, audience: ['College students', 'School students', 'Curious learners'].includes(input.audience) ? input.audience : 'College students' };
}
export function validateScenes(scenes) {
  if (!Array.isArray(scenes) || scenes.length < 2 || scenes.length > 8) throw new AppError('A storyboard needs between two and eight scenes.');
  const result = scenes.map((s, i) => {
    const narration = cleanText(s.narration, 1200), title = cleanText(s.title, 100);
    if (!title || narration.length < 8) throw new AppError(`Scene ${i + 1} needs a title and narration.`);
    const labels = (Array.isArray(s.labels) ? s.labels : []).slice(0, 4).map(x => cleanText(x, 52)).filter(Boolean);
    if (labels.length < 2) throw new AppError(`Scene ${i + 1} needs at least two visual labels.`);
    return { id: `scene-${i + 1}`, title, narration, kind: kinds.includes(s.kind) ? s.kind : 'concept', labels, visual: cleanText(s.visual || title, 240) };
  });
  if (result.reduce((n, s) => n + s.narration.length, 0) > 5000) throw new AppError('The pilot supports up to 5,000 narration characters. Shorten the script.');
  return result;
}
export function scriptFor(scenes) { return scenes.map(s => s.narration).join('\n\n'); }
export function buildTimeline(scenes, alignment, duration) {
  const script = scriptFor(scenes);
  if (!alignment || !Array.isArray(alignment.characters) || alignment.characters.join('') !== script) throw new AppError('Speech timing did not match the script. Generate narration again.');
  const rawStarts = alignment.character_start_times_seconds, rawEnds = alignment.character_end_times_seconds;
  if (!Number.isFinite(duration) || duration <= 0 || !Array.isArray(rawStarts) || !Array.isArray(rawEnds) || rawStarts.length !== alignment.characters.length || rawEnds.length !== alignment.characters.length) throw new AppError('Speech timing is incomplete.');
  const starts = [], ends = [];
  alignment.characters.forEach((ch, i) => { for (let unit = 0; unit < ch.length; unit++) { starts.push(rawStarts[i]); ends.push(rawEnds[i]); } });
  let previousStart = 0, previousEnd = 0;
  for (let i = 0; i < starts.length; i++) {
    if (!Number.isFinite(starts[i]) || !Number.isFinite(ends[i]) || starts[i] < previousStart || ends[i] < previousEnd || ends[i] < starts[i] || ends[i] > duration + .1) throw new AppError('Speech timing is invalid.');
    previousStart = starts[i]; previousEnd = ends[i];
  }
  let offset = 0;
  const timed = scenes.map((s, i) => {
    const start = i === 0 ? 0 : starts[offset];
    const endIndex = offset + s.narration.length;
    const words = [...s.narration.matchAll(/\S+/gu)];
    const captions = [];
    for (let k = 0; k < words.length;) {
      const group = [words[k++]];
      while (k < words.length && group.length < 6 && wrap([...group, words[k]].map(w => w[0]).join(' '), 34).length <= 2) group.push(words[k++]);
      const first = offset + group[0].index;
      const lastWord = group.at(-1), last = offset + lastWord.index + lastWord[0].length - 1;
      captions.push({ text: group.map(w => w[0]).join(' '), start: starts[first], end: ends[last] });
    }
    offset = endIndex + (i < scenes.length - 1 ? 2 : 0);
    return { ...s, start, end: duration, captions };
  });
  timed.forEach((s, i) => { s.end = timed[i + 1]?.start ?? duration; });
  return timed;
}
export function previewTimeline(scenes) {
  let time = 0;
  return scenes.map(s => { const start = time; time += Math.max(6, s.narration.split(/\s+/u).length / 2.2); return { ...s, start, end: time, captions: [{ text: s.narration, start, end: time }] }; });
}
export function publicProject(p) { return structuredClone(p); }
