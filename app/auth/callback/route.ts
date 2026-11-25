import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/utils/supabase/config";
import { safeNext } from "@/utils/security/auth-validation.js";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNext(requestUrl.searchParams.get("next"), { allowResetPassword: true });
  const providerError = requestUrl.searchParams.get("error");
  const providerDescription = requestUrl.searchParams.get("error_description") || providerError;

  if (providerError) {
    const failed = new URL("/login", requestUrl.origin);
    failed.searchParams.set("error", "oauth_callback");
    if (providerDescription) failed.searchParams.set("reason", providerDescription.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 220));
    return NextResponse.redirect(failed);
  }
  if (!code) return NextResponse.redirect(new URL("/login?error=oauth_callback", requestUrl.origin));

  let config;
  try {
    config = getSupabaseConfig();
  } catch {
    return NextResponse.redirect(new URL("/login?error=auth_unavailable", requestUrl.origin));
  }

  const googleDestination = new URL("/google-password", requestUrl.origin);
  googleDestination.searchParams.set("next", next);
  const response = NextResponse.redirect(googleDestination);
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let exchangeError: Error | null = null;
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    exchangeError = error;
  } catch (error) {
    exchangeError = error instanceof Error ? error : new Error("Session exchange failed");
  }
  if (!exchangeError && requestUrl.searchParams.get("terms") === "1") {
    const acceptedAt = new Date().toISOString();
    const { data: userData, error: consentError } = await supabase.auth.updateUser({ data: { terms_accepted_at: acceptedAt } });
    if (consentError || !userData.user) {
      const failed = NextResponse.redirect(new URL("/login?error=oauth_callback&reason=consent_record_failed", requestUrl.origin));
      response.cookies.getAll().forEach((cookie) => failed.cookies.set(cookie));
      return failed;
    }
  }

  if (exchangeError) {
    const failedUrl = new URL("/login", requestUrl.origin);
    failedUrl.searchParams.set("error", "oauth_callback");
    failedUrl.searchParams.set("reason", exchangeError.message.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 220));
    const failed = NextResponse.redirect(failedUrl);
    response.cookies.getAll().forEach((cookie) => failed.cookies.set(cookie));
    return failed;
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
