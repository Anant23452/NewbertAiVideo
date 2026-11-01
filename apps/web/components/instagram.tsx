"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { errorText, mutate } from "../lib/projects";
import { useWorkspace } from "./workspace";
type Connection = {
  id: string;
  revision: number;
  displayName: string;
  status: "active" | "reauth_required";
  expiresAt: string;
  createdAt: string;
  grantedScopes: string[];
};
type State = {
  connection: Connection | null;
  setup: {
    configured: boolean;
    missing: string[];
    requiredScopes: string[];
    professionalAccountRequired: boolean;
    publishingAvailable: false;
  };
};
const outcomes: Record<string, string> = {
  connected:
    "Instagram connected. Posting still requires a separate publishing workflow.",
  cancelled: "Instagram sign-in was cancelled. No new account was connected.",
  invalid_state:
    "This sign-in request expired, was already used, or belongs to another session. Start a new connection.",
  setup_changed:
    "The app setup changed during sign-in. Start a new connection.",
  invalid_code:
    "Instagram did not return a usable sign-in code. Try connecting again.",
  connection_changed:
    "The connection changed during sign-in. Refresh and start again.",
  account_unavailable:
    "That Instagram account is unavailable for this connection.",
  connection_failed: "The connection could not be saved. Start a new sign-in.",
  instagram_permissions_required:
    "Required Instagram permissions were not granted. Reconnect and review the requested permissions.",
  instagram_professional_required:
    "Use an Instagram Business or Creator account.",
  instagram_reauth_required: "Instagram requires a fresh sign-in.",
  instagram_unavailable:
    "Instagram could not complete sign-in. Start again when it is available.",
  instagram_rate_limit:
    "Instagram is limiting requests. Wait before trying again.",
  instagram_response_invalid:
    "Instagram returned an unexpected response. The account was not connected.",
};
export function InstagramPanel({
  returnPath = "/app/settings",
}: {
  returnPath?: "/app/settings" | "/app/publishing";
}) {
  const { me } = useWorkspace();
  const [state, setState] = useState<State | null>(null),
    [busy, setBusy] = useState(false),
    [ack, setAck] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setState(await api<State>("/api/v1/instagram/connection"));
  }, []);
  useEffect(() => {
    void load().catch((e) => setError(errorText(e)));
    const u = new URL(window.location.href),
      result = u.searchParams.get("instagram");
    if (result) {
      setMessage(
        outcomes[result] ||
          "Instagram sign-in ended. Check the connection status.",
      );
      u.searchParams.delete("instagram");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    }
  }, [load]);
  const row = state?.connection;
  const etag = row
    ? '"instagram:' + row.id + ":" + row.revision + '"'
    : undefined;
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      await load().catch(() => {});
      setBusy(false);
    }
  }
  async function connect() {
    const r = await mutate<{ authorizationUrl: string }>(
      "/api/v1/instagram/authorization",
      { acknowledgedAccountAccess: true, returnPath },
      me.csrfToken,
      etag,
    );
    const target = new URL(r.authorizationUrl);
    if (
      target.origin !== "https://www.instagram.com" ||
      target.pathname !== "/oauth/authorize"
    )
      throw Error("Unexpected Instagram sign-in address.");
    window.location.assign(target.href);
  }
  return (
    <section
      className="panel instagram-panel"
      aria-label="Instagram connection"
    >
      <span className="tag">ONE ACCOUNT · YOUR WORKSPACE</span>
      <h2>Instagram connection</h2>
      <p>
        Connect your Instagram Business or Creator account through Instagram’s
        own sign-in page. Your password stays with Instagram.
      </p>
      {message && (
        <p className="message success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {!state && !error && <p role="status">Loading Instagram connection…</p>}
      {state && (
        <>
          <span className="pill">
            {row
              ? row.status === "active"
                ? "Connected"
                : "Reconnect required"
              : "Not connected"}
          </span>
          {row && (
            <div className="instagram-account">
              <h3>@{row.displayName}</h3>
              <p className="fine">
                Access expires {new Date(row.expiresAt).toLocaleString("en-IN")}
                .
              </p>
              {row.status === "reauth_required" && (
                <p className="message">
                  Access needs a fresh sign-in. Pending deliveries remain
                  paused.
                </p>
              )}
            </div>
          )}
          {!state.setup.configured && (
            <div className="message">
              <strong>Platform setup required</strong>
              <p>
                The operator needs to finish the Meta developer app and
                encrypted token storage configuration before Instagram sign-in
                is available. Your videos can still be generated and downloaded.
              </p>
              <p className="fine">
                {row
                  ? "Finish platform setup before reconnecting or renewing this saved account."
                  : "No Instagram account has been connected by this setup screen."}
              </p>
            </div>
          )}
          {state.setup.configured && (
            <>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                I authorize access to my Instagram profile and request the
                permission needed for future publishing. Connecting alone does
                not authorize a post.
              </label>
              <button disabled={busy || !ack} onClick={() => void act(connect)}>
                {busy
                  ? "Working…"
                  : row
                    ? "Reconnect Instagram"
                    : "Connect Instagram"}
              </button>
            </>
          )}
          <div className="actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void act(load)}
            >
              Refresh connection status
            </button>
            {row?.status === "active" && (
              <button
                className="secondary"
                disabled={busy || !state.setup.configured}
                onClick={() =>
                  void act(async () => {
                    await mutate(
                      "/api/v1/instagram/connection/refresh",
                      {},
                      me.csrfToken,
                      etag,
                    );
                    setMessage("Instagram access renewed.");
                  })
                }
              >
                Renew access
              </button>
            )}
          </div>
          {row && (
            <details className="instagram-disconnect">
              <summary>Disconnect this account</summary>
              <p>
                Remove Newbert’s saved token and pause pending deliveries. To
                remove the app’s permissions at Instagram too, use Instagram’s
                Apps and websites settings.
              </p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await mutate(
                      "/api/v1/instagram/connection",
                      undefined,
                      me.csrfToken,
                      etag,
                      "DELETE",
                    );
                    setState((previous) =>
                      previous ? { ...previous, connection: null } : previous,
                    );
                    setAck(false);
                    setMessage(
                      "Instagram disconnected from Newbert. Pending deliveries remain paused.",
                    );
                  })
                }
              >
                Disconnect Instagram
              </button>
            </details>
          )}
        </>
      )}
      <p className="fine">
        Scheduling and posting are the next milestone. No video will be posted
        from this screen.
      </p>
      <p>
        <Link href="/app/projects">Open saved videos →</Link>
      </p>
    </section>
  );
}
export function Publishing() {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">CONNECT BEFORE PUBLISHING</span>
        <h1>Publishing</h1>
        <p className="muted">
          Link one Instagram account to your private workspace.
        </p>
      </div>
      <InstagramPanel returnPath="/app/publishing" />
    </>
  );
}
