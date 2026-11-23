"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const valid = password.length >= 10 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!valid) return setError("Use at least 10 characters with uppercase, lowercase, number, and symbol.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage("Your password has been updated. Redirecting to sign in…");
      window.setTimeout(() => router.replace("/login"), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password. Return to password recovery and request a new six-digit code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <Link className="brand" href="/">Subnet<span>Lab</span></Link>
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Choose a new password</h1>
        <p className="muted">Your six-digit recovery code has been verified. Create a new password for your SubnetLab account.</p>
        <form onSubmit={submit}>
          <label>New password
            <input className="input" type="password" autoComplete="new-password" minLength={10} maxLength={72} required value={password} onChange={event => setPassword(event.target.value)} />
          </label>
          <label>Confirm password
            <input className="input" type="password" autoComplete="new-password" minLength={10} maxLength={72} required value={confirm} onChange={event => setConfirm(event.target.value)} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          {message && <p className="auth-notice" role="status">{message}</p>}
          <button className="button primary" disabled={busy || !valid || password !== confirm}>{busy ? "Updating…" : "Update password"}</button>
        </form>
        <p className="auth-foot"><Link className="link" href="/login">Return to sign in</Link></p>
      </section>
    </main>
  );
}
