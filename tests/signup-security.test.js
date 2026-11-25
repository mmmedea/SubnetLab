import assert from "node:assert/strict";
import test from "node:test";
import { isValidSignupUsername, safeNext, shouldRedirectVerifiedSession } from "../utils/security/auth-validation.js";
import {
  buildSignupRateLimitKeys,
  decideSignupRateLimits,
  noStoreHeaders,
  normalizeEmail,
  readSessionIdFromAccessToken,
  safeSignupLogRecord,
  selectTrustedIp,
} from "../utils/security/signup-security.js";

const sessionId = "6f9619ff-8b86-4011-842d-00c04fc964ff";
const allowed = (limit = 8) => ({
  data: { allowed: true, limit, remaining: limit - 1, retry_after: 0, reset_at: 1770000000 },
  error: null,
});

test("parses only a UUID session_id from a JWT access token", () => {
  const payload = Buffer.from(JSON.stringify({ session_id: sessionId })).toString("base64url");
  assert.equal(readSessionIdFromAccessToken("header." + payload + ".signature"), sessionId);
  assert.equal(readSessionIdFromAccessToken("not-a-jwt"), null);
  const invalid = Buffer.from(JSON.stringify({ session_id: "not-a-uuid" })).toString("base64url");
  assert.equal(readSessionIdFromAccessToken("header." + invalid + ".signature"), null);
});

test("selects x-real-ip, then x-vercel-forwarded-for, and ignores x-forwarded-for", () => {
  assert.equal(selectTrustedIp({ "x-real-ip": "203.0.113.8", "x-vercel-forwarded-for": "198.51.100.2" }), "203.0.113.8");
  assert.equal(selectTrustedIp({ "x-vercel-forwarded-for": "198.51.100.2, 203.0.113.7", "x-forwarded-for": "192.0.2.9" }), "198.51.100.2");
  assert.equal(selectTrustedIp({ "x-forwarded-for": "192.0.2.9" }), null);
});

test("normalizes email for rate-limit keys and hashes the email independently of IP", () => {
  assert.equal(normalizeEmail("  User@Example.com "), "user@example.com");
  const first = buildSignupRateLimitKeys("203.0.113.8", "User@Example.com");
  const second = buildSignupRateLimitKeys("198.51.100.2", " user@example.com ");
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.emailKeyHash, second.emailKeyHash);
  assert.notEqual(first.ipKeyHash, second.ipKeyHash);
  assert.match(first.emailKeyHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(first.emailKeyHash, /user@example/i);
});

test("rejects when either independent limiter blocks", () => {
  const blockedIp = { data: { allowed: false, limit: 8, remaining: 0, retry_after: 60, reset_at: 1770000000 }, error: null };
  const blockedEmail = { data: { allowed: false, limit: 10, remaining: 0, retry_after: 60, reset_at: 1770000000 }, error: null };
  assert.equal(decideSignupRateLimits(blockedIp, allowed(10)), "blocked");
  assert.equal(decideSignupRateLimits(allowed(), blockedEmail), "blocked");
  assert.equal(decideSignupRateLimits(allowed(), allowed(10)), "allowed");
});

test("fails closed for limiter RPC errors and malformed responses", () => {
  assert.equal(decideSignupRateLimits({ data: null, error: new Error("offline") }, allowed(10)), "unavailable");
  assert.equal(decideSignupRateLimits({ data: { allowed: "true" }, error: null }, allowed(10)), "unavailable");
  assert.equal(decideSignupRateLimits(allowed(), { data: { allowed: true }, error: null }), "unavailable");
});

test("response headers always include Cache-Control: no-store", () => {
  assert.equal(noStoreHeaders({ "X-Test": "ok" }).get("Cache-Control"), "no-store");
  assert.equal(noStoreHeaders({ "Cache-Control": "public" }).get("Cache-Control"), "no-store");
});

test("safe auth log records never include supplied personal or token data", () => {
  const record = safeSignupLogRecord("signup_grant_fallback", {
    email: "user@example.com",
    ip: "203.0.113.8",
    token: "123456",
    grantId: "private-grant-id",
  });
  assert.equal(record, JSON.stringify({ level: "warn", event: "signup_grant_fallback" }));
  assert.doesNotMatch(record, /user@example|203\.0\.113|123456|private-grant-id/);
});

test("validates usernames from 3 through 20 letters, digits, and underscores", () => {
  assert.equal(isValidSignupUsername("abc"), true);
  assert.equal(isValidSignupUsername("A_123456789012345678"), true);
  assert.equal(isValidSignupUsername("ab"), false);
  assert.equal(isValidSignupUsername("a".repeat(21)), false);
  assert.equal(isValidSignupUsername("user.name"), false);
});

test("safeNext accepts same-origin workspace paths and rejects external or encoded escapes", () => {
  assert.equal(safeNext("/planner?tab=saved"), "/planner?tab=saved");
  assert.equal(safeNext("/dashboard/plan/1"), "/dashboard/plan/1");
  assert.equal(safeNext("//evil.example/path"), "/dashboard");
  assert.equal(safeNext("https://evil.example/path"), "/dashboard");
  assert.equal(safeNext("/planner\\\\evil"), "/dashboard");
  assert.equal(safeNext("/%2f%2fevil.example"), "/dashboard");
  assert.equal(safeNext("/dashboard/%252f%252fevil.example"), "/dashboard");
  assert.equal(safeNext("/dashboard/%252525252f%252525252fevil.example"), "/dashboard");
  assert.equal(safeNext("/reset-password"), "/dashboard");
  assert.equal(safeNext("/reset-password", { allowResetPassword: true }), "/reset-password");
});

test("redirects away from the OTP page only when verification is strictly true", () => {
  assert.equal(shouldRedirectVerifiedSession(true), true);
  assert.equal(shouldRedirectVerifiedSession(false), false);
  assert.equal(shouldRedirectVerifiedSession(null), false);
});
