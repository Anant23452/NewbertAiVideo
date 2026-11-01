"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { errorText, type Page, type Usage } from "../lib/projects";
type GenerationSettings = {
  voiceMode: "platform_generated";
  voiceRecordingRequired: false;
  personalKeysEnabled: false;
  speech: {
    configured: boolean;
    enabled: boolean;
    eligibility: string;
    nonCommercial: boolean;
    attributionRequired: boolean;
  };
  planning: { configured: boolean; enabled: boolean };
  admissionEnabled: boolean;
  processingEnabled: boolean;
  maxDurationMs: number;
  maxSpokenCharacters: number;
  allowanceTimezone: "UTC";
};
type Entry = {
  id: string;
  resource: string;
  unitsDelta: number;
  reasonCode: string;
  createdAt: string;
};
const labels: Record<string, string> = {
  generation_count: "Processing requests",
  planning_requests: "Script & discussion requests",
  speech_requests: "Voice requests",
  provider_credits: "Voice characters",
  narration_ms: "Narration time",
  render_ms: "Rendering time",
  storage_bytes: "Private storage",
};
const explanations: Record<string, string> = {
  generation_count:
    "Planning, discussions and video attempts share this allowance.",
  planning_requests:
    "Requests already submitted to the script provider; queued work can use the remaining allowance.",
  speech_requests:
    "New speech requests submitted today. Reusing saved narration does not submit speech.",
  provider_credits:
    "Characters submitted for new narration, plus characters held for waiting work.",
  narration_ms:
    "Measured narration time. Waiting work reserves up to the video duration limit.",
  render_ms:
    "Video time processed by the renderer, including failed attempts after rendering starts.",
  storage_bytes: "Saved private media. This allowance has no daily reset.",
};
function amount(resource: string, value: number) {
  if (resource === "storage_bytes")
    return (
      (value / 1048576).toLocaleString("en-IN", { maximumFractionDigits: 2 }) +
      " MB"
    );
  if (resource.endsWith("_ms"))
    return (
      (value / 1000).toLocaleString("en-IN", { maximumFractionDigits: 1 }) +
      " sec"
    );
  return value.toLocaleString("en-IN");
}
const reasons: Record<string, string> = {
  submitted_speech_characters: "New narration submitted",
  processed_media_ms: "Media processing",
  job_succeeded: "Completed processing",
  job_failed: "Processing attempt",
  generation_completed: "Completed processing",
};
export function UsageSettings() {
  const [usage, setUsage] = useState<Usage | null>(null),
    [settings, setSettings] = useState<GenerationSettings | null>(null),
    [entries, setEntries] = useState<Entry[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [updated, setUpdated] = useState<Date | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [u, s, e] = await Promise.all([
        api<Usage>("/api/v1/usage"),
        api<GenerationSettings>("/api/v1/generation-settings"),
        api<Page<Entry>>("/api/v1/usage/entries?limit=10"),
      ]);
      setUsage(u);
      setSettings(s);
      setEntries(e.items);
      setCursor(e.nextCursor);
      setUpdated(new Date());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => clearInterval(timer);
  }, [load]);
  async function more() {
    if (!cursor) return;
    setBusy(true);
    setError("");
    try {
      const page = await api<Page<Entry>>(
        "/api/v1/usage/entries?limit=10&cursor=" + encodeURIComponent(cursor),
      );
      setEntries((old) => [
        ...old,
        ...page.items.filter((e) => !old.some((x) => x.id === e.id)),
      ]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const reset = usage?.resources.find(
    (r) => r.resource === "generation_count",
  )?.resetsAt;
  return (
    <section
      className="usage-settings"
      aria-label="Generation and allowance settings"
    >
      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="tag">AUTOMATIC GENERATION</span>
            <h2>Voice & generation</h2>
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? "Refreshing…" : "Refresh usage"}
          </button>
        </div>
        <p>
          Your videos use the platform’s configured AI voice. No recording or
          personal API key is needed.
        </p>
        {error && (
          <p className="message error" role="alert">
            {error} {updated ? "Showing the last successful update." : ""}
          </p>
        )}
        {!settings && !error && (
          <p role="status">Loading generation settings…</p>
        )}
        {settings && (
          <>
            <div className="generation-status-grid">
              <article>
                <h3>AI narration</h3>
                <span className="pill">
                  {!settings.speech.enabled
                    ? "Temporarily paused"
                    : settings.speech.configured
                      ? "Configured"
                      : "Setup needed"}
                </span>
                <p className="fine">
                  Voice access and the provider’s available allowance are
                  checked before generating speech.
                </p>
              </article>
              <article>
                <h3>Script generation</h3>
                <span className="pill">
                  {!settings.planning.enabled
                    ? "Temporarily paused"
                    : settings.planning.configured
                      ? "Configured"
                      : "Setup needed"}
                </span>
                <p className="fine">
                  The platform supplies the script provider connection.
                </p>
              </article>
            </div>
            {(!settings.admissionEnabled || !settings.processingEnabled) && (
              <p className="message" role="status">
                Processing is temporarily paused by the platform. Saved drafts
                and videos remain available.
              </p>
            )}
            <p className="fine">
              Each video supports up to{" "}
              {amount("narration_ms", settings.maxDurationMs)} of measured
              narration and{" "}
              {settings.maxSpokenCharacters.toLocaleString("en-IN")} spoken
              characters.
            </p>
            <p className="fine">
              This pilot uses free-plan narration: noncommercial use only, with
              ElevenLabs attribution when sharing.
            </p>
          </>
        )}
      </section>
      <section className="panel">
        <h2>Your allowance</h2>
        <p className="muted">
          Used is already consumed. Reserved is held for waiting or active work.
          Remaining is available for new work.
        </p>
        {usage && (
          <>
            <p className="fine">
              Daily allowances reset at 00:00 UTC
              {reset
                ? " — next reset: " +
                  new Date(reset).toLocaleString("en-IN", {
                    timeZone: "UTC",
                    dateStyle: "medium",
                    timeStyle: "short",
                  }) +
                  " UTC"
                : ""}
              . Your workspace timezone does not change this reset.
            </p>
            <p className="pill">
              {usage.platformCapacity === "paused"
                ? "Processing paused"
                : usage.platformCapacity === "queued"
                  ? "Shared capacity is busy — requests may wait"
                  : "Limited pilot capacity"}
            </p>
            <div className="allowance-grid">
              {usage.resources.map((r) => (
                <article
                  className="allowance-resource"
                  key={r.resource}
                  aria-label={labels[r.resource] || r.resource}
                >
                  <h3>{labels[r.resource] || r.resource}</h3>
                  <p className="allowance-remaining">
                    <strong>{amount(r.resource, r.remaining)}</strong> remaining
                  </p>
                  <progress
                    max={Math.max(r.limit, 1)}
                    value={Math.min(r.limit, r.used + r.reserved)}
                    aria-label={
                      (labels[r.resource] || r.resource) + " used and reserved"
                    }
                  />
                  <dl>
                    <div>
                      <dt>Used</dt>
                      <dd>{amount(r.resource, r.used)}</dd>
                    </div>
                    <div>
                      <dt>Reserved</dt>
                      <dd>{amount(r.resource, r.reserved)}</dd>
                    </div>
                    <div>
                      <dt>Limit</dt>
                      <dd>
                        {amount(r.resource, r.limit)}
                        {r.resetsAt ? " / day" : ""}
                      </dd>
                    </div>
                  </dl>
                  <p className="fine">{explanations[r.resource]}</p>
                  {r.limit === 0 && (
                    <p className="fine">
                      This resource is currently unavailable.
                    </p>
                  )}
                  {r.remaining === 0 && r.limit > 0 && (
                    <p className="fine">
                      Allowance is used or held.{" "}
                      {r.resetsAt
                        ? "Wait for reset or for unused reservations to be released."
                        : "Storage remains in use while media is saved."}
                    </p>
                  )}
                </article>
              ))}
            </div>
            <p className="fine">
              These are your workspace’s platform allowances, not the provider
              account’s live balance. Shared provider limits and eligibility can
              still pause a request. Cancelling waiting work releases unused
              reservations; incurred speech and rendering remain counted.
            </p>
          </>
        )}
        {updated && (
          <p className="fine">
            Last updated {updated.toLocaleTimeString("en-IN")}. Refreshes every
            30 seconds while this page is visible.
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Recent usage</h2>
        <p className="muted">
          Settled processing entries for your workspace. Waiting reservations
          appear in the totals above.
        </p>
        {updated && !entries.length && (
          <p>
            No settled usage yet. Your first completed processing attempt will
            appear here.
          </p>
        )}
        <div className="usage-entry-list">
          {entries.map((e) => (
            <article key={e.id} className="usage-entry">
              <div>
                <strong>{labels[e.resource] || "Processing"}</strong>
                <p className="fine">
                  {reasons[e.reasonCode] || "Recorded processing usage"}
                </p>
              </div>
              <span>
                {e.unitsDelta > 0 ? "+" : ""}
                {amount(e.resource, e.unitsDelta)}
              </span>
              <time dateTime={e.createdAt}>
                {new Date(e.createdAt).toLocaleString("en-IN")}
              </time>
            </article>
          ))}
        </div>
        {cursor && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void more()}
          >
            Load more usage
          </button>
        )}
        <p>
          <Link href="/app/projects">Review projects & waiting work →</Link>
        </p>
      </section>
    </section>
  );
}
