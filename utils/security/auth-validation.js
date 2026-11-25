const workspaceDestinations = ["/dashboard", "/planner", "/ipam", "/practice", "/progress", "/settings"];
const sameOrigin = "https://safe-next.invalid";

function containsControlCharacter(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

export function isValidSignupUsername(value) {
  return typeof value === "string" && /^[A-Za-z0-9_]{3,20}$/.test(value);
}

/**
 * Accepts only same-origin paths within the established workspace destinations.
 * The callback may opt into /reset-password, as it did before this helper existed.
 * @param {string | null | undefined} value
 * @param {{ allowResetPassword?: boolean }} [options]
 * @returns {string}
 */
export function safeNext(value, options = {}) {
  const fallback = "/dashboard";
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2048 ||
    value !== value.trim() ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    containsControlCharacter(value)
  ) return fallback;

  let decoded = value;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return fallback;
    }
    if (next === decoded) break;
    decoded = next;
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    containsControlCharacter(decoded)
  ) return fallback;

  const rawPath = value.split(/[?#]/, 1)[0];
  const decodedPath = decoded.split(/[?#]/, 1)[0];
  if (rawPath.includes("//") || decodedPath.includes("//") || /%(?:25)*(?:2f|5c)/i.test(decoded)) return fallback;

  let parsed;
  try {
    parsed = new URL(value, sameOrigin);
  } catch {
    return fallback;
  }
  if (parsed.origin !== sameOrigin || parsed.username || parsed.password) return fallback;

  const allowedDestinations = options.allowResetPassword
    ? [...workspaceDestinations, "/reset-password"]
    : workspaceDestinations;
  return allowedDestinations.some((path) => parsed.pathname === path || parsed.pathname.startsWith(path + "/"))
    ? value
    : fallback;
}
