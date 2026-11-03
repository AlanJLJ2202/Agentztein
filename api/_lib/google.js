// Google sign-in setup, checked against the real services (no secrets involved):
//   1. Supabase says whether its Google provider is on       GET  {SUPABASE_URL}/auth/v1/settings
//   2. Supabase's Google redirect names the OAuth client      GET  {SUPABASE_URL}/auth/v1/authorize?provider=google
//      it is configured with; it must be the same client id the browser button uses (GOOGLE_CLIENT_ID),
//      otherwise Supabase rejects the Google ID token ("Unacceptable audience").
// The browser gets the Google ID token from Google Identity Services and hands it to Supabase
// (signInWithIdToken), which verifies its signature with Google's keys, the audience and the nonce.
import { supabaseConfig } from "./env.js";

export const CLIENT_ID = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

/** The public OAuth client id for the Google button, or "" when unset or malformed. */
export function googleClientId() {
  const id = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  return CLIENT_ID.test(id) ? id : "";
}

/**
 * @typedef {"ok" | "not-configured" | "disabled" | "mismatch" | "no-client-id" | "unknown"} GoogleStatus
 * @typedef {{ status: GoogleStatus, enabled: boolean | null, supabaseClientId: string | null }} GoogleSetup
 */

/** @type {{ at: number, value: GoogleSetup } | null} */
let cache = null;
const TTL_MS = 5 * 60_000;

/**
 * @param {typeof fetch} [fetchImpl]
 * @param {{ fresh?: boolean }} [opts]
 * @returns {Promise<GoogleSetup>}
 */
export async function googleSetup(fetchImpl = fetch, opts = {}) {
  if (!opts.fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = await check(fetchImpl);
  if (value.status !== "unknown") cache = { at: Date.now(), value };
  return value;
}

/** @param {typeof fetch} fetchImpl @returns {Promise<GoogleSetup>} */
async function check(fetchImpl) {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) return { status: "not-configured", enabled: null, supabaseClientId: null };
  let enabled = null;
  try {
    const res = await fetchImpl(`${url}/auth/v1/settings`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const body = await res.json();
      enabled = Boolean(body?.external?.google);
    }
  } catch {
    /* unknown */
  }
  if (enabled === null) return { status: "unknown", enabled, supabaseClientId: null };
  if (!enabled) return { status: "disabled", enabled, supabaseClientId: null };

  let supabaseClientId = null;
  try {
    const res = await fetchImpl(`${url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(url)}`, {
      headers: { apikey: anonKey },
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
    });
    const location = res.headers.get("location") ?? "";
    if (location.startsWith("https://accounts.google.com/")) supabaseClientId = new URL(location).searchParams.get("client_id");
  } catch {
    /* unknown */
  }
  const mine = googleClientId();
  if (!mine) return { status: "no-client-id", enabled, supabaseClientId };
  if (supabaseClientId && supabaseClientId !== mine) return { status: "mismatch", enabled, supabaseClientId };
  return { status: supabaseClientId ? "ok" : "unknown", enabled, supabaseClientId };
}

/** Forget the cached check (tests). */
export function resetGoogleSetup() {
  cache = null;
}
