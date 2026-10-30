"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import {
  mutate,
  draftTag,
  errorText,
  type Draft,
  type Page,
} from "../lib/projects";
import { useWorkspace } from "./workspace";
export function Discussion({
  projectId,
  etag,
  disabled,
  onSent,
}: {
  projectId: string;
  etag: string;
  disabled: boolean;
  onSent: () => void;
}) {
  const { me } = useWorkspace();
  const [messages, setMessages] = useState<any[]>([]),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const d = await api<Page<any>>(
        "/api/v1/projects/" + projectId + "/messages?limit=20",
      );
      setMessages(d.items.slice().reverse());
    } catch (e) {
      setError(errorText(e));
    }
  }, [projectId]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [load]);
  return (
    <section className="panel discussion">
      <h3>Explore the idea</h3>
      <p className="fine">
        Optional: discuss an angle before generating a storyboard. Each question
        uses one processing slot and one capped Gemini request.
      </p>
      <div className="discussion-messages" aria-live="polite">
        {messages.map((m) => (
          <article key={m.id} className={"discussion-" + m.role}>
            <span className="tag">
              {m.role === "user" ? "YOU" : "IDEA ASSISTANT"}
            </span>
            <p>{m.content}</p>
          </article>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await mutate(
              "/api/v1/projects/" + projectId + "/messages",
              { content: text },
              me.csrfToken,
              etag,
            );
            setText("");
            await load();
            onSent();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Ask about your topic
          <textarea
            required
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Which angle would make this clear for college students?"
          />
        </label>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        <button className="secondary" disabled={disabled || busy}>
          {busy ? "Sending…" : "Discuss idea"}
        </button>
      </form>
    </section>
  );
}
export function Storyboard({ projectId }: { projectId: string }) {
  const { me } = useWorkspace();
  const prefix = "/api/v1/projects/" + projectId;
  const [saved, setSaved] = useState<any>(null),
    [content, setContent] = useState<any>(null),
    [jobs, setJobs] = useState<any[]>([]),
    [voices, setVoices] = useState<any[]>([]),
    [evidence, setEvidence] = useState<any>({ sources: [], claims: [] }),
    [reviewed, setReviewed] = useState<string[]>([]),
    [terms, setTerms] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const [d, j, v] = await Promise.all([
      api<any>(prefix + "/storyboard"),
      api<Page<any>>("/api/v1/jobs?projectId=" + projectId),
      api<Page<any>>("/api/v1/voices"),
    ]);
    setSaved(d);
    setContent(d.content);
    setJobs(j.items);
    setVoices(v.items);
    setReviewed(d.approval?.reviewed_claim_ids || []);
    setTerms(!!d.approval);
    if (d.planningVersionId) {
      const e = await api<any>(
        "/api/v1/versions/" + d.planningVersionId + "/evidence",
      );
      const ids = new Set(d.content.scenes.map((s: any) => s.id));
      setEvidence({
        ...e,
        claims: e.claims.filter((c: any) => ids.has(c.sceneId)),
      });
    } else setEvidence({ sources: [], claims: [] });
  }, [prefix, projectId]);
  useEffect(() => {
    void load().catch((e) => setError(errorText(e)));
  }, [load]);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const dirty =
    saved && JSON.stringify(content) !== JSON.stringify(saved.content);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", handler);
    return () => removeEventListener("beforeunload", handler);
  }, [dirty]);
  function updateScene(index: number, field: string, value: unknown) {
    setContent((old: any) => ({
      ...old,
      scenes: old.scenes.map((s: any, i: number) =>
        i !== index
          ? s
          : {
              ...s,
              [field]: value,
              ...(field === "spokenNarration"
                ? { displayNarration: value, textMappings: [] }
                : {}),
            },
      ),
    }));
  }
  if (!saved || !content)
    return (
      <>
        <p role={error ? "alert" : "status"}>
          {error || "Loading storyboard…"}
        </p>
        <button
          onClick={() => void load().catch((e) => setError(errorText(e)))}
        >
          Retry
        </button>
      </>
    );
  const completed = jobs.find(
    (j) => j.kind === "plan" && j.state === "succeeded" && j.outputArtifactId,
  );
  return (
    <>
      <Link href={"/app/projects/" + projectId}>← Project brief</Link>
      <div className="page-heading">
        <span className="eyebrow">SHAPE THE EXPLANATION</span>
        <h1>Storyboard review</h1>
        <p className="muted">
          Read the narration. Review sources. Choose your visual rhythm.
        </p>
      </div>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="message success">
          {notice}
        </p>
      )}
      <div className="story-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            if (!dirty || confirm("Discard unsaved storyboard changes?"))
              void act(load);
          }}
        >
          Refresh saved storyboard
        </button>
        {completed && (
          <button
            disabled={busy || dirty}
            onClick={() =>
              void act(async () => {
                await mutate(
                  prefix + "/draft/apply-result",
                  { artifactId: completed.outputArtifactId },
                  me.csrfToken,
                  draftTag(saved),
                );
                await load();
                setNotice(
                  "Generated storyboard applied to the editable draft.",
                );
              })
            }
          >
            Use generated storyboard
          </button>
        )}
      </div>
      {!content.scenes.length ? (
        <section className="empty-state panel">
          <h2>Start with a saved brief.</h2>
          <p>
            Submit a planning request from your project, then refresh this page
            when it completes.
          </p>
          <Link className="button" href={"/app/projects/" + projectId}>
            Open project →
          </Link>
        </section>
      ) : (
        <div className="storyboard-layout">
          <div>
            {content.scenes.map((scene: any, index: number) => (
              <section className="panel scene-editor" key={scene.id}>
                <span className="tag">SCENE {index + 1}</span>
                <div
                  className={"controlled-preview visual-" + scene.component}
                  aria-label={scene.component + " scene preview"}
                >
                  {scene.objects.map((o: any) => (
                    <span
                      key={o.id}
                      style={{ borderColor: o.parameters.color || "#A18BFF" }}
                    >
                      {o.label || o.type}
                    </span>
                  ))}
                </div>
                <label>
                  Scene {index + 1} title
                  <input
                    required
                    maxLength={120}
                    value={scene.title}
                    onChange={(e) =>
                      updateScene(index, "title", e.target.value)
                    }
                  />
                </label>
                <label>
                  Scene {index + 1} narration
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={scene.spokenNarration}
                    onChange={(e) =>
                      updateScene(index, "spokenNarration", e.target.value)
                    }
                  />
                </label>
                <p className="fine">
                  Narration edits require a fresh evidence plan before approval.
                  No audio timing is claimed in this preview.
                </p>
                <label>
                  Scene {index + 1} visual
                  <select
                    value={scene.component}
                    onChange={(e) =>
                      updateScene(index, "component", e.target.value)
                    }
                  >
                    {[
                      "typography",
                      "diagram",
                      "flow",
                      "timeline",
                      "comparison",
                      "relationship",
                      "steps",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                {scene.objects.map((o: any, n: number) => (
                  <label key={o.id}>
                    Visual label {n + 1}
                    <input
                      maxLength={100}
                      value={o.label || ""}
                      onChange={(e) =>
                        updateScene(
                          index,
                          "objects",
                          scene.objects.map((item: any) =>
                            item.id === o.id
                              ? { ...item, label: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </section>
            ))}
          </div>
          <aside>
            <section className="panel">
              <h3>Voice & style</h3>
              <label>
                Voice
                <select
                  aria-label="Voice"
                  value={content.voice?.catalogVoiceId || ""}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      voice: e.target.value
                        ? {
                            catalogVoiceId: e.target.value,
                            providerConnectionId: null,
                          }
                        : null,
                    })
                  }
                >
                  <option value="">Choose a voice</option>
                  {voices.map((v) => (
                    <option key={v.catalogVoiceId} value={v.catalogVoiceId}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="fine">
                Selection only. Speech generation and voice-quality checks
                arrive next. Commercial use permission is unknown; attribution
                may be required.
              </p>
              <a
                href="https://elevenlabs.io/terms-of-use"
                target="_blank"
                rel="noreferrer"
              >
                Read voice provider terms ↗
              </a>
              <label>
                Motion style
                <select
                  aria-label="Motion style"
                  value={content.style.preset}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      style: { ...content.style, preset: e.target.value },
                    })
                  }
                >
                  <option value="black_glow">Black glow</option>
                  <option value="standard">Standard</option>
                </select>
              </label>
              <label>
                Accent color
                <input
                  type="color"
                  value={content.style.accentColor || "#A18BFF"}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      style: { ...content.style, accentColor: e.target.value },
                    })
                  }
                />
              </label>
              <button
                className="full"
                disabled={busy || !dirty}
                onClick={() =>
                  void act(async () => {
                    await mutate<Draft>(
                      prefix + "/draft",
                      { content },
                      me.csrfToken,
                      draftTag(saved),
                      "PATCH",
                    );
                    await load();
                    setNotice(
                      "Storyboard saved. Earlier approval no longer applies.",
                    );
                  })
                }
              >
                Save storyboard
              </button>
            </section>
            <section className="panel evidence-panel">
              <h3>Evidence review</h3>
              <p className="fine">
                Retrieved excerpts are starting points, not verified fact
                checks. Unsupported factual claims block approval. Automatic
                mode keeps these checks.
              </p>
              {evidence.claims.map((claim: any) => (
                <article key={claim.id}>
                  <span className="tag">
                    {claim.classification} · {claim.status.replaceAll("_", " ")}
                  </span>
                  <p>{claim.text}</p>
                  {claim.sourceIds.map((sid: string) => {
                    const s = evidence.sources.find((s: any) => s.id === sid);
                    return s ? (
                      <details key={sid}>
                        <summary>{s.title}</summary>
                        <p>{s.excerpt}</p>
                        <a href={s.url} target="_blank" rel="noreferrer">
                          Read source ↗
                        </a>
                      </details>
                    ) : null;
                  })}
                  {claim.blocking && claim.status !== "unsupported" && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={reviewed.includes(claim.id)}
                        onChange={(e) =>
                          setReviewed((old) =>
                            e.target.checked
                              ? [...old, claim.id]
                              : old.filter((id) => id !== claim.id),
                          )
                        }
                      />
                      I checked that this source supports the explanation.
                    </label>
                  )}
                </article>
              ))}
              <p className="fine">
                Wikipedia excerpts: attribution via linked article, CC BY-SA.
                Review interpretation and examples separately.
              </p>
            </section>
            <section className="panel approval-panel">
              <h3>
                {saved.approval && !dirty
                  ? "Approved snapshot"
                  : "Approve this draft"}
              </h3>
              <p className="fine">
                Approval binds the saved revision, narration, visuals and voice.
                Any later edit requires approval again.
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                />
                I reviewed the storyboard and provider usage terms.
              </label>
              <button
                className="full"
                disabled={
                  busy || dirty || !terms || !content.voice || !!saved.approval
                }
                onClick={() =>
                  void act(async () => {
                    await mutate(
                      prefix + "/storyboard/approve",
                      {
                        reviewedClaimIds: reviewed,
                        acknowledgedVoiceTerms: terms,
                      },
                      me.csrfToken,
                      draftTag(saved),
                    );
                    await load();
                    setNotice(
                      "This exact storyboard revision is approved. Voice generation comes next.",
                    );
                  })
                }
              >
                Approve storyboard
              </button>
              {dirty && (
                <p className="fine">Save your edits before approval.</p>
              )}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
