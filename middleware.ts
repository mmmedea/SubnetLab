import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/utils/supabase/config";
import { safeNext } from "@/utils/security/auth-validation.js";
import { shouldRedirectVerifiedSession } from "@/utils/security/signup-security.js";

const protectedRoutes = ["/dashboard", "/planner", "/ipam", "/practice", "/progress", "/settings"];

export async function middleware(req: NextRequest) {
  let response = NextResponse.next({ request: req });
  const path = req.nextUrl.pathname;
  const isProtected = protectedRoutes.some((route) => path === route || path.startsWith(route + "/"));
  const isAuth = path === "/" || ["/login", "/signup"].includes(path);

  try {
    const { url, key } = getSupabaseConfig();
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    // Validate the session with Supabase. Never trust the cookie payload alone.
    const { data: { user }, error } = await supabase.auth.getUser();
    if (isProtected && (error || !user)) {
      const target = new URL("/login", req.url);
      target.searchParams.set("next", path + req.nextUrl.search);
      const redirect = NextResponse.redirect(target);
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    }
    if (isProtected && user) {
      const { data: securityProfile, error: securityProfileError } = await supabase
        .from("profiles")
        .select("password_configured_at")
        .eq("id", user.id)
        .maybeSingle();
      if (securityProfileError || !securityProfile?.password_configured_at) {
        const target = new URL("/google-password", req.url);
        target.searchParams.set("next", path + req.nextUrl.search);
        const redirect = NextResponse.redirect(target);
        response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
        redirect.headers.set("Cache-Control", "private, no-store");
        return redirect;
      }
    }
    if (isProtected && user) {
      const { data: emailOtpVerified, error: emailOtpError } = await supabase.rpc("is_email_otp_session_verified");
      if (emailOtpError || !emailOtpVerified) {
        const target = new URL("/verify-email", req.url);
        target.searchParams.set("next", path + req.nextUrl.search);
        const redirect = NextResponse.redirect(target);
        response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
        redirect.headers.set("Cache-Control", "private, no-store");
        return redirect;
      }
    }
    if (path === "/verify-email" && user) {
      const { data: verified, error: verificationError } = await supabase.rpc("is_email_otp_session_verified");
      if (!verificationError && shouldRedirectVerifiedSession(verified)) {
        const redirect = NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get("next")), req.url));
        response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
        redirect.headers.set("Cache-Control", "private, no-store");
        return redirect;
      }
    }

    if (isAuth && user) {
      const destination = path === "/" ? "/dashboard" : safeNext(req.nextUrl.searchParams.get("next"));
      const redirect = NextResponse.redirect(new URL(destination, req.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    }
    if (isProtected) response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    if (isProtected) return NextResponse.redirect(new URL("/login?error=auth_unavailable", req.url));
    return response;
  }
}

export const config = {
  matcher: ["/", "/verify-email", "/dashboard/:path*", "/planner/:path*", "/ipam/:path*", "/practice/:path*", "/progress/:path*", "/settings/:path*", "/login", "/signup"],
};
