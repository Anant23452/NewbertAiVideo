"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { InstagramPanel } from "./instagram";
import { UsageSettings } from "./usage-settings";
import { Brand } from "./brand";
import { api, ApiError } from "../lib/api";
type Workspace = {
  id: string;
  revision: number;
  timezone: string;
  createdAt: string;
};
type Me = { workspace: Workspace; csrfToken: string };
type Session = {
  user: { name: string; email: string };
  needsRefresh?: boolean;
};
const Context = createContext<{
  me: Me;
  session: Session;
  reload: () => Promise<void>;
} | null>(null);
export function useWorkspace() {
  const c = useContext(Context);
  if (!c) throw new Error("Workspace is unavailable.");
  return c;
}
const links = [
  ["/app", "◫", "Overview"],
  ["/app/projects", "▧", "Projects"],
  ["/app/create", "✦", "Create a video"],
  ["/app/publishing", "↗", "Publishing"],
  ["/app/settings", "⚙", "Settings"],
];
export default function WorkspaceShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [me, setMe] = useState<Me | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    setError("");
    try {
      const m = await api<Me>("/api/v1/me");
      let s = await api<Session>("/api/auth/get-session");
      if (s.needsRefresh)
        s = await api<Session>(
          "/api/auth/get-session",
          {},
          { "X-CSRF-Token": m.csrfToken },
        );
      setMe(m);
      setSession(s);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        location.replace(
          "/sign-in?next=" + encodeURIComponent(location.pathname),
        );
        return;
      }
      setError(
        e instanceof Error ? e.message : "Could not load your workspace.",
      );
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => setOpen(false), [path]);
  async function logout() {
    if (!me) return;
    setBusy(true);
    try {
      await api("/api/auth/sign-out", {}, { "X-CSRF-Token": me.csrfToken });
      sessionStorage.removeItem("newbert-topic");
      setMe(null);
      setSession(null);
      location.replace("/sign-in");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
      setBusy(false);
    }
  }
  if (!me || !session || error)
    return (
      <main className="state-screen">
        <Brand />
        <div className="panel">
          <h2>{error ? "Workspace unavailable" : "Opening your workspace…"}</h2>
          <p role={error ? "alert" : "status"}>
            {error || "Checking your secure session."}
          </p>
          {error && <button onClick={() => void reload()}>Try again</button>}{" "}
          <Link href="/">Back to home</Link>
        </div>
      </main>
    );
  return (
    <Context.Provider value={{ me, session, reload }}>
      <div className="app-layout">
        <button
          className="mobile-toggle"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="sidebar"
        >
          {open ? "✕ Close" : "☰ Menu"}
        </button>
        {open && (
          <button
            className="scrim"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
        )}
        <aside className={"sidebar " + (open ? "is-open" : "")} id="sidebar">
          <Brand />
          <div className="workspace-badge">
            <span className="avatar">
              {session.user.name?.slice(0, 1) || "C"}
            </span>
            <div>
              Personal workspace<small>Just for you</small>
            </div>
          </div>
          <nav aria-label="Workspace">
            {links.map(([href, icon, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={
                  (href === "/app" ? path === href : path.startsWith(href))
                    ? "page"
                    : undefined
                }
              >
                <span aria-hidden="true">{icon}</span>
                {label}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="pilot-label">
              <i /> EARLY DEVELOPMENT
            </div>
            <p>We’re building your studio, one feature at a time.</p>
            <button
              className="secondary full"
              disabled={busy}
              onClick={() => void logout()}
            >
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </aside>
        <div className="app-main">
          <header className="app-top">
            <span>
              MY WORKSPACE{" "}
              <span className="muted">
                /{" "}
                {links.find(([href]) =>
                  href === "/app" ? path === href : path.startsWith(href),
                )?.[2] || "Settings"}
              </span>
            </span>
            <span className="account-email">{session.user.email}</span>
          </header>
          <main className="app-content">{children}</main>
          <footer className="app-footer">
            A little curiosity. A clearer explanation.
          </footer>
        </div>
      </div>
    </Context.Provider>
  );
}
export function FuturePage({ kind }: { kind: "publishing" }) {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">YOUR STUDIO</span>
        <h1>Publishing</h1>
        <p className="muted">Share when the story is ready.</p>
      </div>
      <section className="empty-state panel">
        <div className="empty-symbol">↗</div>
        <span className="tag">COMING SOON</span>
        <h2>Your videos, out in the world.</h2>
        <p>
          Instagram connection and scheduling are being built. No account is
          connected and nothing will be posted.
        </p>
        <Link className="button secondary" href="/app">
          Back to overview
        </Link>
      </section>
    </>
  );
}
export function Settings() {
  const { me, session, reload } = useWorkspace();
  const [timezone, setTimezone] = useState(me.workspace.timezone),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => setTimezone(me.workspace.timezone), [me.workspace.timezone]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(
        "/api/v1/workspace",
        { timezone },
        {
          "X-CSRF-Token": me.csrfToken,
          "If-Match": `"workspace:${me.workspace.id}:${me.workspace.revision}"`,
        },
        "PATCH",
      );
      await reload();
      setMessage("Timezone saved.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 412) {
        await reload();
        setError(
          "Settings changed elsewhere. Review the latest timezone and try again.",
        );
      } else setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">A SPACE THAT FITS YOU</span>
        <h1>Settings</h1>
        <p className="muted">Manage your account and personal workspace.</p>
      </div>
      <section className="panel settings-panel">
        <h3>Account</h3>
        <p className="muted">Signed in as</p>
        <p>{session.user.email}</p>
        <Link href="/app/settings/password">Change password →</Link>
      </section>
      <form className="panel settings-panel" onSubmit={save}>
        <h3>Workspace timezone</h3>
        <p className="muted">
          Used for future publishing schedules. Choose an IANA timezone.
        </p>
        <label htmlFor="timezone">Timezone</label>
        <input
          id="timezone"
          name="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          list="timezones"
          maxLength={80}
          required
        />
        <datalist id="timezones">
          {[
            "Asia/Kolkata",
            "Asia/Calcutta",
            "UTC",
            "Europe/Berlin",
            "Europe/London",
            "America/New_York",
          ].map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="message success" role="status">
            {message}
          </p>
        )}
        <button disabled={busy || timezone === me.workspace.timezone}>
          {busy ? "Saving…" : "Save timezone"}
        </button>
      </form>
      <UsageSettings />
      <InstagramPanel />
    </>
  );
}
export function Password() {
  const { me } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setError("");
    setMessage("");
    if (f.get("newPassword") !== f.get("confirm")) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api(
        "/api/auth/change-password",
        {
          currentPassword: f.get("currentPassword"),
          newPassword: f.get("newPassword"),
        },
        { "X-CSRF-Token": me.csrfToken },
      );
      form.reset();
      setMessage("Password changed. Other sessions have been signed out.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change password.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link href="/app/settings">← Settings</Link>
      <div className="page-heading">
        <h1>Change password</h1>
        <p className="muted">Use a unique password with 12–128 characters.</p>
      </div>
      <form className="panel settings-panel" onSubmit={save}>
        <label>
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        <label>
          New password
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <label>
          Confirm new password
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        {error && (
          <p role="alert" className="message error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="message success">
            {message}
          </p>
        )}
        <button disabled={busy}>
          {busy ? "Updating…" : "Change password"}
        </button>
      </form>
    </>
  );
}
