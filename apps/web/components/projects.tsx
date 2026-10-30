"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../lib/api";
import {
  mutate,
  errorText,
  projectTag,
  draftTag,
  jobTag,
  type Brief,
  type Project,
  type Page,
  type Draft,
  type Version,
  type Job,
  type Usage,
} from "../lib/projects";
import { useWorkspace } from "./workspace";
import { Discussion } from "./storyboard";

function ErrorMessage({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="message error">
      {text}
    </p>
  ) : null;
}
function ProjectCards({ items }: { items: Project[] }) {
  return (
    <div className="project-grid">
      {items.map((p) => (
        <Link
          key={p.id}
          className="panel project-card"
          href={"/app/projects/" + p.id}
        >
          <div className="project-art" aria-hidden="true">
            <span>✦</span>
            <i />
          </div>
          <div className="project-card-body">
            <span className="tag">
              {p.status === "archived" ? "ARCHIVED" : "DRAFT PROJECT"}
            </span>
            <h3>{p.title}</h3>
            <div className="project-card-foot">
              <span>
                Updated{" "}
                {new Date(p.updatedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
              <span>Open →</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
export function UsageCard({ usage }: { usage: Usage | null }) {
  const r = usage?.resources.find((r) => r.resource === "generation_count");
  const planning = usage?.resources.find(
    (r) => r.resource === "provider_credits",
  );
  if (!r) return null;
  return (
    <section className="panel allowance">
      <div>
        <span className="tag">LOCAL PILOT ALLOWANCE</span>
        <h3>
          {r.remaining} of {r.limit} processing slots available
        </h3>
        <p>
          {r.used} completed · {r.reserved} reserved
          {r.resetsAt
            ? " · Daily reset at " +
              new Date(r.resetsAt).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              }) +
              " (UTC midnight)"
            : ""}
        </p>
      </div>
      {planning && (
        <p className="fine">
          Gemini requests: {planning.used}/{planning.limit} today · account
          quota applies
        </p>
      )}
      <span className="pill">
        {usage?.platformCapacity === "paused"
          ? "Processing paused"
          : "Limited pilot"}
      </span>
    </section>
  );
}
export function ProjectLibrary() {
  const sequence = useRef(0);
  const [items, setItems] = useState<Project[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [status, setStatus] = useState("active"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(
    async (next?: string) => {
      const request = ++sequence.current;
      setBusy(true);
      setError("");
      try {
        const d = await api<Page<Project>>(
          "/api/v1/projects?" +
            new URLSearchParams({
              status,
              search: query,
              limit: "12",
              ...(next ? { cursor: next } : {}),
            }),
        );
        if (request !== sequence.current) return;
        setItems((old) => (next ? [...old, ...d.items] : d.items));
        setCursor(d.nextCursor);
      } catch (e) {
        if (request === sequence.current) setError(errorText(e));
      } finally {
        if (request === sequence.current) setBusy(false);
      }
    },
    [status, query],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <span className="eyebrow">YOUR IDEAS, IN ONE PLACE</span>
          <h1>Projects</h1>
          <p className="muted">Keep each explanation in its own project.</p>
        </div>
        <Link className="button" href="/app/create">
          ＋ New project
        </Link>
      </div>
      <div className="library-toolbar">
        <div className="tabs" role="group" aria-label="Project status">
          {["active", "archived"].map((s) => (
            <button
              key={s}
              className={status === s ? "selected" : "secondary"}
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
            >
              {s === "active" ? "Active" : "Archived"}
            </button>
          ))}
        </div>
        <form
          className="search-form"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
          }}
        >
          <input
            aria-label="Search projects"
            placeholder="Find an idea…"
            value={search}
            maxLength={160}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="secondary">Search</button>
        </form>
      </div>
      <ErrorMessage text={error} />
      {busy && !items.length ? (
        <p role="status">Loading your projects…</p>
      ) : !items.length && !error ? (
        <section className="empty-state panel">
          <div className="empty-symbol">▧</div>
          <h2>
            {query
              ? "No matching projects."
              : status === "archived"
                ? "Nothing archived yet."
                : "Your next explanation starts here."}
          </h2>
          <p>
            {status === "active"
              ? "Save a topic, choose your audience and shape the brief."
              : "Archived projects stay available to restore."}
          </p>
          {status === "active" && (
            <Link className="button" href="/app/create">
              Create your first project ↗
            </Link>
          )}
        </section>
      ) : (
        <ProjectCards items={items} />
      )}
      <div className="list-actions">
        {error && (
          <button className="secondary" onClick={() => void load()}>
            Try again
          </button>
        )}
        {cursor && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void load(cursor)}
          >
            {busy ? "Loading…" : "Load more projects"}
          </button>
        )}
      </div>
    </>
  );
}
function BriefFields({
  value,
  onChange,
}: {
  value: Brief;
  onChange: (brief: Brief) => void;
}) {
  return (
    <>
      <label htmlFor="brief-topic">What do you want to explain?</label>
      <textarea
        id="brief-topic"
        rows={5}
        required
        minLength={5}
        maxLength={1000}
        value={value.topic}
        onChange={(e) => onChange({ ...value, topic: e.target.value })}
        placeholder="Why does it feel like everyone is watching us?"
      />
      <p className="fine">
        {value.topic.length}/1000 characters · Be specific about the question
        you want to answer.
      </p>
      <div className="form-grid">
        <label>
          Narration language
          <select
            value={value.language}
            onChange={(e) =>
              onChange({
                ...value,
                language: e.target.value as Brief["language"],
              })
            }
          >
            <option>Hinglish</option>
            <option>Hindi</option>
          </select>
        </label>
        <label>
          Audience
          <select
            value={value.audience}
            onChange={(e) =>
              onChange({
                ...value,
                audience: e.target.value as Brief["audience"],
              })
            }
          >
            <option value="college">College students</option>
            <option value="school">School students</option>
            <option value="curious">Curious minds</option>
          </select>
        </label>
        <label>
          Workflow
          <select
            value={value.mode}
            onChange={(e) =>
              onChange({ ...value, mode: e.target.value as Brief["mode"] })
            }
          >
            <option value="guided">Guided review</option>
            <option value="automatic">Automatic, with quality checks</option>
          </select>
        </label>
        <label>
          Preferred length (optional)
          <input
            type="number"
            min={5}
            max={600}
            placeholder="Set by narration"
            value={value.targetSeconds ?? ""}
            onChange={(e) => {
              const { targetSeconds: _, ...rest } = value;
              onChange(
                e.target.value
                  ? { ...rest, targetSeconds: Number(e.target.value) }
                  : rest,
              );
            }}
          />
        </label>
      </div>
      <p className="fine">
        Preferred length guides the explanation. Final video length will follow
        the actual narration and processing limits.
      </p>
    </>
  );
}
export function CreateProject() {
  const { me } = useWorkspace();
  const router = useRouter();
  const [title, setTitle] = useState(""),
    [brief, setBrief] = useState<Brief>({
      topic: "",
      language: "Hinglish",
      audience: "college",
      mode: "guided",
    }),
    [preset, setPreset] = useState("black_glow"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem("newbert-topic") || "null");
      if (d && typeof d.topic === "string")
        setBrief((old) => ({
          ...old,
          topic: d.topic,
          language: d.language === "Hindi" ? "Hindi" : "Hinglish",
        }));
    } catch {}
  }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const p = await mutate<Project>(
        "/api/v1/projects",
        { title: title.trim(), brief, style: { preset } },
        me.csrfToken,
      );
      sessionStorage.removeItem("newbert-topic");
      router.push("/app/projects/" + p.id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">START WITH CURIOSITY</span>
        <h1>Create a project</h1>
        <p className="muted">
          Save the idea first. Build the explanation from there.
        </p>
      </div>
      <form onSubmit={create} className="creation-layout">
        <section className="panel editor-panel">
          <label>
            Project title
            <input
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The spotlight effect"
            />
          </label>
          <div className="field-divider" />
          <BriefFields value={brief} onChange={setBrief} />
          <label>
            Motion style
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              <option value="black_glow">Black glow · Violet & mint</option>
              <option value="standard">Standard · Clean diagrams</option>
            </select>
          </label>
          <ErrorMessage text={error} />
          <div className="editor-actions">
            <Link href="/app/projects">Cancel</Link>
            <button disabled={busy}>
              {busy ? "Saving…" : "Save project →"}
            </button>
          </div>
        </section>
        <aside className="panel creation-note">
          <span className="tag">A CLEAR FIRST STEP</span>
          <div className="empty-symbol">✦</div>
          <h3>Every explanation begins with a good brief.</h3>
          <p>
            Your project and draft will be saved privately. You can edit them
            whenever you like.
          </p>
          <div className="field-divider" />
          <p>
            Planning retrieves sources and generates scripts. Storyboard review
            is available; voice generation and rendering come next.
          </p>
          <span className="pill">No provider calls on save</span>
        </aside>
      </form>
    </>
  );
}
export function ProjectEditor({ projectId }: { projectId: string }) {
  const { me } = useWorkspace();
  const [project, setProject] = useState<Project | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [brief, setBrief] = useState<Brief | null>(null),
    [title, setTitle] = useState(""),
    [versions, setVersions] = useState<Version[]>([]),
    [versionCursor, setVersionCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<Version | null>(null),
    [jobs, setJobs] = useState<Job[]>([]),
    [usage, setUsage] = useState<Usage | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [loaded, setLoaded] = useState(false);
  const prefix = "/api/v1/projects/" + projectId;
  const load = useCallback(async () => {
    setError("");
    try {
      const [p, d, v] = await Promise.all([
        api<Project>(prefix),
        api<Draft>(prefix + "/draft"),
        api<Page<Version>>(prefix + "/versions"),
      ]);
      setProject(p);
      setDraft(d);
      setBrief(d.content.brief);
      setTitle(p.title);
      setVersions(v.items);
      setVersionCursor(v.nextCursor);
      setLoaded(true);
    } catch (e) {
      setError(errorText(e));
    }
  }, [prefix]);
  const progress = useCallback(async () => {
    try {
      const [j, u] = await Promise.all([
        api<Page<Job>>("/api/v1/jobs?projectId=" + projectId),
        api<Usage>("/api/v1/usage"),
      ]);
      setJobs(j.items);
      setUsage(u);
    } catch (e) {
      setError(errorText(e));
    }
  }, [projectId]);
  useEffect(() => {
    void load();
    void progress();
    const timer = setInterval(() => void progress(), 3000);
    return () => clearInterval(timer);
  }, [load, progress]);
  const dirty =
    !!draft &&
    !!brief &&
    JSON.stringify(brief) !== JSON.stringify(draft.content.brief);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 412
          ? "This project changed in another tab. Your edits remain here. Use “Reload saved draft” to review the latest version."
          : errorText(e),
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !brief) return;
    await action(async () => {
      const content = {
        ...draft.content,
        brief,
        scenes: [],
        pronunciationOverrides: [],
        captionOverrides: [],
      };
      const d = await mutate<Draft>(
        prefix + "/draft",
        { content },
        me.csrfToken,
        draftTag(draft),
        "PATCH",
      );
      setDraft(d);
      setBrief(d.content.brief);
      const p = await api<Project>(prefix);
      setProject(p);
      setNotice("Draft saved. Submitted versions remain unchanged.");
    });
  }
  async function submit() {
    if (!draft) return;
    await action(async () => {
      await mutate<Job>(
        prefix + "/jobs",
        { kind: "plan", acknowledgedUsageTerms: consent },
        me.csrfToken,
        draftTag(draft),
      );
      setConsent(false);
      await load();
      await progress();
      setNotice(
        "Planning request queued. Open storyboard review after it completes.",
      );
    });
  }
  async function jobAction(j: Job, kind: "cancel" | "resume") {
    await action(async () => {
      await mutate(
        "/api/v1/jobs/" + j.id + "/" + kind,
        {},
        me.csrfToken,
        jobTag(j),
      );
      await progress();
      setNotice(
        kind === "cancel"
          ? "Cancellation requested. Unused reservations are released when cancellation completes."
          : "Request returned to the queue.",
      );
    });
  }
  async function moreVersions() {
    await action(async () => {
      const v = await api<Page<Version>>(
        prefix + "/versions?cursor=" + encodeURIComponent(versionCursor!),
      );
      setVersions((old) => [...old, ...v.items]);
      setVersionCursor(v.nextCursor);
    });
  }
  if (!project || !draft || !brief)
    return (
      <>
        <ErrorMessage text={error} />
        {error ? (
          <button onClick={() => void load()}>Try again</button>
        ) : (
          <p role="status">Loading your project…</p>
        )}
        <p>
          <Link href="/app/projects">← Projects</Link>
        </p>
      </>
    );
  const activeJob = jobs.find((j) =>
    ["queued", "running", "paused"].includes(j.state),
  );
  return (
    <>
      <Link className="back" href="/app/projects">
        ← All projects
      </Link>
      <div className="page-heading heading-with-action">
        <div>
          <span className="eyebrow">
            {project.status === "archived"
              ? "ARCHIVED PROJECT"
              : "YOUR EXPLANATION"}
          </span>
          <h1>{project.title}</h1>
          <p className="muted">
            {dirty ? "Unsaved brief changes" : "Saved draft"} · Revision{" "}
            {draft.revision}
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const p = await mutate<Project>(
                prefix,
                { status: project.status === "active" ? "archived" : "active" },
                me.csrfToken,
                projectTag(project),
                "PATCH",
              );
              setProject(p);
              setNotice(
                p.status === "archived"
                  ? "Project archived."
                  : "Project restored.",
              );
            })
          }
        >
          {project.status === "active" ? "Archive project" : "Restore project"}
        </button>
      </div>
      <ErrorMessage text={error} />
      {notice && (
        <p role="status" className="message success">
          {notice}
        </p>
      )}
      <UsageCard usage={usage} />
      <p>
        <Link
          className="button secondary"
          href={"/app/projects/" + projectId + "/storyboard"}
        >
          Open storyboard review →
        </Link>
      </p>
      <div className="project-detail-layout">
        <div>
          <form
            className="panel settings-panel"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                const p = await mutate<Project>(
                  prefix,
                  { title: title.trim() },
                  me.csrfToken,
                  projectTag(project),
                  "PATCH",
                );
                setProject(p);
                setNotice("Project renamed.");
              });
            }}
          >
            <label>
              Project title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={160}
              />
            </label>
            <button
              className="secondary"
              disabled={busy || title.trim() === project.title}
            >
              Rename project
            </button>
          </form>
          <form className="panel editor-panel" onSubmit={save}>
            <div className="section-heading">
              <h3>Editable brief</h3>
              <span className="pill">
                {dirty ? "Unsaved changes" : "Saved"}
              </span>
            </div>
            <fieldset disabled={busy || project.status === "archived"}>
              <BriefFields value={brief} onChange={setBrief} />
            </fieldset>
            <div className="editor-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    !dirty ||
                    confirm(
                      "Discard unsaved changes and reload the saved draft?",
                    )
                  )
                    void load();
                }}
              >
                Reload saved draft
              </button>
              <button
                disabled={busy || !dirty || project.status === "archived"}
              >
                {busy ? "Working…" : "Save draft"}
              </button>
            </div>
          </form>
          <section className="panel version-panel">
            <h3>Submitted versions</h3>
            <p className="muted">
              Each queue submission freezes its own exact input. Editing the
              draft never changes an earlier version.
            </p>
            {!versions.length ? (
              <p className="fine">No versions submitted yet.</p>
            ) : (
              <div className="version-list">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    className="secondary version-item"
                    onClick={() => setSelected(v)}
                  >
                    <span>
                      Version {v.number}
                      <small>Draft revision {v.sourceDraftRevision}</small>
                    </span>
                    <span>
                      {new Date(v.createdAt).toLocaleDateString("en-IN")} ↗
                    </span>
                  </button>
                ))}
              </div>
            )}
            {versionCursor && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void moreVersions()}
              >
                Load more versions
              </button>
            )}
            {selected && (
              <div className="snapshot">
                <div className="section-heading">
                  <h3>Version {selected.number}</h3>
                  <button
                    className="secondary"
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </button>
                </div>
                <p>{selected.content.brief.topic}</p>
                <span className="pill">
                  {selected.content.brief.language} ·{" "}
                  {selected.content.brief.audience} ·{" "}
                  {selected.content.brief.mode}
                </span>
                <p className="fine">
                  Read-only snapshot · Draft revision{" "}
                  {selected.sourceDraftRevision}
                </p>
              </div>
            )}
          </section>
        </div>
        <aside>
          <Discussion
            projectId={projectId}
            etag={draftTag(draft)}
            disabled={
              busy || dirty || !!activeJob || project.status !== "active"
            }
            onSent={() => void progress()}
          />
          <section className="panel planning-panel">
            <span className="tag">THE NEXT STEP</span>
            <h3>Planning queue</h3>
            <p>
              Submit a saved brief to create a fixed version and reserve one
              processing slot.
            </p>
            <p className="message">
              Planning retrieves source excerpts and generates a scene-by-scene
              script using your configured Gemini account. Account quotas and
              billing apply; no paid search grounding or model fallback is used.
              Voice and video generation come next.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I understand this reserves one pilot processing slot until
              completion or cancellation.
            </label>
            <button
              className="full"
              disabled={
                busy ||
                dirty ||
                !consent ||
                !!activeJob ||
                project.status === "archived" ||
                !loaded
              }
              onClick={() => void submit()}
            >
              Submit saved brief
            </button>
            {dirty && (
              <p className="fine">Save your changes before submitting.</p>
            )}
          </section>
          <section className="panel jobs-panel">
            <h3>Processing requests</h3>
            {!jobs.length ? (
              <p className="fine">Nothing queued yet.</p>
            ) : (
              jobs.map((j) => (
                <article key={j.id} className="job-item">
                  <span className={"pill job-state-" + j.state}>{j.state}</span>
                  {j.state === "paused" &&
                    j.pauseReason !== "PROVIDER_OUTCOME_UNKNOWN" && (
                      <button
                        className="secondary small"
                        disabled={busy}
                        onClick={() => void jobAction(j, "resume")}
                      >
                        Resume request
                      </button>
                    )}
                  <p>
                    {j.pauseReason === "PIPELINE_NOT_READY"
                      ? "Waiting for the scripting stage to be connected."
                      : j.pauseReason === "PROVIDER_OUTCOME_UNKNOWN"
                        ? "Provider outcome needs reconciliation. We will not submit it again automatically."
                        : j.error?.detail ||
                          {
                            queued:
                              "Your request is saved and waiting for a worker.",
                            running: "A worker is handling this request.",
                            cancelled:
                              "Cancelled. Unused allowance has been released.",
                            succeeded:
                              "Processing completed. Open storyboard review to use the result.",
                            paused:
                              (
                                {
                                  PLANNING_DAILY_LIMIT:
                                    "Daily Gemini request cap reached. Try after UTC midnight.",
                                  PROVIDER_QUOTA:
                                    "The configured Gemini account reached its quota. No request will be repeated automatically.",
                                  PROVIDER_CREDENTIALS:
                                    "The script provider rejected its credentials. Check server configuration.",
                                  RESEARCH_UNAVAILABLE:
                                    "Source retrieval is unavailable. No citations were invented.",
                                  EVIDENCE_UNAVAILABLE:
                                    "No suitable source excerpt was retrieved. Refine the topic before replanning.",
                                  PROVIDER_NOT_CONFIGURED:
                                    "Configure the Gemini API key before resuming.",
                                } as Record<string, string>
                              )[j.pauseReason || ""] ||
                              "Processing needs attention.",
                            failed: "Processing failed.",
                          }[j.state]}
                  </p>
                  {j.cancelRequestedAt && j.state === "running" ? (
                    <p className="fine">Cancellation in progress…</p>
                  ) : (
                    ["queued", "running", "paused"].includes(j.state) && (
                      <button
                        className="secondary small"
                        disabled={
                          busy || j.pauseReason === "PROVIDER_OUTCOME_UNKNOWN"
                        }
                        onClick={() => void jobAction(j, "cancel")}
                      >
                        Cancel request
                      </button>
                    )
                  )}
                </article>
              ))
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
export function WorkspaceOverview() {
  const [projects, setProjects] = useState<Project[]>([]),
    [usage, setUsage] = useState<Usage | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const [p, u] = await Promise.all([
        api<Page<Project>>("/api/v1/projects?limit=4"),
        api<Usage>("/api/v1/usage"),
      ]);
      setProjects(p.items);
      setUsage(u);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <span className="eyebrow">YOUR PERSONAL STUDIO</span>
          <h1>A good idea starts here.</h1>
          <p className="muted">Your saved ideas, ready for their next step.</p>
        </div>
        <Link className="button" href="/app/create">
          ＋ New project
        </Link>
      </div>
      <ErrorMessage text={error} />
      {error && (
        <button className="secondary" onClick={() => void load()}>
          Try again
        </button>
      )}
      <UsageCard usage={usage} />
      <div className="section-heading recent-heading">
        <h3>Recent projects</h3>
        <Link href="/app/projects">View all →</Link>
      </div>
      {busy ? (
        <p role="status">Loading your studio…</p>
      ) : projects.length ? (
        <ProjectCards items={projects} />
      ) : !error ? (
        <section className="welcome-panel">
          <div>
            <span className="pill">YOUR WORKSPACE IS READY</span>
            <h2>
              Big questions.
              <br />
              <em>Clear explanations.</em>
            </h2>
            <p>Save your first topic and shape a brief for your audience.</p>
            <Link className="button" href="/app/create">
              Create your first project ↗
            </Link>
          </div>
          <div className="idea-diagram" aria-hidden="true">
            <span className="idea-ring" />
            <span className="idea-ring inner" />
            <b>✦</b>
            <small>IDEA → UNDERSTANDING</small>
          </div>
        </section>
      ) : null}
    </>
  );
}
