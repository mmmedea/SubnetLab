"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: requestError } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: location.origin + "/auth/callback?next=%2Freset-password",
      });
      if (requestError) throw requestError;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request a password reset. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <Link className="brand" href="/">Subnet<span>Lab</span></Link>
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Reset password</h1>
        {sent ? (
          <p className="muted" role="status">If that email is registered, a recovery link has been sent. Check your inbox and spam folder.</p>
        ) : (
          <form onSubmit={submit}>
            <label>Email address
              <input className="input" type="email" required autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="button primary" disabled={busy}>{busy ? "Sending…" : "Send recovery link"}</button>
          </form>
        )}
        <p className="auth-foot"><Link className="link" href="/login">Return to sign in</Link></p>
      </section>
    </main>
  );
}
