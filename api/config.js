// GET /api/config: the public sign-in settings the app needs, and which server variables are still missing.
//   database: whether the app's tables can be reached, and if not, the cause (no secrets)
//   ?check=google  re-checks the Google sign-in setup now instead of using the 5-minute cache
import { dbHealth } from "./_lib/db.js";
import { DB_HINTS } from "./_lib/dberror.js";
import { missingConfig, supabaseConfig } from "./_lib/env.js";
import { googleClientId, googleSetup } from "./_lib/google.js";
import { handle, json } from "./_lib/http.js";

export const GET = handle(async (request) => {
  const { url, anonKey } = supabaseConfig();
  const missing = missingConfig();
  const fresh = new URL(request.url).searchParams.get("check") === "google";
  const [google, dbIssue] = await Promise.all([
    googleSetup(fetch, { fresh }),
    process.env.DATABASE_URL ? dbHealth() : Promise.resolve(/** @type {const} */ ("missing")),
  ]);
  return json({
    supabaseUrl: url || null,
    supabaseAnonKey: anonKey || null,
    ready: missing.length === 0 && !dbIssue,
    missing,
    database: dbIssue ? { status: dbIssue, hint: DB_HINTS[dbIssue] } : { status: "ok" },
    google: {
      clientId: googleClientId() || null,
      status: google.status,
      enabled: google.enabled,
      // previews live on changing *.vercel.app hosts that can't all be listed in Google Cloud as
      // JavaScript origins, so there the app uses Supabase's redirect flow instead of the Google button
      button: Boolean(googleClientId()) && process.env.VERCEL_ENV !== "preview",
    },
  });
});
