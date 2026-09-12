"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import SiteHeader from "@/components/SiteHeader";

function ResetPasswordForm() {
  const {
    ready,
    user,
    authError,
    authMessage,
    updatePassword,
    clearAuthFeedback,
  } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    clearAuthFeedback();
  }, [clearAuthFeedback]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 6) return;
    if (password !== confirm) return;
    setBusy(true);
    const ok = await updatePassword(password);
    setBusy(false);
    if (ok) setDone(true);
  }

  if (!ready) {
    return <p className="empty">Loading…</p>;
  }

  return (
    <section className="panel auth-reset-panel">
      <h1>Reset password</h1>
      {!user && !done ? (
        <p className="hint">
          Open the reset link from your email first. If you already did, wait a
          moment and refresh.
        </p>
      ) : null}

      {done ? (
        <p className="notice success">
          Password updated.{" "}
          <a href="/" className="assistant-link">
            Back to CodeCraftHub
          </a>
        </p>
      ) : (
        <form className="auth-modal-form" onSubmit={onSubmit}>
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </label>
          {password && confirm && password !== confirm ? (
            <p className="notice error">Passwords do not match.</p>
          ) : null}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || password.length < 6 || password !== confirm || !user}
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      )}

      {authMessage ? <p className="notice success">{authMessage}</p> : null}
      {authError ? <p className="notice error">{authError}</p> : null}
    </section>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthProvider>
      <SiteHeader />
      <main className="shell">
        <ResetPasswordForm />
      </main>
    </AuthProvider>
  );
}
