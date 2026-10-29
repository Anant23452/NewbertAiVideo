export const palette = { bg: '#101626', ink: '#f7f8fc', muted: '#a2acc2', accent: '#c0f477', purple: '#b2a0ed', card: '#1e293d' };
export function sceneObjects(scene, index = 0) {
  const p = palette, labels = scene.labels || [], objects = [
    { type: 'text', x: 90, y: 175, size: 31, color: p.accent, text: `EXPLAINED SIMPLY  /  ${String(index + 1).padStart(2, '0')}`, delay: 0 },
    { type: 'text', x: 90, y: 330, size: 76, color: p.ink, text: scene.title, max: 21, delay: .08 }
  ];
  const positions = scene.kind === 'comparison' ? labels.map((_, i) => ({ x: i % 2 ? 560 : 90, y: 650 + Math.floor(i / 2) * 300, w: 430 })) : labels.map((_, i) => ({ x: 110 + (i % 2) * 25, y: 650 + i * 200, w: 810 }));
  labels.forEach((label, i) => {
    const pos = positions[i], color = i % 2 ? p.purple : p.accent;
    objects.push({ type: 'rect', ...pos, h: 155, color: p.card, delay: .18 + i * .12 });
    objects.push({ type: 'rect', x: pos.x, y: pos.y, w: 7, h: 155, color, delay: .18 + i * .12 });
    objects.push({ type: 'text', x: pos.x + 35, y: pos.y + 53, size: 39, color: p.ink, text: label, max: scene.kind === 'comparison' ? 13 : 29, delay: .23 + i * .12 });
  });
  objects.push({ type: 'text', x: 90, y: 1760, size: 26, color: p.muted, text: 'LEARN SOMETHING. SEE IT DIFFERENTLY.', delay: 0 });
  return objects;
}
export function wrap(text, max = 30) {
  const words = text.split(/\s+/u), lines = []; let line = '';
  for (const word of words) {
    const chunks = Array.from(word).length > max ? Array.from(word).reduce((out, ch, i) => { if (i % max === 0) out.push(''); out[out.length - 1] += ch; return out; }, []) : [word];
    for (const chunk of chunks) { if (line && (line + ' ' + chunk).length > max) { lines.push(line); line = ''; } line += (line ? ' ' : '') + chunk; }
  }
  if (line) lines.push(line); return lines;
}
