// Talks to the functions in /api with the user's Supabase session.
import type { SupabaseClient } from "@supabase/supabase-js";
import { T } from "./i18n.js";

export type GoogleStatus = "ok" | "not-configured" | "disabled" | "mismatch" | "no-client-id" | "unknown";
export type Config = {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  ready: boolean;
  missing: string[];
  google?: { clientId: string | null; status: GoogleStatus; enabled: boolean | null; button: boolean };
  database?: { status: "ok" | DbProblem; hint?: string };
};
export type DbProblem = "missing" | "url" | "ssl" | "unreachable" | "auth" | "schema";

/** The server's database diagnosis in the page's language. */
export function dbText(problem: string | undefined): string | null {
  const texts = T.db as unknown as Record<string, { en: string; es: string }>;
  if (!problem || !texts[problem] || problem === "title") return null;
  return texts[problem][document.documentElement.lang === "es" ? "es" : "en"];
}
export type ProviderInfo = { id: string; label: string; keysUrl: string };
export type SavedKey = { provider: string; hint: string; model: string | null; models: string[]; verifiedAt: string | null; updatedAt: string };
export type Verdict = "experiment" | "watch" | "skip";
export type Note = {
  id: string;
  /** where it came from: hackernews, arxiv, huggingface or github */
  source: string;
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
  decision: "approved" | "rejected" | null;
  decidedAt: string | null;
};
export type Budget = { monthly: number; spent: number; runs: number };
export type Scores = Record<string, { correct: number; total: number }>;
export type BenchScenario = {
  id: string;
  title: string;
  industry: string;
  /** the frontier benchmark this exam mirrors (null for the retired business cases) */
  benchmark: string | null;
  /** its room in the 3D lab */
  room: string;
  /** a retired business case: kept so old skills and cycles read, no new cycles */
  legacy: boolean;
  task: string;
  labels: { id: string; meaning: string }[];
  contexts: { id: string; name: string }[];
  sizes: Record<string, number>;
};
export type SkillStatus = "candidate" | "active" | "rejected" | "retired";
export type HarnessVerdict = { pass: boolean; reason: "improves" | "no-gain" | "regression"; target: string; deltas: Record<string, number>; needed: number; before: Scores; after: Scores };
export type Skill = {
  id: string;
  scenario: string;
  context: string;
  version: number;
  instructions: string;
  rationale: string;
  parentId: string | null;
  model: string;
  noteId: string | null;
  jobId: string | null;
  status: SkillStatus;
  verdict: HarnessVerdict | null;
  createdAt: string;
  decidedAt: string | null;
};
export type Phase = "plan" | "baseline" | "propose" | "validate" | "awaiting" | "done";
/** One thing the agent did in a cycle: which tool or model, what it cost, how long it took. */
export type TraceEntry = { at: string; phase?: string; tool: string; model?: string; cost?: number; ms?: number; tokens?: number; note?: string; idea?: string | null };
/** What the director (Muse Wonder) decided when the person let the agent choose. */
export type Plan = {
  scenario: string;
  family: string;
  executor: string;
  effort: string | null;
  why: string;
  steps: { tool: string; why: string }[];
  proposals: { capability: string; model: string; idea: string; why: string }[];
  estimate: number | null;
  fixes: string[];
};
export type Mistake = { context: string; fields: Record<string, unknown>; truth: string; given: string | null };
export type Job = {
  id: string;
  scenario: string;
  executor: string;
  planner: string;
  effort: string | null;
  phase: Phase;
  running: boolean;
  state: {
    guidance?: string;
    cost?: number;
    error?: string | null;
    outcome?: "nothing-to-learn" | "planner-failed" | "harness-rejected" | "approved" | "rejected" | "run-budget";
    maxCost?: number;
    auto?: boolean;
    plan?: Plan;
    trace?: TraceEntry[];
    detail?: string;
    before?: { practice: Scores; validation: Scores; answered: number; total: number };
    after?: Scores;
    verdict?: HarnessVerdict;
    candidate?: Skill & { parentInstructions: string | null };
    skillsUsed?: { context: string; version: number }[];
    mistakes: Mistake[];
  };
  createdAt: string;
  updatedAt: string;
};
export type AgentState = {
  bench: BenchScenario[];
  skills: Skill[];
  jobs: Job[];
  key: { model: string | null; models: string[] } | null;
  families: { family: string; name: string; id: string | null }[];
  budget: Budget;
};
export type Exam = { scenario: string; bare: boolean; scores: Scores; answered: number; total: number; cost: number; model: string };

