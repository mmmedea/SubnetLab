import { createHash } from "node:crypto";
import { isIP } from "node:net";

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeLogEvents = new Set([
  "signup_limiter_unavailable",
  "signup_grant_fallback",
  "signup_verification_unavailable",
]);

export function readSessionIdFromAccessToken(accessToken) {
  if (typeof accessToken !== "string") return null;
  const parts = accessToken.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof claims.session_id === "string" && sessionIdPattern.test(claims.session_id)
      ? claims.session_id
      : null;
  } catch {
    return null;
  }
}

export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function readHeader(headers, name) {
  if (headers && typeof headers.get === "function") return headers.get(name);
  if (!headers || typeof headers !== "object") return null;
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  if (!key) return null;
  const value = headers[key];
  return Array.isArray(value) ? value[0] ?? null : typeof value === "string" ? value : null;
}

export function selectTrustedIp(headers) {
  const realIp = readHeader(headers, "x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;

  const vercelForwardedFor = readHeader(headers, "x-vercel-forwarded-for");
  if (typeof vercelForwardedFor !== "string") return null;
  const firstAddress = vercelForwardedFor.split(",", 1)[0]?.trim();
  return firstAddress && isIP(firstAddress) ? firstAddress : null;
}

function hashNamespacedKey(namespace, value) {
  return createHash("sha256").update(namespace + ":" + value, "utf8").digest("hex");
}

export function buildSignupRateLimitKeys(ip, email) {
  const normalizedEmail = normalizeEmail(email);
  if (typeof ip !== "string" || !isIP(ip) || !normalizedEmail) return null;
  return {
    ipKeyHash: hashNamespacedKey("signup-email-verify:ip", ip),
    emailKeyHash: hashNamespacedKey("signup-email-verify:email", normalizedEmail),
  };
}

function isLimiterPayload(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.allowed === "boolean" &&
    Number.isFinite(value.limit) &&
    value.limit > 0 &&
    Number.isFinite(value.remaining) &&
    value.remaining >= 0 &&
    Number.isFinite(value.retry_after) &&
    value.retry_after >= 0 &&
    Number.isFinite(value.reset_at)
  );
}

export function decideSignupRateLimits(ipResult, emailResult) {
  const results = [ipResult, emailResult];
  if (results.some((result) => !result || result.error || !isLimiterPayload(result.data))) {
    return "unavailable";
  }
  if (results.some((result) => result.data.allowed !== true)) return "blocked";
  return "allowed";
}

export function noStoreHeaders(additionalHeaders = {}) {
  const headers = new Headers(additionalHeaders);
  headers.set("Cache-Control", "no-store");
  return headers;
}

export function safeSignupLogRecord(event) {
  const safeEvent = safeLogEvents.has(event) ? event : "signup_verification_unavailable";
  return JSON.stringify({ level: "warn", event: safeEvent });
}

export function shouldRedirectVerifiedSession(value) {
  return value === true;
}
