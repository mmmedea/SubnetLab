"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [busy, setBusy] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim())) { setError("Please enter a valid email address."); setBusy(false); return; }
    try {
      const { error: requestError } = await createClient().auth.resetPasswordForEmail(email.trim());
      if (requestError) throw requestError;
      setStep("verify");
      setCode("");
      setResendSeconds(60);
      setNotice("If this address is registered, a six-digit password reset code has been sent. Check your inbox and spam folder.");
    } catch (err) {
      const raw = (err as { message?: string; status?: number })?.message?.toLowerCase() || "";
      setError(raw.includes("rate limit") || raw.includes("too many") ? "Too many reset requests. Please wait 60 seconds and try again." : raw.includes("network") || raw.includes("fetch failed") ? "Unable to connect. Please check your internet connection and try again." : "We could not send the recovery email. The email service rejected the request. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: verifyError } = await createClient().auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: "recovery",
      });
      if (verifyError) throw verifyError;
      router.replace("/reset-password");
      router.refresh();
    } catch (err) {
      const raw = (err as { message?: string })?.message?.toLowerCase() || "";
      setError(raw.includes("expired") ? "This code has expired. Request a new code to continue." : "Invalid verification code. Please check your email and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: resendError } = await createClient().auth.resetPasswordForEmail(email.trim());
      if (resendError) throw resendError;
      setCode("");
      setResendSeconds(60);
      setNotice("A new six-digit password reset code has been sent, if the account exists.");
    } catch (err) {
      const raw = (err as { message?: string })?.message?.toLowerCase() || "";
      setError(raw.includes("rate limit") || raw.includes("too many") ? "Please wait 60 seconds before requesting another code." : "We could not resend the recovery email. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <Link className="brand" href="/">Subnet<span>Lab</span></Link>
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>{step === "request" ? "Reset password" : "Enter your reset code"}</h1>
        <p className="muted">{step === "request"
          ? "Enter your account email. We’ll send a six-digit code, not a password reset link."
          : <>Enter the six-digit code sent to <b>{email}</b>. After verification, you can choose a new password.</>}</p>
        {step === "request" ? (
          <form onSubmit={requestCode}>
            <label>Email address
              <input className="input" type="email" required autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
            </label>
            <button className="button primary" disabled={busy || !email.trim()}>{busy ? "Sending…" : "Send reset code"}</button>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <label>6-digit reset code
              <input className="input mono" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
            </label>
            <button className="button primary" disabled={busy || !/^\d{6}$/.test(code)}>{busy ? "Verifying…" : "Verify code"}</button>
            <button type="button" className="button secondary-action" disabled={busy || resendSeconds > 0} onClick={() => void resendCode()}>
              {resendSeconds > 0 ? `Resend code in 00:${String(resendSeconds).padStart(2, "0")}` : "Resend code"}
            </button>
          </form>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        <p className="auth-foot"><Link className="link" href="/login">Return to sign in</Link></p>
      </section>
    </main>
  );
}