export type ExamTotal = { correct: number; total: number };
export type CoreVerdict = { pass: boolean; reason: "improves" | "no-gain" | "regression" | "broken" | "rules"; gain: number; needed: number; base?: ExamTotal; head?: ExamTotal; problems?: string[] };
export type CoreVersion = {
  id: string;
  version: number;
  coreVersion: string;
  strategy: string;
  changes: string;
  parentId: string | null;
  runId: string | null;
  builder: "muse-code" | "forja";
  status: "candidate" | "active" | "rejected" | "retired";
  verdict: CoreVerdict | null;
  changed: string[];
  createdAt: string;
};
export type EvolveRun = {
  id: string;
  status: "queued" | "building" | "passed" | "rejected" | "failed";
  builder: "muse-code" | "forja";
  proposal: { title: string; hypothesis?: string; plan?: string; source?: string; by?: string };
  costUsd: number;
  maxUsd: number;
  stage: string | null;
  verdict: CoreVerdict | null;
  base: ExamTotal | null;
  head: ExamTotal | null;
  error: string | null;
  ciUrl: string | null;
  createdAt: string;
  updatedAt: string;
};
export type HealthCheck = { id: string; ok: boolean | null; who: "admin" | "you"; title: { en: string; es: string }; fix: { en: string; es: string } };
export type EvolveState = {
  health: { ready: boolean; tables: boolean; checks: HealthCheck[] };
  platform: { version: string; strategy: string };
  active: { id: string; version: number; coreVersion: string; strategy: string } | null;
  cores: CoreVersion[];
  runs: EvolveRun[];
  configured: boolean;
  missing: string[];
  limits: { maxUsd: number; dailyRuns: number };
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
    readonly detail?: Record<string, unknown>,
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
    const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string } & Record<string, unknown>;
    if (!res.ok) {
      const db = body.reason === "database" ? dbText(String(body.detail ?? "")) : null;
      throw new ApiError(db ?? body.error ?? `Error ${res.status}`, res.status, body.reason, body);
    }
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
      call<{ notes: Note[]; read: number; provider?: string; model?: string; effort?: string | null; cost?: number; budget?: Budget }>("/api/radar", {
        method: "POST",
        body: JSON.stringify({ provider, lang, effort }),
      }),
    decide: (id: string, decision: "approved" | "rejected") =>
      call<{ note: Note }>("/api/radar", { method: "PATCH", body: JSON.stringify({ id, decision }) }),
    agent: () => call<AgentState>("/api/agent"),
    agentOp: <T = { job: Job }>(body: Record<string, unknown>) => call<T>("/api/agent", { method: "POST", body: JSON.stringify(body) }),
    transcribe: (audio: Blob, seconds: number, lang: string) =>
      call<{ text: string; cost: number }>(`/api/media?kind=voice&seconds=${Math.ceil(seconds)}&lang=${lang}`, {
        method: "POST",
        body: audio,
        headers: { "content-type": audio.type || "audio/webm" },
      }),
    emblem: (skillId: string) => call<{ image: string; cost: number }>("/api/media?kind=image", { method: "POST", body: JSON.stringify({ skillId }) }),
    evolve: () => call<EvolveState>("/api/evolve"),
    evolveOp: (body: Record<string, unknown>) => call<{ run?: EvolveRun } & Partial<EvolveState>>("/api/evolve", { method: "POST", body: JSON.stringify(body) }),
    coreFiles: (id: string) => call<{ core: CoreVersion; files: Record<string, string> }>(`/api/evolve?core=${encodeURIComponent(id)}`),
    talk: (messages: { role: "user" | "assistant"; content: string }[], lang: string, tab: string) =>
      call<{ say: string; action: string | null; cost: number; model: string }>("/api/talk", { method: "POST", body: JSON.stringify({ messages, lang, tab }) }),
    limits: () => call<Budget>("/api/limits"),
    setLimit: (monthly: number) => call<Budget>("/api/limits", { method: "PUT", body: JSON.stringify({ monthly }) }),
  };
}
export type Api = ReturnType<typeof api>;
