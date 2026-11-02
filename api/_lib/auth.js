// Who is calling: the Supabase session token (Google sign-in) is checked against Supabase Auth.
import { supabaseConfig } from "./env.js";
import { HttpError } from "./http.js";

/**
 * @param {Request} request
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ id: string, email: string | null }>}
 */
export async function requireUser(request, fetchImpl = fetch) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Sign in first");
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) throw new HttpError(503, "Sign-in is not configured yet");
  const res = await fetchImpl(`${url}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: anonKey },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401 || res.status === 403) throw new HttpError(401, "Your session expired; sign in again");
  if (!res.ok) throw new HttpError(502, "Could not check your session");
  const user = await res.json();
  if (!user || typeof user.id !== "string") throw new HttpError(401, "Sign in first");
  return { id: user.id, email: typeof user.email === "string" ? user.email : null };
}
