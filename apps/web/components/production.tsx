"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { mutate, draftTag, jobTag, errorText } from "../lib/projects";
import { useWorkspace } from "./workspace";
import { frameSvg } from "../../../packages/contracts/src/composition";
const reasons: Record<string, string> = {
  NARRATION_REQUEST_UNRESOLVED:
    "An identical speech request is still running or needs reconciliation. No duplicate speech was submitted.",
  NARRATION_NOT_REUSABLE:
    "The saved narration is no longer available. No new speech was purchased; submit a new approved request with explicit speech consent.",
  FREE_PLAN_REQUIRED:
    "This local pilot only uses a verified free-tier ElevenLabs account. No paid tier or fallback was used.",
  PAID_OVERAGES_ENABLED: "Disable provider overages before proceeding.",
  SPEECH_PERMISSIONS_REQUIRED:
    "The key needs subscription read, voice read and text-to-speech permissions. Update it in ElevenLabs and resume.",
  SPEECH_NOT_CONFIGURED: "Configure the speech key before resuming.",
  SPEECH_PROVIDER_QUOTA:
    "The provider has insufficient free allowance. No automatic retry will be made.",
  SPEECH_DAILY_REQUEST_LIMIT:
    "Daily speech request cap reached. Try after UTC reset.",
  NARRATION_DURATION_LIMIT:
    "The actual narration exceeds the duration cap. Audio is saved; shorten and re-approve the script rather than trimming the speech.",
  ALIGNMENT_MISMATCH:
    "The provider timing did not match the exact spoken script. The audio is saved; no video will be offered as ready.",
  ALIGNMENT_INVALID: "The returned speech timing failed validation.",
  PROVIDER_OUTCOME_UNKNOWN:
    "The provider outcome is unknown. We will not repeat a potentially charged request. This needs reconciliation.",
  RENDER_INTERRUPTED_RETRY_REQUIRED:
    "Rendering was interrupted. Retry using the validated saved narration.",
  DEVANAGARI_FONT_MISSING:
    "Install the configured Devanagari font on the render worker.",
  STORAGE_CAPACITY:
    "Private storage capacity is full. The draft and completed assets remain saved.",
  TEXT_TOO_WIDE:
    "A word or label is too wide. Shorten it and approve the updated storyboard.",
  TEXT_TOO_TALL:
    "A title, label or caption does not fit the safe layout. Shorten it before retrying.",
  PROVIDER_OR_SCRIPT_CHANGED:
    "The provider binding changed. Submit a new approved production request.",
};
export function ProductionPanel({
  projectId,
  saved,
  dirty,
}: {
  projectId: string;
  saved: any;
  dirty: boolean;
}) {
  const { me } = useWorkspace();
  const [status, setStatus] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [terms, setTerms] = useState(false),
    [error, setError] = useState(""),
    [urls, setUrls] = useState<Record<string, string>>({}),
    [composition, setComposition] = useState<any>(null),
    [time, setTime] = useState(0.4);
  const audio = useRef<HTMLAudioElement>(null),
    video = useRef<HTMLVideoElement>(null);
  const prefix = "/api/v1/projects/" + projectId;
  const load = useCallback(async () => {
    try {
      const s = await api<any>(prefix + "/production");
      setStatus(s);
    } catch (e) {
      setError(errorText(e));
    }
  }, [prefix]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    let frame = 0,
      last = -1;
    const tick = () => {
      const value = audio.current?.currentTime ?? 0.4;
      if (Math.abs(value - last) > 0.035) {
        last = value;
        setTime(value || 0.4);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function links() {
    if (!status) return;
    const next: Record<string, string> = {};
    for (const artifact of status.artifacts) {
      if (
        !["audio", "video", "composition", "captions"].includes(artifact.kind)
      )
        continue;
      const access = await mutate<any>(
        "/api/v1/artifacts/" + artifact.id + "/access",
        { purpose: "preview" },
        me.csrfToken,
      );
      next[artifact.kind] = access.url;
    }
    if (next.composition)
      setComposition(
        await fetch(next.composition, {
          credentials: "same-origin",
          cache: "no-store",
        }).then((r) => {
          if (!r.ok)
            throw new Error(
              "The composition preview link expired. Refresh media links.",
            );
          return r.json();
        }),
      );
    setUrls(next);
  }
  const j = status?.job;
  const active = j && ["queued", "running", "paused"].includes(j.state);
  const hasAudio = status?.artifacts?.some((a: any) => a.kind === "audio");
  const reuseAvailable =
    hasAudio && status?.artifacts.some((a: any) => a.kind === "alignment");
  const stageText: Record<string, string> = {
    generating_voice: "Generating narration",
    aligning: "Checking speech timing",
    composing: "Building the composition",
    rendering: "Rendering motion graphics",
    checking: "Validating the video",
  };
  return (
    <section className="panel production-panel">
      <div className="section-heading">
        <div>
          <span className="tag">VOICE → MOTION → VALIDATED VIDEO</span>
          <h3>Produce this storyboard</h3>
          <Link
            className="button secondary"
            href={"/app/projects/" + projectId + "/preview"}
          >
            Saved videos & history
          </Link>
        </div>
        {status?.ready && <span className="pill ready-badge">Ready</span>}
      </div>
      <p className="fine">
        The narration sets the length. Local cap:{" "}
        {Math.round((status?.limits.maxDurationMs || 120000) / 1000)} seconds
        and {status?.limits.maxSpokenCharacters || 1600} spoken characters.
        Free-tier eligibility and allowance are checked before a speech request.
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
        />
        I authorize free-plan speech credits and local rendering for this
        version. This pilot output is non-commercial and requires ElevenLabs
        attribution.
      </label>
      <div className="story-actions">
        <button
          disabled={
            busy ||
            dirty ||
            !terms ||
            !saved.content.voice ||
            !!active ||
            (saved.content.brief.mode === "guided" && !saved.approval)
          }
          onClick={() =>
            void act(async () => {
              await mutate(
                prefix + "/jobs",
                {
                  kind: "produce",
                  acknowledgedUsageTerms: true,
                  acknowledgedVoiceTerms: true,
                  scriptApproved: !!saved.approval,
                },
                me.csrfToken,
                draftTag(saved),
              );
              setTerms(false);
              setUrls({});
              setComposition(null);
              await load();
            })
          }
        >
          {busy
            ? "Working…"
            : status?.ready
              ? "Generate another version"
              : "Generate voice & video"}
        </button>
        {j && ["queued", "running", "paused"].includes(j.state) && (
          <button
            className="secondary"
            disabled={busy || j.pauseReason === "PROVIDER_OUTCOME_UNKNOWN"}
            onClick={() =>
              void act(async () => {
                await mutate(
                  "/api/v1/jobs/" + j.id + "/cancel",
                  {},
                  me.csrfToken,
                  jobTag(j),
                );
                await load();
              })
            }
          >
            Cancel production
          </button>
        )}
        {j?.state === "paused" &&
          j.pauseReason !== "PROVIDER_OUTCOME_UNKNOWN" && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await mutate(
                    "/api/v1/jobs/" + j.id + "/resume",
                    {},
                    me.csrfToken,
                    jobTag(j),
                  );
                  await load();
                })
              }
            >
              Resume safe stage
            </button>
          )}
        {j && ["failed", "cancelled"].includes(j.state) && reuseAvailable && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await mutate(
                  "/api/v1/jobs/" + j.id + "/retry",
                  { allowNewProviderRequest: false },
                  me.csrfToken,
                  jobTag(j),
                );
                setUrls({});
                setComposition(null);
                await load();
              })
            }
          >
            Retry with saved narration
          </button>
        )}
      </div>
      {dirty && (
        <p className="fine">
          Save and approve the changed storyboard before generating.
        </p>
      )}
      {saved.content.brief.mode === "guided" && !saved.approval && !dirty && (
        <p className="fine">Approve the exact saved storyboard first.</p>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {j && (
        <div className="production-status" role="status">
          <span className="pill">{j.state}</span>
          <span>
            {j.state === "running"
              ? stageText[j.stage] || "Processing your immutable version"
              : j.state === "paused"
                ? reasons[j.pauseReason] ||
                  "This stage needs attention. Completed narration is retained."
                : j.state === "failed"
                  ? reasons[j.error?.code] ||
                    "Processing failed. Valid saved narration can be reused."
                  : j.state === "succeeded"
                    ? "Video passed codec, dimensions, audio, timing, layout and full decode checks."
                    : j.state === "cancelled"
                      ? "Cancelled. Unused reservations were released; incurred speech/render work remains recorded."
                      : "Saved in the durable queue."}
          </span>
        </div>
      )}
      {hasAudio && (
        <div className="story-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void act(links)}
          >
            {urls.audio ? "Refresh media links" : "Open saved media"}
          </button>
          <span className="fine">
            Session-protected links expire after two minutes. Refresh links if
            playback expires.
          </span>
        </div>
      )}
      {urls.audio && (
        <div className="media-review">
          <div>
            {status.ready && urls.video ? (
              <>
                <h3>Validated export</h3>
                <video
                  controls
                  playsInline
                  ref={video}
                  preload="metadata"
                  src={urls.video}
                  onPlay={() => audio.current?.pause()}
                />
                <p className="fine">
                  Produced from the saved, approved version. Measured duration:{" "}
                  {(
                    (status.artifacts.find((a: any) => a.kind === "video")
                      ?.durationMs || 0) / 1000
                  ).toFixed(2)}{" "}
                  seconds.
                </p>
              </>
            ) : (
              <p className="fine">
                A final video is not ready. The saved narration can still be
                reviewed.
              </p>
            )}
          </div>
          <div>
            <h3>Narration & timed composition</h3>
            <audio
              controls
              ref={audio}
              src={urls.audio}
              preload="metadata"
              onPlay={() => video.current?.pause()}
            />
            {composition && (
              <div
                className="timed-composition"
                aria-label="Audio-matched controlled composition preview"
                dangerouslySetInnerHTML={{
                  __html: frameSvg(
                    composition.timing.timeline,
                    Math.min(time, composition.timing.duration - 0.04),
                    composition.content.style.accentColor,
                    composition.content.style.preset,
                  ),
                }}
              />
            )}
            <p className="fine">
              Preview and export use the same controlled scene operations and
              measured cue/caption times.
            </p>
          </div>
        </div>
      )}
      {status?.ready && urls.video && (
        <p className="fine">
          Non-commercial local pilot output. Voice generated with ElevenLabs;
          include attribution when sharing. Instagram publishing is not enabled.
        </p>
      )}
    </section>
  );
}
