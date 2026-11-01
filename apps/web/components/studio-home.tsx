"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { mutate, errorText, type Project, type Page } from "../lib/projects";
import { useWorkspace } from "./workspace";
function HomeVideo({ project }: { project: Project }) {
  const { me } = useWorkspace();
  const [url, setUrl] = useState(""),
    [captions, setCaptions] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => {
    request.current++;
    setUrl("");
    setCaptions("");
    setError("");
    setBusy(false);
    return () => {
      request.current++;
    };
  }, [project.latestOutputArtifactId]);
  async function open() {
    const sequence = ++request.current;
    setBusy(true);
    setError("");
    try {
      const outputs = await api<Page<any>>(
        "/api/v1/projects/" + project.id + "/outputs?limit=1",
      );
      const output = outputs.items[0];
      if (!output)
        throw Error(
          "No validated video is available. Open the project to check its progress.",
        );
      const link = await mutate<{ url: string }>(
        "/api/v1/artifacts/" + output.id + "/access",
        { purpose: "preview" },
        me.csrfToken,
      );
      if (sequence !== request.current) return;
      setUrl(link.url);
      if (output.captionsId) {
        try {
          const c = await mutate<{ url: string }>(
            "/api/v1/artifacts/" + output.captionsId + "/access",
            { purpose: "preview" },
            me.csrfToken,
          );
          const response = await fetch(c.url, {
            credentials: "same-origin",
            cache: "no-store",
          });
          if (!response.ok) throw Error("Saved captions are unavailable.");
          const vtt = await response.text();
          const text = vtt
            .split(/\r?\n\r?\n/)
            .flatMap((block) => {
              const lines = block.split(/\r?\n/),
                at = lines.findIndex((l) => l.includes(" --> "));
              return at < 0 ? [] : [lines.slice(at + 1).join(" ")];
            })
            .join(" ")
            .replaceAll("&lt;", "<")
            .replaceAll("&gt;", ">")
            .replaceAll("&amp;", "&");
          if (sequence === request.current) setCaptions(text);
        } catch {
          if (sequence === request.current)
            setError(
              "The video is available, but captions could not be loaded. Refresh playback to try again.",
            );
        }
      }
    } catch (e) {
      if (sequence === request.current) setError(errorText(e));
    } finally {
      if (sequence === request.current) setBusy(false);
    }
  }
  return (
    <div className="home-video">
      {url && (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          aria-label={project.title + " video"}
          onPlay={(e) =>
            document.querySelectorAll("video").forEach((v) => {
              if (v !== e.currentTarget) v.pause();
            })
          }
          onError={() =>
            setError(
              "The playback link expired or the file is unavailable. Refresh playback to get a new link.",
            )
          }
        />
      )}
      <button
        className={url ? "secondary" : ""}
        disabled={busy}
        onClick={() => void open()}
      >
        {busy ? "Opening…" : url ? "Refresh playback" : "Play video"}
      </button>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {captions && (
        <details className="home-captions">
          <summary>Video captions</summary>
          <p>{captions}</p>
          <button
            className="secondary"
            onClick={() =>
              void navigator.clipboard
                .writeText(captions)
                .then(() => setError(""))
                .catch(() =>
                  setError("Select and copy the caption text manually."),
                )
            }
          >
            Copy captions
          </button>
        </details>
      )}
      <p className="fine">
        Latest successful video · AI voice by ElevenLabs · noncommercial pilot
      </p>
    </div>
  );
}
export function StudioHome() {
  const [items, setItems] = useState<Project[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [status, setStatus] = useState("active"),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const serial = useRef(0),
    nextCursor = useRef<string | null>(null),
    paged = useRef(false);
  const load = useCallback(
    async (reset = true) => {
      const seq = ++serial.current;
      setBusy(true);
      try {
        const page = await api<Page<Project>>(
          "/api/v1/projects?limit=20&status=" +
            status +
            (reset
              ? ""
              : "&cursor=" + encodeURIComponent(nextCursor.current || "")),
        );
        if (seq !== serial.current) return;
        setItems((old) =>
          reset
            ? page.items
            : [
                ...old,
                ...page.items.filter((p) => !old.some((x) => x.id === p.id)),
              ],
        );
        setCursor(page.nextCursor);
        nextCursor.current = page.nextCursor;
        paged.current = !reset;
        setLoaded(true);
        setError("");
      } catch (e) {
        if (seq === serial.current) setError(errorText(e));
      } finally {
        if (seq === serial.current) setBusy(false);
      }
    },
    [status],
  );
  useEffect(() => {
    setItems([]);
    setLoaded(false);
    paged.current = false;
    void load();
    return () => {
      serial.current++;
    };
  }, [load]);
  useEffect(() => {
    let stopped = false;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const seq = serial.current;
      void api<Page<Project>>("/api/v1/projects?limit=20&status=" + status)
        .then((page) => {
          if (stopped || seq !== serial.current) return;
          setItems((old) =>
            paged.current
              ? [
                  ...page.items,
                  ...old.filter((p) => !page.items.some((x) => x.id === p.id)),
                ]
              : page.items,
          );
          if (!paged.current) {
            setCursor(page.nextCursor);
            nextCursor.current = page.nextCursor;
          }
        })
        .catch(() => {});
    }, 10000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [status]);
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <span className="eyebrow">YOUR PERSONAL STUDIO</span>
          <h1>A good idea starts here.</h1>
          <p className="muted">
            Your projects and finished videos, together. Play a video here or
            open its storyboard to continue creating.
          </p>
        </div>
        <Link className="button" href="/app/create">
          ＋ New project
        </Link>
      </div>
      <section
        className="panel studio-steps"
        aria-label="Simple video workflow"
      >
        <span>1 · Enter a topic</span>
        <span>2 · Review Gemini’s storyboard</span>
        <span>3 · Generate voice & video</span>
        <span>4 · Watch it here</span>
      </section>
      <div className="section-heading">
        <h2>Your projects</h2>
        <div className="actions">
          <label>
            Show projects
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void load()}
          >
            Refresh projects
          </button>
          <Link href="/app/settings">Usage & settings</Link>
        </div>
      </div>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {!loaded && busy && <p role="status">Loading your studio…</p>}
      {loaded && !items.length && (
        <section className="panel empty-state">
          <h2>
            {status === "archived"
              ? "No archived projects"
              : "Create your first video"}
          </h2>
          <p>
            Start with a topic. Gemini writes the scene-by-scene narration,
            ElevenLabs creates the voice, and Newbert renders the motion
            graphics.
          </p>
          <Link className="button" href="/app/create">
            Create a project
          </Link>
        </section>
      )}
      <div className="studio-project-grid">
        {[...items]
          .sort(
            (a, b) =>
              Number(!!b.latestOutputArtifactId) -
              Number(!!a.latestOutputArtifactId),
          )
          .map((p) => (
            <article className="panel studio-project" key={p.id}>
              <div className="section-heading">
                <h3>
                  <Link href={"/app/projects/" + p.id}>{p.title}</Link>
                </h3>
                <span className="pill">
                  {p.latestOutputArtifactId
                    ? "Video ready"
                    : "No finished video yet"}
                </span>
              </div>
              {p.latestOutputArtifactId ? (
                <HomeVideo project={p} />
              ) : (
                <p className="muted">
                  Open this project to generate or review its storyboard, then create the voice and video.
                </p>
              )}
              <div className="actions">
                <Link
                  className="button secondary"
                  href={"/app/projects/" + p.id + "/storyboard"}
                >
                  Open storyboard
                </Link>
                <Link href={"/app/projects/" + p.id}>Project details</Link>
                {p.latestOutputArtifactId && (
                  <Link href={"/app/projects/" + p.id + "/preview"}>
                    Download & history
                  </Link>
                )}
              </div>
            </article>
          ))}
      </div>
      {cursor && (
        <button
          disabled={busy}
          className="secondary"
          onClick={() => void load(false)}
        >
          {busy ? "Loading…" : "Load more projects"}
        </button>
      )}
      <p className="fine">
        Finished videos appear automatically while this page is open. Nothing is
        posted to Instagram.
      </p>
    </>
  );
}
