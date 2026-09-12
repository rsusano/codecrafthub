"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";

type AuthMode = "signin" | "signup" | "reset";

export default function SiteHeader() {
  const {
    configured,
    ready,
    user,
    email,
    syncing,
    authError,
    authMessage,
    signInWithPassword,
    signUpWithPassword,
    signInWithGoogle,
    signInWithMagicLink,
    resetPassword,
    signOut,
    clearAuthFeedback,
  } = useAuth();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [emailDraft, setEmailDraft] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!ready) return null;

  function openModal(next: AuthMode = "signin") {
    clearAuthFeedback();
    setMode(next);
    setOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!emailDraft.trim()) return;
    setBusy(true);
    clearAuthFeedback();

    let ok = false;
    if (mode === "signin") {
      ok = await signInWithPassword(emailDraft, passwordDraft);
    } else if (mode === "signup") {
      ok = await signUpWithPassword(emailDraft, passwordDraft);
    } else {
      ok = await resetPassword(emailDraft);
    }

    setBusy(false);
    if (ok && mode !== "reset") {
      setOpen(false);
      setPasswordDraft("");
    }
  }

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="site-brand" href="/">
            <span className="site-brand-mark">CCH</span>
            <span>
              CodeCraftHub
              <small>by Rafael Susano</small>
            </span>
          </a>

          <div className="site-header-actions">
            {user ? (
              <>
                <span className="site-user">
                  {email}
                  {syncing ? " · syncing…" : ""}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void signOut()}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <span className="site-user muted">Guest</span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => openModal("signin")}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {open && !user ? (
        <div
          className="auth-modal-backdrop"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="auth-modal-head">
              <h2 id="auth-modal-title">
                {mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Reset password"}
              </h2>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            <p className="auth-modal-lede">
              Save courses and AI chat to your account. Guests can still try the
              app on this browser.
            </p>

            {!configured ? (
              <p className="notice error">
                Login is not configured yet. Add{" "}
                <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
                <code>.env.local</code> (and Vercel), then restart the app.
              </p>
            ) : null}

            {mode !== "reset" ? (
              <button
                type="button"
                className="btn btn-secondary auth-google"
                disabled={busy}
                onClick={() => void signInWithGoogle()}
              >
                Continue with Google
              </button>
            ) : null}

            {mode !== "reset" ? <div className="auth-divider">or</div> : null}

            <form className="auth-modal-form" onSubmit={onSubmit}>
              <label>
                Email
                <input
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </label>

              {mode !== "reset" ? (
                <label>
                  Password
                  <input
                    type="password"
                    value={passwordDraft}
                    onChange={(e) => setPasswordDraft(e.target.value)}
                    placeholder={
                      mode === "signup" ? "At least 6 characters" : "Your password"
                    }
                    required
                    minLength={6}
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                  />
                </label>
              ) : null}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !emailDraft.trim()}
              >
                {busy
                  ? "Please wait…"
                  : mode === "signin"
                    ? "Sign in"
                    : mode === "signup"
                      ? "Create account"
                      : "Send reset link"}
              </button>
            </form>

            {mode === "signin" ? (
              <div className="auth-modal-links">
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    clearAuthFeedback();
                    setMode("reset");
                  }}
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    clearAuthFeedback();
                    setMode("signup");
                  }}
                >
                  Create an account
                </button>
                <button
                  type="button"
                  className="linkish"
                  disabled={busy || !emailDraft.trim()}
                  onClick={() => void signInWithMagicLink(emailDraft)}
                >
                  Email me a magic link instead
                </button>
              </div>
            ) : null}

            {mode === "signup" ? (
              <div className="auth-modal-links">
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    clearAuthFeedback();
                    setMode("signin");
                  }}
                >
                  Already have an account? Sign in
                </button>
              </div>
            ) : null}

            {mode === "reset" ? (
              <div className="auth-modal-links">
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    clearAuthFeedback();
                    setMode("signin");
                  }}
                >
                  Back to sign in
                </button>
              </div>
            ) : null}

            {authMessage ? <p className="notice success">{authMessage}</p> : null}
            {authError ? <p className="notice error">{authError}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
