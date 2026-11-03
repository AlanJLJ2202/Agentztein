// Talks to the functions in /api with the user's Supabase session.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Config = { supabaseUrl: string | null; supabaseAnonKey: string | null; ready: boolean; missing: string[] };
export type ProviderInfo = { id: string; label: string; keysUrl: string };
export type SavedKey = { provider: string; hint: string; model: string | null; models: string[]; verifiedAt: string | null; updatedAt: string };
export type Verdict = "experiment" | "watch" | "skip";
export type Note = {
  id: string;
  title: string;
  url: string | null;
  discussionUrl: string | null;
  points: number | null;
  postedAt: string | null;
  capability: string | null;
  verdict: Verdict;
  gain: string;
  cost: string;
  why: string;
  provider: string;
  model: string;
  assessedAt: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
  }
}

export async function getConfig(): Promise<Config> {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Config;
  } catch {
    return { supabaseUrl: null, supabaseAnonKey: null, ready: false, missing: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "DATABASE_URL", "KEYS_ENCRYPTION_SECRET"] };
  }
}

export function api(supabase: SupabaseClient) {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
    if (!res.ok) throw new ApiError(body.error ?? `Error ${res.status}`, res.status, body.reason);
    return body as T;
  }
  return {
    keys: () => call<{ providers: ProviderInfo[]; keys: SavedKey[] }>("/api/keys"),
    saveKey: (provider: string, key: string) =>
      call<{ key: SavedKey; verified: boolean }>("/api/keys", { method: "POST", body: JSON.stringify({ provider, key }) }),
    setModel: (provider: string, model: string) =>
      call<{ key: SavedKey }>("/api/keys", { method: "PATCH", body: JSON.stringify({ provider, model }) }),
    removeKey: (provider: string) => call<{ ok: true }>(`/api/keys?provider=${encodeURIComponent(provider)}`, { method: "DELETE" }),
    notes: () => call<{ notes: Note[] }>("/api/radar"),
    triage: (provider: string | null, lang: string, effort: string | null) =>
      call<{ notes: Note[]; read: number; provider?: string; model?: string; effort?: string | null }>("/api/radar", {
        method: "POST",
        body: JSON.stringify({ provider, lang, effort }),
      }),
  };
}
export type Api = ReturnType<typeof api>;
