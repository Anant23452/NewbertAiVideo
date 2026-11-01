import { wrapText } from "../../../../../packages/contracts/src/composition.js";
import { hash } from "../projects/core.js";
import { checkScenes } from "../planning/validation.js";
export class ProductionError extends Error {
  constructor(
    public code: string,
    public uncertain = false,
  ) {
    super(code);
  }
}
export type Manifest = {
  text: string;
  scenes: any[];
  fingerprint: string;
  characters: number;
};
export function speechManifest(
  content: any,
  identity: { voiceId: string; model: string; credentialVersion: string },
): Manifest {
  checkScenes(content);
  const captionEdits = new Map<string, string>();
  const normalized = (text: string) => {
    const word = text.normalize("NFC").toLocaleLowerCase("hi");
    // Decimal/grouping punctuation can change a number's value. Interior
    // punctuation also distinguishes words such as "we're" and "were".
    if (/\p{N}/u.test(word)) return word;
    return word.replace(/^[.,!?।॥“”‘’"'():;]+|[.,!?।॥“”‘’"'():;]+$/gu, "");
  };
  for (const edit of content.captionOverrides) {
    const scene = content.scenes.find((x: any) => x.id === edit.sceneId);
    if (
      !scene ||
      captionEdits.has(edit.sceneId) ||
      edit.spokenSpan.start !== 0 ||
      edit.spokenSpan.end !== [...scene.spokenNarration].length ||
      !edit.displayText.trim()
    )
      throw new ProductionError("INVALID_CAPTION_OVERRIDE");
    const original = scene.displayNarration.trim().split(/\s+/u),
      corrected = edit.displayText.trim().split(/\s+/u);
    if (
      original.length !== corrected.length ||
      original.some(
        (w: string, i: number) => normalized(w) !== normalized(corrected[i]!),
      )
    )
      throw new ProductionError("CAPTION_MEANING_CHANGED");
    for (const word of corrected) wrapText(word, 576, 40, 2);
    captionEdits.set(scene.id, edit.displayText.trim());
  }
  const overrides = content.pronunciationOverrides;
  if (
    overrides.length > 10 ||
    overrides.some(
      (o: any) =>
        !o.displayText.trim() ||
        !o.spokenText.trim() ||
        /[\r\n]/.test(o.spokenText),
    )
  )
    throw new ProductionError("INVALID_PRONUNCIATION");
  const seen = new Set();
  for (const o of overrides) {
    if (seen.has(o.displayText))
      throw new ProductionError("AMBIGUOUS_PRONUNCIATION");
    seen.add(o.displayText);
  }
  let offset = 0;
  const scenes = content.scenes.map((scene: any, index: number) => {
    for (const word of scene.displayNarration.split(/\s+/u))
      wrapText(word, 576, 40, 2);
    const original = [...scene.spokenNarration],
      display = [...scene.displayNarration];
    let ranges = original.map((_: string, i: number) => [i, i + 1]);
    if (scene.displayNarration !== scene.spokenNarration) {
      let sp = 0,
        dp = 0;
      for (const m of scene.textMappings) {
        if (m.spokenSpan.start !== sp || m.displaySpan.start !== dp)
          throw new ProductionError("INCOMPLETE_TEXT_MAPPING");
        sp = m.spokenSpan.end;
        dp = m.displaySpan.end;
      }
      if (sp !== original.length || dp !== display.length)
        throw new ProductionError("INCOMPLETE_TEXT_MAPPING");
      ranges = original.map((_: string, i: number) => {
        const m = scene.textMappings.find(
          (m: any) => i >= m.spokenSpan.start && i < m.spokenSpan.end,
        );
        return [m.displaySpan.start, m.displaySpan.end];
      });
    }
    const chars: string[] = [],
      map: any[] = [];
    for (let i = 0; i < original.length; ) {
      const o = overrides
        .slice()
        .sort((a: any, b: any) => b.displayText.length - a.displayText.length)
        .find(
          (o: any) =>
            original.slice(i, i + [...o.displayText].length).join("") ===
            o.displayText,
        );
      const n = o ? [...o.displayText].length : 1;
      const replacement = o ? [...o.spokenText] : [original[i]!];
      for (const ch of replacement) {
        chars.push(ch);
        map.push({
          displayStart: ranges[i]![0],
          displayEnd: ranges[i + n - 1]![1],
          originStart: i,
          originEnd: i + n,
        });
      }
      i += n;
    }
    const spoken = chars.join("");
    const result = {
      ...scene,
      captionDisplay: captionEdits.get(scene.id),
      spoken,
      offset,
      map,
    };
    offset += chars.length + (index < content.scenes.length - 1 ? 2 : 0);
    return result;
  });
  const text = scenes.map((s: any) => s.spoken).join("\n\n");
  return {
    text,
    scenes,
    characters: text.length,
    fingerprint: hash({
      text,
      voiceId: identity.voiceId,
      model: identity.model,
      credentialVersion: identity.credentialVersion,
      normalization: "off",
      settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  };
}
export function align(manifest: Manifest, alignment: any, duration: number) {
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !alignment ||
    !Array.isArray(alignment.characters) ||
    alignment.characters.join("") !== manifest.text
  )
    throw new ProductionError("ALIGNMENT_MISMATCH");
  const s = alignment.character_start_times_seconds,
    e = alignment.character_end_times_seconds;
  if (
    !Array.isArray(s) ||
    !Array.isArray(e) ||
    s.length !== alignment.characters.length ||
    e.length !== s.length
  )
    throw new ProductionError("ALIGNMENT_INCOMPLETE");
  const utfStarts: number[] = [],
    utfEnds: number[] = [];
  let previousS = 0,
    previousE = 0;
  for (let i = 0; i < s.length; i++) {
    if (
      !Number.isFinite(s[i]) ||
      !Number.isFinite(e[i]) ||
      s[i] < previousS ||
      e[i] < previousE ||
      e[i] < s[i] ||
      e[i] > duration + 0.08
    )
      throw new ProductionError("ALIGNMENT_INVALID");
    previousS = s[i];
    previousE = e[i];
    for (let j = 0; j < alignment.characters[i].length; j++) {
      utfStarts.push(s[i]);
      utfEnds.push(e[i]);
    }
  }
  const starts: number[] = [],
    ends: number[] = [];
  let unit = 0;
  for (const cp of [...manifest.text]) {
    starts.push(utfStarts[unit]!);
    ends.push(utfEnds[unit + cp.length - 1]!);
    unit += cp.length;
  }
  if ((ends.at(-1) ?? 0) < duration - 2)
    throw new ProductionError("ALIGNMENT_ENDING_UNCOVERED");
  const timeline = manifest.scenes.map((scene: any, index: number) => {
    const start = index === 0 ? 0 : starts[scene.offset]!;
    const end =
      index + 1 < manifest.scenes.length
        ? starts[manifest.scenes[index + 1]!.offset]!
        : duration;
    if (end <= start) throw new ProductionError("INVALID_SCENE_TIMING");
    const words = [...scene.displayNarration.matchAll(/\S+/gu)].map(
      (m: any) => ({
        text: m[0],
        start: [...scene.displayNarration.slice(0, m.index)].length,
        end: [...scene.displayNarration.slice(0, m.index + m[0].length)].length,
      }),
    );
    const spanTime = (from: number, to: number, kind: "display" | "origin") => {
      const indices = scene.map
        .map((m: any, i: number) => ({ m, i }))
        .filter(
          ({ m }: any) => m[kind + "Start"] < to && m[kind + "End"] > from,
        )
        .map(({ i }: any) => i);
      if (!indices.length) throw new ProductionError("UNMAPPED_SPAN");
      return {
        start: starts[scene.offset + indices[0]]!,
        end: ends[scene.offset + indices.at(-1)]!,
      };
    };
    if (scene.captionDisplay) {
      const corrected = scene.captionDisplay.split(/\s+/u);
      words.forEach((word: any, i: number) => {
        word.text = corrected[i];
      });
    }
    const captions: any[] = [];
    for (let i = 0; i < words.length; ) {
      const group = [words[i++]];
      while (i < words.length && group.length < 4) {
        const candidate = [...group, words[i]!];
        try {
          wrapText(candidate.map((w) => w!.text).join(" "), 576, 40, 2);
        } catch {
          break;
        }
        group.push(words[i++]!);
      }
      const t = spanTime(group[0]!.start, group.at(-1)!.end, "display");
      captions.push({
        text: group.map((w) => w!.text).join(" "),
        start: Math.max(start, t.start),
        end: Math.min(end, t.end),
        displaySpan: { start: group[0]!.start, end: group.at(-1)!.end },
        words: group.map((w) => ({
          text: w!.text,
          ...spanTime(w!.start, w!.end, "display"),
        })),
      });
    }
    for (let i = 0; i < captions.length; i++) {
      const cap = captions[i];
      if (i + 1 < captions.length)
        cap.end = Math.min(cap.end, captions[i + 1].start);
      for (let w = 0; w < cap.words.length; w++) {
        const word = cap.words[w];
        word.start = Math.max(cap.start, word.start);
        word.end = Math.min(
          cap.end,
          word.end,
          w + 1 < cap.words.length ? cap.words[w + 1].start : cap.end,
        );
      }
      if (cap.end <= cap.start)
        throw new ProductionError("CAPTION_ALIGNMENT_AMBIGUOUS");
    }
    const timedCues = scene.cues.map((c: any) => {
      const t = spanTime(c.spokenSpan.start, c.spokenSpan.end, "origin");
      return {
        ...c,
        start: Math.max(start, Math.min(end, t.start + c.leadMs / 1000)),
        end: Math.min(end, t.end),
      };
    });
    // Derive emphasis only from exact label words present in the approved spoken
    // text. Never guess a translation or invent an audio anchor.
    for (const object of scene.objects) {
      if (
        timedCues.some(
          (c: any) => c.objectId === object.id && c.event === "highlight",
        )
      )
        continue;
      const terms = String(object.label || "")
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 3)
        .sort((a, b) => b.length - a.length);
      const spoken = scene.spokenNarration.toLocaleLowerCase("hi");
      for (const term of terms) {
        const at = spoken.indexOf(term.toLocaleLowerCase("hi"));
        if (at < 0) continue;
        const from = [...scene.spokenNarration.slice(0, at)].length,
          to = from + [...term].length;
        const t = spanTime(from, to, "origin");
        timedCues.push({
          id: object.id,
          objectId: object.id,
          event: "highlight",
          spokenSpan: { start: from, end: to },
          leadMs: 0,
          start: t.start,
          end: t.end,
        });
        break;
      }
    }
    return { ...scene, start, end, captions, timedCues };
  });
  return {
    duration,
    timeline,
    script: manifest.text,
    fingerprint: manifest.fingerprint,
  };
}
