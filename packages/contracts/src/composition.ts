// One controlled composition vocabulary for browser preview and FFmpeg export.
// No model-authored markup, expressions, URLs, fonts, coordinates or code.
export const VIDEO = {
  width: 720,
  height: 1280,
  fps: 24,
  font: "Nirmala UI",
  version: 1,
} as const;
export type Box = { x: number; y: number; w: number; h: number };
export type Op = {
  type: "text" | "rect" | "circle" | "line";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text?: string;
  size?: number;
  start: number;
  end: number;
  highlight?: number;
  highlightEnd?: number;
  maxLines?: number;
};
export function wrapText(
  text: string,
  width: number,
  size: number,
  maxLines = 3,
): string[] {
  const graphemes = (s: string) => [
    ...new Intl.Segmenter("hi", { granularity: "grapheme" }).segment(s),
  ];
  const measure = (s: string) =>
    graphemes(s).reduce(
      (n, g) =>
        n +
        (g.segment === " "
          ? 0.35
          : /^[il.,:!1]$/.test(g.segment)
            ? 0.4
            : /^[MWmw@#%]$/.test(g.segment)
              ? 1.2
              : /^[A-Z]$/.test(g.segment)
                ? 1
                : /^[a-z0-9]$/.test(g.segment)
                  ? 0.8
                  : 1.5) *
          size,
      0,
    );
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/u)) {
    if (measure(word) > width) throw new Error("TEXT_TOO_WIDE");
    const candidate = line ? line + " " + word : word;
    if (measure(candidate) > width) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) throw new Error("TEXT_TOO_TALL");
  return lines;
}
export function sceneOps(scene: any, index: number, accent = "#A18BFF"): Op[] {
  const duration = scene.end - scene.start;
  const ops: Op[] = [];
  const add = (op: Omit<Op, "start" | "end">, delay = 0) =>
    ops.push({
      ...op,
      start: scene.start + Math.min(delay, duration / 3),
      end: scene.end,
    });
  add({
    type: "text",
    x: 48,
    y: 76,
    w: 620,
    h: 28,
    size: 16,
    color: accent,
    text: `NEWBERT · EXPLAINED IN MOTION`,
  });
  add({
    type: "text",
    x: 48,
    y: 132,
    w: 620,
    h: 132,
    size: 44,
    color: "#F5F2FA",
    text: scene.title,
    maxLines: 2,
  });
  add({ type: "line", x: 48, y: 287, w: 624, h: 2, color: "#30283D" });
  add({
    type: "text",
    x: 48,
    y: 310,
    w: 620,
    h: 24,
    size: 14,
    color: "#A7A1B5",
    text: `SCENE ${String(index + 1).padStart(2, "0")} · ${scene.component.toUpperCase()}`,
  });
  const objects = scene.objects;
  if (objects.length < 1 || objects.length > 6)
    throw new Error("VISUAL_TOO_COMPLEX");
  const centers: Box[] = objects.map((_: unknown, i: number) => {
    if (["steps", "timeline", "flow"].includes(scene.component))
      return {
        x: 108,
        y: 390 + i * Math.min(83, 420 / objects.length),
        w: 506,
        h: 64,
      };
    if (scene.component === "typography")
      return { x: 70, y: 420 + i * 64, w: 580, h: 54 };
    if (scene.component === "comparison")
      return {
        x: i % 2 ? 382 : 48,
        y:
          (objects.length <= 2 ? 550 : objects.length <= 4 ? 460 : 385) +
          Math.floor(i / 2) * 140,
        w: 290,
        h: 112,
      };
    const angle = (i / objects.length) * Math.PI * 2 - Math.PI / 2;
    return {
      x: 360 + Math.cos(angle) * 210 - 105,
      y: 625 + Math.sin(angle) * 195 - 58,
      w: 210,
      h: 116,
    };
  });
  if (["relationship", "diagram"].includes(scene.component))
    add({ type: "circle", x: 318, y: 583, w: 84, h: 84, color: accent }, 0.12);
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i],
      b = centers[i]!;
    let start = scene.start + i * 0.15;
    const enters = scene.timedCues?.find(
      (c: any) => c.objectId === o.id && c.event === "enter",
    );
    if (enters) start = enters.start;
    const connect = scene.timedCues?.find(
      (c: any) => c.objectId === o.id && c.event === "connect",
    );
    const highlight = scene.timedCues?.find(
      (c: any) => c.objectId === o.id && c.event === "highlight",
    );
    if (["relationship", "diagram"].includes(scene.component))
      ops.push({
        type: "line",
        x: 360,
        y: 625,
        w: b.x + b.w / 2 - 360,
        h: b.y + b.h / 2 - 625,
        color: accent,
        start: connect?.start ?? start,
        end: scene.end,
      });
    if (["flow", "steps", "timeline"].includes(scene.component) && i > 0)
      ops.push({
        type: "line",
        x: 86,
        y: centers[i - 1]!.y + 30,
        w: 0,
        h: b.y - centers[i - 1]!.y,
        color: accent,
        start,
        end: scene.end,
      });
    const exit = scene.timedCues?.find(
      (c: any) => c.objectId === o.id && c.event === "exit",
    );
    const end = exit?.start ?? scene.end;
    if (scene.component !== "typography")
      ops.push({
        type: "rect",
        ...b,
        color: "#17121F",
        start,
        end,
        highlight: highlight?.start,
        highlightEnd: highlight?.end,
      });
    if (["flow", "steps", "timeline"].includes(scene.component))
      ops.push({
        type: "circle",
        x: 66,
        y: b.y + 16,
        w: 30,
        h: 30,
        color: accent,
        start,
        end,
      });
    ops.push({
      type: "text",
      x: b.x + 14,
      y: b.y + 16,
      w: b.w - 28,
      h: b.h - 20,
      size: 24,
      color: "#F5F2FA",
      text: o.label || o.type,
      start,
      end,
      maxLines: 3,
    });
  }
  if (scene.illustrative)
    add({
      type: "text",
      x: 48,
      y: 923,
      w: 620,
      h: 25,
      size: 17,
      color: "#7DE5E0",
      text: "ILLUSTRATIVE EXAMPLE · उदाहरण",
    });
  add({ type: "line", x: 48, y: 988, w: 624, h: 2, color: "#30283D" });
  for (const c of scene.captions || [])
    ops.push({
      type: "text",
      x: 48,
      y: 1023,
      w: 624,
      h: 104,
      size: 32,
      color: "#F5F2FA",
      text: c.text,
      start: c.start,
      end: c.end,
      maxLines: 2,
    });
  add({
    type: "text",
    x: 48,
    y: 1190,
    w: 624,
    h: 28,
    size: 13,
    color: "#A7A1B5",
    text: "AI voice · ElevenLabs attribution · Non-commercial pilot",
  });
  for (const op of ops) {
    if (op.type === "text") {
      const lines = wrapText(op.text!, op.w, op.size!, op.maxLines ?? 3);
      if (lines.length * op.size! * 1.4 > op.h + 3)
        throw new Error("TEXT_OUTSIDE_SAFE_AREA");
    }
    if (op.start < scene.start || op.end > scene.end || op.start > op.end)
      throw new Error("INVALID_VISUAL_TIMING");
  }
  return ops;
}
const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function frameSvg(
  timeline: any[],
  time: number,
  accent = "#A18BFF",
  preset = "black_glow",
) {
  accent = /^#[a-fA-F0-9]{6}$/.test(accent) ? accent : "#A18BFF";
  const scene =
    timeline.find((s: any) => time >= s.start && time < s.end) ||
    timeline.at(-1);
  if (!scene) return "";
  const ops = sceneOps(scene, timeline.indexOf(scene), accent);
  const body = ops
    .filter((o) => time >= o.start && time < o.end)
    .map((o) => {
      const fade = Math.min(1, (time - o.start) / 0.3);
      const dx = (1 - fade) * 22;
      const color =
        o.highlight !== undefined &&
        time >= o.highlight &&
        time < (o.highlightEnd ?? o.end)
          ? "#7DE5E0"
          : o.color;
      if (o.type === "text")
        return `<text x="${o.x + dx}" y="${o.y + o.size!}" fill="${color}" font-size="${o.size}" opacity="${fade}" font-family="Nirmala UI, Noto Sans Devanagari, sans-serif">${wrapText(
          o.text!,
          o.w,
          o.size!,
          o.maxLines,
        )
          .map(
            (s, i) =>
              `<tspan x="${o.x + dx}" dy="${i ? o.size! * 1.4 : 0}">${esc(s)}</tspan>`,
          )
          .join("")}</text>`;
      if (o.type === "circle")
        return `<ellipse cx="${o.x + o.w / 2 + dx}" cy="${o.y + o.h / 2}" rx="${o.w / 2}" ry="${o.h / 2}" fill="${color}" opacity="${fade}"/>`;
      if (o.type === "line")
        return `<line x1="${o.x}" y1="${o.y}" x2="${o.x + o.w}" y2="${o.y + o.h}" stroke="${color}" stroke-width="2" opacity="${fade}"/>`;
      return `<rect x="${o.x + dx}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${o.color}" stroke="${color === o.color ? accent : color}" opacity="${fade}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><rect width="720" height="1280" fill="${preset === "black_glow" ? "#000000" : "#08080B"}"/>${body}</svg>`;
}
