import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { contractSchema } from "../../../../../packages/contracts/src/schema.js";
import { DomainError } from "../projects/core.js";
// Use the same installed JSON validator as Fastify; validate model output again locally.
const require = createRequire(import.meta.url);
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const ajv = new Ajv({ strict: false, allErrors: false });
addFormats(ajv);
ajv.addSchema(contractSchema);
export const validContent = ajv.compile({
  $ref: "https://newbert.local/contract#/definitions/DraftContent",
});
export type Source = {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  retrievedAt: string;
};
export type Claim = {
  id: string;
  sceneId: string;
  text: string;
  classification: "factual" | "interpretation" | "illustrative";
  status: "needs_review" | "unsupported";
  blocking: boolean;
  sourceIds: string[];
  quote: string;
};
export function checkScenes(content: any) {
  if (
    !validContent(content) ||
    !Array.isArray(content.scenes) ||
    content.scenes.length < 1 ||
    content.scenes.length > 12
  )
    throw new DomainError(
      422,
      "INVALID_STORYBOARD",
      "Provide 1–12 valid scenes.",
    );
  const ids = new Set<string>();
  let total = 0;
  for (const scene of content.scenes) {
    if(!['typography','diagram','flow','timeline','comparison','relationship','steps'].includes(scene.component))throw new DomainError(422,'UNSUPPORTED_COMPONENT','Choose a supported controlled visual component. Charts require a later validated data adapter.');
    if (ids.has(scene.id))
      throw new DomainError(
        422,
        "DUPLICATE_SCENE",
        "Scene IDs must be unique.",
      );
    ids.add(scene.id);
    const spoken = [...scene.spokenNarration].length;
    total += spoken;
    if (
      !scene.title.trim() ||
      !scene.purpose.trim() ||
      spoken < 5 ||
      !scene.displayNarration.trim()
    )
      throw new DomainError(
        422,
        "EMPTY_SCENE",
        "Each scene needs a title, purpose and narration.",
      );
    const objects = new Set(scene.objects.map((o: any) => o.id));
    if (objects.size !== scene.objects.length)
      throw new DomainError(
        422,
        "DUPLICATE_OBJECT",
        "Scene object IDs must be unique.",
      );
    for (const o of scene.objects) {
      if (
        Object.keys(o.parameters).some(
          (k) => !["color", "shape"].includes(k),
        ) ||
        (o.parameters.color && !/^#[a-f0-9]{6}$/i.test(o.parameters.color)) ||
        (o.parameters.shape &&
          !["circle", "rectangle", "line"].includes(o.parameters.shape))
      )
        throw new DomainError(
          422,
          "UNSAFE_VISUAL",
          "Only controlled shape and color parameters are supported.",
        );
    }
    for (const cue of scene.cues)
      if (
        !objects.has(cue.objectId) ||
        cue.spokenSpan.start >= cue.spokenSpan.end ||
        cue.spokenSpan.end > spoken
      )
        throw new DomainError(
          422,
          "INVALID_CUE",
          "Cues must reference an object and a valid Unicode spoken span.",
        );
    if (
      scene.displayNarration !== scene.spokenNarration &&
      scene.textMappings.length === 0
    )
      throw new DomainError(
        422,
        "MAPPING_REQUIRED",
        "Changed display text needs explicit spoken-text mappings.",
      );
    for (const m of scene.textMappings)
      if (
        m.spokenSpan.start >= m.spokenSpan.end ||
        m.spokenSpan.end > spoken ||
        m.displaySpan.start >= m.displaySpan.end ||
        m.displaySpan.end > [...scene.displayNarration].length
      )
        throw new DomainError(
          422,
          "INVALID_MAPPING",
          "Text mapping is outside its narration.",
        );
  }
  if (total > 6000)
    throw new DomainError(
      422,
      "SCRIPT_TOO_LONG",
      "Keep the total narration under 6000 Unicode characters.",
    );
  return content;
}
export function buildPlan(value: any, base: any, sources: Source[]) {
  if (
    !value ||
    !Array.isArray(value.scenes) ||
    value.scenes.length < 2 ||
    value.scenes.length > 8
  )
    throw new DomainError(
      422,
      "INVALID_MODEL_OUTPUT",
      "The script provider returned an invalid storyboard.",
    );
  const claims: Claim[] = [];
  const scenes = value.scenes.map((s: any) => {
    if (
      typeof s.title !== "string" ||
      typeof s.narration !== "string" ||
      !Array.isArray(s.claims) ||
      !s.claims.length ||
      !Array.isArray(s.labels) ||
      s.labels.length < 1 ||
      s.labels.length > 6
    )
      throw new DomainError(
        422,
        "INVALID_MODEL_OUTPUT",
        "Every scene needs narration, visual labels and classified claims.",
      );
    const sceneId = randomUUID();
    const claimIds = s.claims.map((c: any) => {
      if (
        typeof c.text !== "string" ||
        c.text.length < 3 ||
        c.text.length > 2000 ||
        !["factual", "interpretation", "illustrative"].includes(
          c.classification,
        )
      )
        throw new DomainError(
          422,
          "INVALID_CLAIM",
          "The provider returned invalid claim metadata.",
        );
      const source = sources[c.sourceIndex];
      const quote = typeof c.quote === "string" ? c.quote : "";
      const supported =
        source &&
        quote.length >= 20 &&
        quote.length <= 300 &&
        source.excerpt.includes(quote);
      const claim: Claim = {
        id: randomUUID(),
        sceneId,
        text: c.text,
        classification: c.classification,
        status:
          c.classification === "factual" && !supported
            ? "unsupported"
            : "needs_review",
        blocking: c.classification === "factual",
        sourceIds: supported ? [source.id] : [],
        quote: supported ? quote : "",
      };
      claims.push(claim);
      return claim.id;
    });
    const objects = s.labels.map((label: unknown) => {
      if (typeof label !== "string" || !label.trim() || label.length > 100)
        throw new DomainError(
          422,
          "INVALID_VISUAL",
          "Visual labels must be short text.",
        );
      return {
        id: randomUUID(),
        type: "node",
        label,
        parameters: {
          shape: "circle",
          color: base.style.accentColor || "#A18BFF",
        },
      };
    });
    return {
      id: sceneId,
      purpose: String(s.purpose || s.title).slice(0, 300),
      component: [
        "typography",
        "diagram",
        "flow",
        "timeline",
        "comparison",
        "relationship",
        "steps",
      ].includes(s.component)
        ? s.component
        : "diagram",
      title: s.title,
      displayNarration: s.narration,
      spokenNarration: s.narration,
      textMappings: [],
      objects,
      cues: objects.map((o: any) => ({
        id: randomUUID(),
        objectId: o.id,
        spokenSpan: { start: 0, end: [...s.narration].length },
        event: "enter",
        leadMs: 0,
      })),
      claimIds,
      illustrative: s.claims.some(
        (c: any) => c.classification === "illustrative",
      ),
    };
  });
  const content = checkScenes({ ...base, scenes });
  return {
    content,
    sources,
    claims,
    reviewNotes:
      "Source quotations were matched to retrieved excerpts. Factual paraphrases still require review; this is not an automated fact-check.",
  };
}
