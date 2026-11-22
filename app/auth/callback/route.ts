import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/utils/supabase/config";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/dashboard";
  const path = value.split("?")[0];
  return ["/dashboard", "/planner", "/ipam", "/practice", "/progress", "/settings"].some((route) => path === route || path.startsWith(route + "/")) ? value : "/dashboard";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = "/dashboard";

  if (!code) return NextResponse.redirect(new URL("/login?error=oauth_callback", requestUrl.origin));

  let config;
  try {
    config = getSupabaseConfig();
  } catch {
    return NextResponse.redirect(new URL("/login?error=auth_unavailable", requestUrl.origin));
  }

  const response = NextResponse.redirect(new URL(next, requestUrl.origin));
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const failed = NextResponse.redirect(new URL("/login?error=oauth_callback", requestUrl.origin));
    response.cookies.getAll().forEach((cookie) => failed.cookies.set(cookie));
    return failed;
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
