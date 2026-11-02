// GET /api/config: the public sign-in settings the app needs, and which server variables are still missing.
import { missingConfig, supabaseConfig } from "./_lib/env.js";
import { handle, json } from "./_lib/http.js";

export const GET = handle(async () => {
  const { url, anonKey } = supabaseConfig();
  const missing = missingConfig();
  return json({ supabaseUrl: url || null, supabaseAnonKey: anonKey || null, ready: missing.length === 0, missing });
});
