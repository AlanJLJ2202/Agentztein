// Meta Model API calls for the scripts that run in GitHub Actions (bench, workshop, forja): one project key
// (META_API_KEY, a repo secret), the newest standard Muse model that key can use, and a running cost with a cap.
import { costOf, META_MODELS, pickId } from "@skillab/research";
import { complete, defaultModel, verifyKey } from "../../api/_lib/providers.js";

export type Req = { system?: string; user?: string; messages?: unknown[]; tools?: { name: string; description: string; parameters: Record<string, unknown> }[]; effort?: string | null };
export type Reply = { text: string; toolCalls: { id: string; name: string; arguments: string }[]; message: Record<string, unknown> };

/** Takes the key out of the environment, so code run after this (the agent's core, its tests) can't read it. */
export function takeKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = (env.META_API_KEY ?? env.MODEL_API_KEY ?? "").trim();
  delete env.META_API_KEY;
  delete env.MODEL_API_KEY;
  if (!key) throw new Error("META_API_KEY is missing (GitHub → Settings → Secrets and variables → Actions)");
  return key;
}

/** The model to use: META_MODEL if set, else the newest of `family` that the key lists. */
export async function pickModel(key: string, family: "spark" | "wonder", fetchImpl: typeof fetch = fetch): Promise<string> {
  const wanted = (family === "wonder" ? process.env.META_PLANNER_MODEL : process.env.META_MODEL)?.trim();
  if (wanted) return wanted;
  const v = await verifyKey("meta", key, fetchImpl);
  if (v.status === "invalid") throw new Error("Meta rejected META_API_KEY");
  const models = v.status === "valid" ? v.models : [];
  const fam = META_MODELS.find((f) => f.family === family);
  return (fam && pickId(fam, models)) || defaultModel("meta", models) || "muse-spark-1.1";
}

export type Meter = { cost: number; calls: number; input: number; output: number };

/** A metered call function: refuses once the cap in USD is reached. */
export function metaCaller(key: string, model: string, { maxUsd = 1, timeoutMs = 120_000, fetchImpl = fetch } = {}) {
  const meter: Meter = { cost: 0, calls: 0, input: 0, output: 0 };
  const call = async (req: Req): Promise<Reply> => {
    if (meter.cost >= maxUsd) throw new Error(`Spending cap reached ($${maxUsd})`);
    const r = await complete({
      provider: "meta", key, model, system: req.system, user: req.user, messages: req.messages as never, tools: req.tools,
      effort: req.effort === undefined ? null : req.effort, timeoutMs, fetchImpl,
    });
    meter.calls++;
    meter.input += r.usage.input;
    meter.output += r.usage.output;
    meter.cost += costOf(model, r.usage.input, r.usage.output);
    return { text: r.text, toolCalls: r.toolCalls, message: r.message };
  };
  return { call, meter, model };
}

/** `--name value` and `--flag` arguments. */
export function args(argv: string[] = process.argv.slice(2)): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (!a.startsWith("--")) { out._ = out._ ? `${out._} ${a}` : a; continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[a.slice(2)] = "true";
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}
