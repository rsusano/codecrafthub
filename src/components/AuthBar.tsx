"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function AuthBar() {
  const {
    configured,
    ready,
    user,
    email,
    syncing,
    authError,
    authMessage,
    signInWithEmail,
    signOut,
    clearAuthFeedback,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  if (!ready) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    clearAuthFeedback();
    await signInWithEmail(draft);
    setSending(false);
  }

  return (
    <div className="auth-bar">
      <div className="auth-bar-main">
        {user ? (
          <>
            <p className="auth-status">
              Signed in as <strong>{email}</strong>
              {syncing ? " · syncing…" : " · cloud save on"}
            </p>
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
            <p className="auth-status">
              {configured
                ? "Guest mode: courses & chat stay on this browser. Sign in to save them to your account."
                : "Guest mode: courses & chat stay on this browser only."}
            </p>
            {configured ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  clearAuthFeedback();
                  setOpen((value) => !value);
                }}
              >
                {open ? "Close" : "Sign in with email"}
              </button>
            ) : null}
          </>
        )}
      </div>

      {open && !user && configured ? (
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={sending || !draft.trim()}
          >
            {sending ? "Sending…" : "Send magic link"}
          </button>
        </form>
      ) : null}

      {authMessage ? <p className="notice success">{authMessage}</p> : null}
      {authError ? <p className="notice error">{authError}</p> : null}
    </div>
  );
}
