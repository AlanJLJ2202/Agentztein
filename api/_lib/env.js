// Server configuration. Everything is read from environment variables set in Vercel (see README).

export function supabaseConfig() {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
  return { url, anonKey };
}

/** Names of the variables that are still missing (names only, never values). */
export function missingConfig() {
  const { url, anonKey } = supabaseConfig();
  /** @type {string[]} */
  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!anonKey) missing.push("SUPABASE_ANON_KEY");
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if ((process.env.KEYS_ENCRYPTION_SECRET ?? "").length < 32) missing.push("KEYS_ENCRYPTION_SECRET");
  return missing;
}
