export function requireSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;

  try {
    const parsedOrigin = new URL(origin);
    const requestOrigin = new URL(request.url);
    return parsedOrigin.origin === requestOrigin.origin && !parsedOrigin.username && !parsedOrigin.password;
  } catch {
    return false;
  }
}
