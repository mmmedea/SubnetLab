import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/utils/supabase/admin";
import { getSupabaseConfig } from "@/utils/supabase/config";
import { requireSameOrigin } from "@/utils/security/require-same-origin";
import {
  buildSignupRateLimitKeys,
  decideSignupRateLimits,
  noStoreHeaders,
  normalizeEmail,
  readSessionIdFromAccessToken,
  safeSignupLogRecord,
  selectTrustedIp,
} from "@/utils/security/signup-security.js";

export const runtime = "nodejs";

const invalidCodeMessage = "Invalid or expired verification code.";
const unavailableMessage = "Verification is temporarily unavailable.";

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  cookieCarrier?: NextResponse,
) {
  const response = NextResponse.json(body, { status, headers: noStoreHeaders() });
  cookieCarrier?.cookies.getAll().forEach((cookie) => {
    const { name, value, ...options } = cookie;
    response.cookies.set(name, value, options);
  });
  return response;
}

function isValidEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  const cookieCarrier = NextResponse.next();

  if (!requireSameOrigin(request)) {
    return jsonResponse({ success: false, error: "Forbidden." }, 403, cookieCarrier);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid verification request." }, 400, cookieCarrier);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ success: false, error: "Invalid verification request." }, 400, cookieCarrier);
  }

  const value = body as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("email") || !keys.includes("token")) {
    return jsonResponse({ success: false, error: "Invalid verification request." }, 400, cookieCarrier);
  }

  const email = normalizeEmail(value.email);
  const token = value.token;
  if (!isValidEmail(email) || typeof token !== "string" || !/^\d{6}$/.test(token)) {
    return jsonResponse({ success: false, error: invalidCodeMessage }, 400, cookieCarrier);
  }

  const trustedIp = selectTrustedIp(request.headers);
  const keysForLimit = trustedIp ? buildSignupRateLimitKeys(trustedIp, email) : null;
  if (!keysForLimit) {
    return jsonResponse({ success: false, error: unavailableMessage }, 503, cookieCarrier);
  }

  try {
    const admin = createAdminClient();
    if (!admin) {
      return jsonResponse({ success: false, error: unavailableMessage }, 503, cookieCarrier);
    }

    const [ipLimit, emailLimit] = await Promise.all([
      admin.rpc("consume_api_rate_limit", {
        p_key_hash: keysForLimit.ipKeyHash,
        p_limit: 8,
        p_window_seconds: 900,
      }),
      admin.rpc("consume_api_rate_limit", {
        p_key_hash: keysForLimit.emailKeyHash,
        p_limit: 10,
        p_window_seconds: 900,
      }),
    ]);

    const limiterDecision = decideSignupRateLimits(ipLimit, emailLimit);
    if (limiterDecision === "unavailable") {
      console.warn(safeSignupLogRecord("signup_limiter_unavailable"));
      return jsonResponse({ success: false, error: unavailableMessage }, 503, cookieCarrier);
    }
    if (limiterDecision === "blocked") {
      return jsonResponse(
        { success: false, error: "Too many verification attempts. Please wait and try again." },
        429,
        cookieCarrier,
      );
    }

    let config;
    try {
      config = getSupabaseConfig();
    } catch {
      return jsonResponse({ success: false, error: unavailableMessage }, 503, cookieCarrier);
    }

    const supabase = createServerClient(config.url, config.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value, options }) => cookieCarrier.cookies.set(name, value, options));
        },
      },
    });

    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
    if (
      error ||
      !data.user ||
      data.user.email?.trim().toLowerCase() !== email
    ) {
      return jsonResponse({ success: false, error: invalidCodeMessage }, 400, cookieCarrier);
    }

    const session = data.session;
    if (!session || session.user.id !== data.user.id) {
      console.warn(safeSignupLogRecord("signup_grant_fallback"));
      return jsonResponse({ success: false, fallback: "email-otp" }, 200, cookieCarrier);
    }

    const sessionId = readSessionIdFromAccessToken(session.access_token);
    if (!sessionId) {
      console.warn(safeSignupLogRecord("signup_grant_fallback"));
      return jsonResponse({ success: false, fallback: "email-otp" }, 200, cookieCarrier);
    }

    const { data: grantId, error: grantError } = await admin.rpc("create_signup_otp_grant", {
      p_user_id: data.user.id,
      p_session_id: sessionId,
    });
    if (grantError || typeof grantId !== "string") {
      console.warn(safeSignupLogRecord("signup_grant_fallback"));
      return jsonResponse({ success: false, fallback: "email-otp" }, 200, cookieCarrier);
    }

    const { data: consumed, error: consumeError } = await admin.rpc("consume_signup_otp_grant", {
      p_grant_id: grantId,
      p_user_id: data.user.id,
      p_session_id: sessionId,
    });
    if (consumeError || consumed !== true) {
      console.warn(safeSignupLogRecord("signup_grant_fallback"));
      return jsonResponse({ success: false, fallback: "email-otp" }, 200, cookieCarrier);
    }

    return jsonResponse({ success: true }, 200, cookieCarrier);
  } catch {
    console.warn(safeSignupLogRecord("signup_verification_unavailable"));
    return jsonResponse({ success: false, error: unavailableMessage }, 503, cookieCarrier);
  }
}
