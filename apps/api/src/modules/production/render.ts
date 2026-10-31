import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { writeFile, readFile, stat, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  sceneOps,
  wrapText,
  VIDEO,
  type Op,
} from "../../../../../packages/contracts/src/composition.js";
import { ProductionError } from "./timing.js";
const require = createRequire(import.meta.url);
export function ffmpeg(): string {
  const bin = process.env.FFMPEG_PATH || require("ffmpeg-static");
  if (typeof bin !== "string")
    throw new ProductionError("ENCODER_NOT_AVAILABLE");
  return bin;
}
export async function renderPreflight() {
  await access(ffmpeg()).catch(() => {
    throw new ProductionError("ENCODER_NOT_AVAILABLE");
  });
  if (process.platform === "win32")
    await access(resolve("C:/Windows/Fonts/Nirmala.ttc")).catch(() => {
      throw new ProductionError("DEVANAGARI_FONT_MISSING");
    });
  else if (process.env.DEVANAGARI_FONT_READY !== "true")
    throw new ProductionError("DEVANAGARI_FONT_MISSING");
}
export async function run(
  args: string[],
  cwd: string,
  signal?: AbortSignal,
  timeout = 300000,
) {
  return new Promise<string>((done, fail) => {
    const child = spawn(ffmpeg(), args, {
      cwd,
      windowsHide: true,
      timeout,
      ...(signal ? { signal } : {}),
    });
    let log = "";
    child.stderr.on("data", (b) => {
      log = (log + b.toString()).slice(-40000);
    });
    child.on("error", () =>
      fail(
        new ProductionError(
          signal?.aborted ? "RENDER_CANCELLED" : "ENCODER_FAILED",
        ),
      ),
    );
    child.on("close", (code) =>
      code === 0
        ? done(log)
        : fail(
            new ProductionError(
              signal?.aborted ? "RENDER_CANCELLED" : "ENCODER_FAILED",
            ),
          ),
    );
  });
}
export async function measureAudio(dir: string) {
  const log = await run(
    ["-hide_banner", "-i", "audio.mp3", "-vn", "-f", "null", "-"],
    dir,
    undefined,
    30000,
  );
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log);
  if (!m) throw new ProductionError("AUDIO_DURATION_INVALID");
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
const time = (seconds: number) => {
  const n = Math.round(seconds * 100);
  return `${Math.floor(n / 360000)}:${String(Math.floor(n / 6000) % 60).padStart(2, "0")}:${String(Math.floor(n / 100) % 60).padStart(2, "0")}.${String(n % 100).padStart(2, "0")}`;
};
const color = (hex: string) =>
  "&H" + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3) + "&";
const safe = (s: string) => s.replace(/[{}\\\r\n]/g, " ");
function path(op: Op) {
  if (op.type === "circle") {
    const points = Array.from({ length: 33 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2;
      return `${Math.round(op.w / 2 + (Math.cos(a) * op.w) / 2)} ${Math.round(op.h / 2 + (Math.sin(a) * op.h) / 2)}`;
    });
    return "m " + points[0] + " l " + points.slice(1).join(" ");
  }
  if (op.type === "line") {
    const d = Math.hypot(op.w, op.h) || 1,
      dx = (-op.h / d) * 1.5,
      dy = (op.w / d) * 1.5;
    return `m ${dx} ${dy} l ${op.w + dx} ${op.h + dy} ${op.w - dx} ${op.h - dy} ${-dx} ${-dy}`;
  }
  return `m 0 0 l ${op.w} 0 ${op.w} ${op.h} 0 ${op.h}`;
}
export function assDocument(timeline: any[], accent: string) {
  let text = `[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,${VIDEO.font},32,&H00FFFFFF,&H00FFFFFF,&H00121117,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
  const event = (
    op: Op,
    col: string,
    from = op.start,
    to = op.end,
    borderColor = accent,
  ) => {
    if (to <= from) return;
    const move = `\\move(${op.x + 22},${op.y},${op.x},${op.y},0,300)\\fad(300,0)\\c${color(col)}`;
    let body: string;
    if (op.type === "text") {
      body =
        `{${move}\\fs${op.size}\\bord0}` +
        wrapText(op.text!, op.w, op.size!, op.maxLines).map(safe).join("\\N");
    } else {
      body = `{${move}\\bord${op.type === "rect" ? 1 : 0}\\3c${color(borderColor)}\\p1}${path(op)}{\\p0}`;
    }
    text += `Dialogue: ${op.type === "text" ? 2 : 0},${time(from)},${time(to)},Default,,0,0,0,,${body}\n`;
  };
  timeline.forEach((s, i) =>
    sceneOps(s, i, accent).forEach((op) => {
      event(op, op.color);
      if (op.highlight !== undefined && op.highlight < op.end)
        event(
          op,
          op.type === "rect" ? op.color : "#7DE5E0",
          op.highlight,
          Math.min(op.end, op.highlightEnd ?? op.end),
          "#7DE5E0",
        );
    }),
  );
  return text;
}
export async function renderVideo(
  dir: string,
  timing: any,
  content: any,
  signal?: AbortSignal,
) {
  // The local adapter requires the same installed Devanagari font as the preview.
  if (process.platform === "win32")
    await access(resolve("C:/Windows/Fonts/Nirmala.ttc")).catch(() => {
      throw new ProductionError("DEVANAGARI_FONT_MISSING");
    });
  else if (process.env.DEVANAGARI_FONT_READY !== "true")
    throw new ProductionError("DEVANAGARI_FONT_MISSING");
  const ass = assDocument(
    timing.timeline,
    content.style.accentColor || "#A18BFF",
  );
  await writeFile(join(dir, "composition.ass"), ass);
  const duration = Math.ceil(timing.duration * VIDEO.fps) / VIDEO.fps;
  await run(
    [
      "-hide_banner",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${content.style.preset === "black_glow" ? "black" : "0x08080B"}:s=720x1280:r=24`,
      "-i",
      "audio.mp3",
      "-vf",
      "ass=composition.ass",
      "-af",
      "apad",
      "-t",
      String(duration),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "25",
      "-maxrate",
      "400k",
      "-bufsize",
      "800k",
      "-pix_fmt",
      "yuv420p",
      "-threads",
      "2",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart",
      "video.mp4",
    ],
    dir,
    signal,
  );
  const output = await stat(join(dir, "video.mp4"));
  if (output.size < 1000 || output.size > 10 * 1024 * 1024)
    throw new ProductionError("VIDEO_SIZE_LIMIT");
  const log = await run(
    [
      "-hide_banner",
      "-i",
      "video.mp4",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-f",
      "null",
      "-",
    ],
    dir,
    signal,
    90000,
  );
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log);
  const actual = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  if (
    !/Video: h264/.test(log) ||
    !/720x1280/.test(log) ||
    !/Audio: aac/.test(log) ||
    Math.abs(actual - timing.duration) > 0.12
  )
    throw new ProductionError("VIDEO_VALIDATION_FAILED");
  await run(
    ["-v", "error", "-i", "video.mp4", "-f", "null", "-"],
    dir,
    signal,
    90000,
  );
  return {
    bytes: await readFile(join(dir, "video.mp4")),
    validation: {
      passed: true,
      videoCodec: "h264",
      audioCodec: "aac",
      width: 720,
      height: 1280,
      fps: 24,
      narrationDurationMs: Math.round(timing.duration * 1000),
      videoDurationMs: Math.round(actual * 1000),
      decoded: true,
      maxCaptionLines: 2,
      renderer: "newbert-ass-v1",
    },
  };
}
