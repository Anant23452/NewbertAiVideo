"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import {
  draftTag,
  errorText,
  mutate,
  type Draft,
  type Page,
  type Version,
} from "../lib/projects";
import { useWorkspace } from "./workspace";
type Output = {
  id: string;
  versionId: string;
  versionNumber: number;
  jobId: string;
  durationMs: number;
  bytes: number;
  createdAt: string;
  captionsId: string | null;
  latestGood: boolean;
};
type Outputs = Page<Output> & { latestOutputArtifactId: string | null };
export function OutputHistory({ projectId }: { projectId: string }) {
  const { me } = useWorkspace();
  const prefix = "/api/v1/projects/" + projectId;
  const [outputs, setOutputs] = useState<Output[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [versions, setVersions] = useState<Version[]>([]),
    [versionCursor, setVersionCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<Output | null>(null),
    [snapshot, setSnapshot] = useState<Version | null>(null),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loaded, setLoaded] = useState(false);
  const selection = useRef(0);
  const load = useCallback(async () => {
    try {
      const [o, v] = await Promise.all([
        api<Outputs>(prefix + "/outputs"),
        api<Page<Version>>(prefix + "/versions"),
      ]);
      setOutputs(o.items);
      setCursor(o.nextCursor);
      setVersions(v.items);
      setVersionCursor(v.nextCursor);
      setLoaded(true);
    } catch (e) {
      setError(errorText(e));
    }
  }, [prefix]);
  useEffect(() => {
    void load();
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
  async function access(id: string, purpose: "preview" | "download") {
    return mutate<{ url: string }>(
      "/api/v1/artifacts/" + id + "/access",
      { purpose },
      me.csrfToken,
    );
  }
  async function open(o: Output) {
    const current = ++selection.current;
    setSelected(o);
    setUrl("");
    setSnapshot(null);
    const [link, v] = await Promise.all([
      access(o.id, "preview"),
      api<Version>("/api/v1/versions/" + o.versionId),
    ]);
    if (current !== selection.current) return;
    setSnapshot(v);
    setUrl(link.url);
  }
  async function download(id: string) {
    const link = await access(id, "download");
    const a = document.createElement("a");
    a.href = link.url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  async function restore(v: Version) {
    const d = await api<Draft>(prefix + "/draft");
    await mutate(
      "/api/v1/versions/" + v.id + "/restore",
      { acknowledgedDraftReplacement: true },
      me.csrfToken,
      draftTag(d),
    );
    setNotice(
      "Version " +
        v.number +
        " copied to the editable draft. Review and approve it before generating. Existing videos remain saved.",
    );
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">SAVED VIDEOS</span>
        <h1>Preview & history</h1>
        <p className="muted">
          Choose an exact version to watch or download. Your last successful
          video stays available during revisions.
        </p>
        <div className="actions">
          <Link
            className="button"
            href={prefix.replace("/api/v1", "/app") + "/storyboard"}
          >
            Edit storyboard
          </Link>
          <Link
            className="secondary button"
            href={"/app/projects/" + projectId}
          >
            Project
          </Link>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void act(load)}
          >
            Refresh history
          </button>
        </div>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      <div className="output-history-layout">
        <section className="panel">
          <h2>Finished videos</h2>
          {!loaded && !error && <p role="status">Loading saved videos…</p>}
          {loaded && !outputs.length && (
            <p>
              No finished videos yet. Approve a storyboard and generate your
              first video.
            </p>
          )}
          <div className="output-list">
            {outputs.map((o) => (
              <button
                className={
                  "secondary output-item" +
                  (selected?.id === o.id ? " selected" : "")
                }
                key={o.id}
                disabled={busy}
                aria-pressed={selected?.id === o.id}
                onClick={() => void act(() => open(o))}
              >
                <strong>
                  Version {o.versionNumber}
                  {o.latestGood ? " · Latest successful" : ""}
                </strong>
                <span>
                  {(o.durationMs / 1000).toFixed(1)} sec ·{" "}
                  {(o.bytes / 1048576).toFixed(1)} MB
                </span>
                <small>{new Date(o.createdAt).toLocaleString("en-IN")}</small>
              </button>
            ))}
          </div>
          {cursor && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const p = await api<Outputs>(
                    prefix + "/outputs?cursor=" + encodeURIComponent(cursor),
                  );
                  setOutputs((x) => [...x, ...p.items]);
                  setCursor(p.nextCursor);
                })
              }
            >
              Load more videos
            </button>
          )}
        </section>
        <section className="panel output-preview">
          <h2>
            {selected ? "Version " + selected.versionNumber : "Select a video"}
          </h2>
          {selected && (
            <>
              <p className="fine">
                Exact saved output ·{" "}
                {selected.latestGood
                  ? "Latest successful video"
                  : "Earlier output"}
              </p>
              {url && (
                <video
                  key={selected.id + url}
                  src={url}
                  controls
                  preload="metadata"
                  playsInline
                  aria-label={"Version " + selected.versionNumber + " video"}
                  onError={() =>
                    setError(
                      "Playback link expired or media is unavailable. Refresh the playback link; this does not regenerate the video.",
                    )
                  }
                />
              )}
              <div className="actions">
                <button
                  disabled={busy}
                  className="secondary"
                  onClick={() => void act(() => open(selected))}
                >
                  Refresh playback link
                </button>
                <button
                  disabled={busy}
                  onClick={() => void act(() => download(selected.id))}
                >
                  Download MP4
                </button>
                {selected.captionsId && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(() => download(selected.captionsId!))
                    }
                  >
                    Download captions (VTT)
                  </button>
                )}
              </div>
              <p className="fine">
                Free-plan narration: noncommercial use only; include attribution
                to ElevenLabs when sharing.
              </p>
              {snapshot && (
                <details>
                  <summary>Storyboard used for this video</summary>
                  {(snapshot.content.scenes as any[]).map((s, i) => (
                    <article key={s.id}>
                      <h3>
                        Scene {i + 1}: {s.title}
                      </h3>
                      <p>{s.spokenNarration}</p>
                    </article>
                  ))}
                </details>
              )}
            </>
          )}
        </section>
      </div>
      <section className="panel">
        <h2>Start a revision from a saved version</h2>
        <p className="muted">
          Copy a snapshot into the editable draft. Review it before generating.
          Matching narration can be reused for visual or caption presentation
          changes; changed speech or voice needs a new request.
        </p>
        <div className="output-list">
          {versions.map((v) => (
            <div className="output-item" key={v.id}>
              <strong>Version {v.number}</strong>
              <span>{v.content.brief.topic}</span>
              <details>
                <summary>Review draft replacement</summary>
                <p>
                  This replaces the currently saved draft with version{" "}
                  {v.number}. Save any unsaved edits in other tabs first.
                  Approval must be renewed; previous videos are kept.
                </p>
                <button
                  disabled={busy}
                  className="secondary"
                  onClick={() => void act(() => restore(v))}
                >
                  Use version {v.number} as draft
                </button>
              </details>
            </div>
          ))}
        </div>
        {versionCursor && (
          <button
            disabled={busy}
            className="secondary"
            onClick={() =>
              void act(async () => {
                const p = await api<Page<Version>>(
                  prefix +
                    "/versions?cursor=" +
                    encodeURIComponent(versionCursor),
                );
                setVersions((x) => [...x, ...p.items]);
                setVersionCursor(p.nextCursor);
              })
            }
          >
            Load more snapshots
          </button>
        )}
      </section>
    </>
  );
}
