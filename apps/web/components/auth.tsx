"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand } from "./brand";
import { api, ApiError, safeNext } from "../lib/api";
type Mode =
  | "sign-in"
  | "create-account"
  | "forgot-password"
  | "check-email"
  | "verify-email"
  | "reset-password";
export default function Auth({ mode }: { mode: Mode }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [show, setShow] = useState(false),
    [next, setNext] = useState("/app"),
    [token, setToken] = useState(""),
    [verificationError, setVerificationError] = useState(false),
    [recovery, setRecovery] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setNext(safeNext(q.get("next")));
    setToken(q.get("token") || "");
    setVerificationError(q.has("error"));
    setRecovery(q.get("kind") === "reset");
  }, []);
  const titles: Record<Mode, string> = {
    "sign-in": "Welcome back.",
    "create-account": "A space for your ideas.",
    "forgot-password": "Let’s get you back in.",
    "check-email": "Check your email.",
    "verify-email": "Continue with your account.",
    "reset-password": "A fresh start.",
  };
  const descriptions: Record<Mode, string> = {
    "sign-in": "Sign in to your personal video workspace.",
    "create-account": "Create your account. Let curiosity do the rest.",
    "forgot-password": "We’ll send a secure link to reset your password.",
    "check-email":
      "If the address is eligible, a link will be sent. Follow it to continue.",
    "verify-email": "Follow the verification link in your email, then sign in. If you still need to verify, request another link below.",
    "reset-password": "Choose a new password for your account.",
  };
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const f = new FormData(event.currentTarget);
    const email = String(f.get("email") || "");
    const password = String(f.get("password") || "");
    const callbackURL =
      location.origin + "/verify-email?next=" + encodeURIComponent(next);
    try {
      if (mode === "sign-in") {
        await api("/api/auth/sign-in/email", { email, password });
        location.assign(next);
      } else if (mode === "create-account") {
        if (password !== f.get("confirm"))
          throw new Error("The passwords do not match.");
        await api("/api/auth/sign-up/email", { email, password, callbackURL });
        location.assign("/check-email?next=" + encodeURIComponent(next));
      } else if (mode === "forgot-password") {
        await api("/api/auth/request-password-reset", {
          email,
          redirectTo: location.origin + "/reset-password",
        });
        location.assign("/check-email?kind=reset");
      } else if (mode === "check-email") {
        await api(
          recovery
            ? "/api/auth/request-password-reset"
            : "/api/auth/send-verification-email",
          recovery
            ? { email, redirectTo: location.origin + "/reset-password" }
            : { email, callbackURL },
        );
        setNotice("If your account is eligible, a new link has been sent.");
      } else if (mode === "reset-password") {
        if (!token)
          throw new Error(
            "This link is missing its reset token. Request a new link.",
          );
        if (password !== f.get("confirm"))
          throw new Error("The passwords do not match.");
        await api("/api/auth/reset-password", { token, newPassword: password });
        setNotice("Password updated. You can now sign in.");
        history.replaceState(null, "", "/reset-password");
        setToken("");
      }
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403 && mode === "sign-in"
          ? "Please verify your email before signing in. You can request another verification link below."
          : e instanceof Error
            ? e.message
            : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const hasEmail = [
    "sign-in",
    "create-account",
    "forgot-password",
    "check-email",
  ].includes(mode);
  const hasPassword = ["sign-in", "create-account", "reset-password"].includes(
    mode,
  );
  return (
    <main className="auth-layout">
      <aside className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">A LITTLE CURIOSITY GOES A LONG WAY.</span>
          <h1>
            Ideas deserve
            <br />
            to be
            <br />
            <em>understood.</em>
          </h1>
          <p>Hindi. Hinglish. A world of things to explain.</p>
          <div className="auth-orbits">
            <span />
            <span />
            <b>✦</b>
          </div>
        </div>
        <p className="fine">YOUR OWN WORKSPACE. YOUR NEXT EXPLANATION.</p>
      </aside>
      <section className="auth-form-area">
        <Link className="back" href="/">
          ← Back to home
        </Link>
        <div className="auth-form">
          <span className="tag">NEWBERT AI VIDEO</span>
          <h2>
            {verificationError
              ? "This link could not be verified."
              : titles[mode]}
          </h2>
          <p className="muted">
            {verificationError
              ? "The link may have expired. Request a new verification email."
              : descriptions[mode]}
          </p>
          {mode === "verify-email" ? (
            <Link
              className="button full"
              href={
                (verificationError ? "/check-email" : "/sign-in") +
                "?next=" +
                encodeURIComponent(next)
              }
            >
              {verificationError ? "Request a new link" : "Continue to sign in"}{" "}
              →
            </Link>
          ) : (
            <form onSubmit={submit}>
              {hasEmail && (
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    maxLength={254}
                  />
                </label>
              )}
              {hasPassword && (
                <>
                  <label>
                    Password
                    <div className="password-input">
                      <input
                        aria-label="Password"
                        name="password"
                        type={show ? "text" : "password"}
                        required
                        minLength={mode === "sign-in" ? 1 : 12}
                        maxLength={128}
                        autoComplete={
                          mode === "sign-in"
                            ? "current-password"
                            : "new-password"
                        }
                      />
                      <button
                        className="show-password"
                        type="button"
                        onClick={() => setShow(!show)}
                        aria-label={show ? "Hide password" : "Show password"}
                      >
                        {show ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>
                  {mode !== "sign-in" && (
                    <p className="fine">
                      Use 12–128 characters. A long, unique phrase works well.
                    </p>
                  )}
                </>
              )}
              {(mode === "create-account" || mode === "reset-password") && (
                <label>
                  Confirm password
                  <input
                    name="confirm"
                    type={show ? "text" : "password"}
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </label>
              )}
              {mode === "sign-in" && (
                <Link className="form-link" href="/forgot-password">
                  Forgot password?
                </Link>
              )}
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
              <button
                className="full"
                disabled={busy || (mode === "reset-password" && !token)}
              >
                {busy
                  ? "Please wait…"
                  : (
                      {
                        "sign-in": "Sign in →",
                        "create-account": "Create account →",
                        "forgot-password": "Send reset link →",
                        "check-email": recovery
                          ? "Resend reset link →"
                          : "Resend verification email →",
                        "reset-password": "Update password →",
                      } as Record<string, string>
                    )[mode]}
              </button>
            </form>
          )}
          {mode === "verify-email" && !verificationError && (
            <p className="auth-switch">
              <Link href={"/check-email?next=" + encodeURIComponent(next)}>
                Request another verification link
              </Link>
            </p>
          )}
          {mode === "sign-in" && (
            <>
              <p className="auth-switch">
                New to Newbert?{" "}
                <Link href={"/create-account?next=" + encodeURIComponent(next)}>
                  Create an account
                </Link>
              </p>
              <Link
                className="fine"
                href={"/check-email?next=" + encodeURIComponent(next)}
              >
                Need another verification email?
              </Link>
            </>
          )}
          {mode === "create-account" && (
            <p className="auth-switch">
              Already have an account?{" "}
              <Link href={"/sign-in?next=" + encodeURIComponent(next)}>
                Sign in
              </Link>
            </p>
          )}
          {mode !== "sign-in" && mode !== "create-account" && (
            <p className="auth-switch">
              <Link href="/sign-in">← Back to sign in</Link>
            </p>
          )}
          {mode === "reset-password" && (
            <p className="auth-switch">
              <Link href="/forgot-password">Request a new reset link</Link>
            </p>
          )}
          {mode === "check-email" && (
            <p className="fine">
              Local development: email links are saved in the private local
              mailbox. No external email is sent.
            </p>
          )}
          <div className="auth-footnote">
            Private workspace · Secure sign-in · Early development
          </div>
        </div>
      </section>
    </main>
  );
}
