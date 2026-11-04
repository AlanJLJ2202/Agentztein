// The harness around one call to the user's Meta model: their key (decrypted only here), the worst-case cost
// checked against their monthly budget before calling, and the real tokens and cost logged append-only.
import { costOf } from "@skillab/research";
import { open } from "./crypto.js";
import { budgetOf, MAX_OUTPUT_TOKENS } from "./harness.js";
import { HttpError } from "./http.js";
import { complete } from "./providers.js";

export const MODEL_TIMEOUT_MS = 110_000;

/** @param {import("pg").Pool} pool @param {string} userId */
export async function keyOf(pool, userId) {
  const { rows } = await pool.query(
    "SELECT provider, secret, model, models FROM app.provider_keys WHERE user_id = $1 AND provider = 'meta' LIMIT 1",
    [userId],
  );
  const row = rows[0];
  if (!row) throw new HttpError(409, "Connect your Meta key first", { reason: "no-key" });
  return { provider: row.provider, model: row.model, models: Array.isArray(row.models) ? row.models.map(String) : [], key: open(row.secret, { userId, provider: row.provider }) };
}

/**
 * One model call inside the harness: refused before spending if it could go over the monthly budget,
 * and logged (append-only) with its real tokens and cost.
 * @param {import("pg").Pool} pool
 * @param {string} userId
 * @param {Awaited<ReturnType<typeof keyOf>>} k
 * `cap` is what is left of this cycle's own spending cap, if it has one: a call whose worst case doesn't fit is refused
 * the same way, before spending.
 * @param {{ kind: string, model: string, effort: string | null, system?: string, prompt?: string, messages?: any[], tools?: any[], timeoutMs?: number, cap?: number }} call
 */
export async function harnessed(pool, userId, k, call) {
  const budget = await budgetOf(pool, userId);
  const size = call.messages ? JSON.stringify(call.messages).length : (call.system ?? "").length + (call.prompt ?? "").length;
  const worst = costOf(call.model, Math.ceil((size + JSON.stringify(call.tools ?? []).length) / 4), MAX_OUTPUT_TOKENS);
  if (budget.spent + worst > budget.monthly) {
    throw new HttpError(409, "This step could go over your monthly budget. Raise it or wait until next month.", { reason: "budget", ...budget, worst });
  }
  if (typeof call.cap === "number" && worst > call.cap) {
    throw new HttpError(409, "This step could go over this cycle's spending cap.", { reason: "run-budget", left: Math.max(0, call.cap), worst });
  }
  const reply = await complete({
    provider: k.provider, key: k.key, model: call.model, effort: call.effort, system: call.system, user: call.prompt,
    messages: call.messages, tools: call.tools, timeoutMs: call.timeoutMs ?? MODEL_TIMEOUT_MS,
  });
  const cost = costOf(call.model, reply.usage.input, reply.usage.output);
  await pool.query(
    `INSERT INTO app.harness_runs (user_id, kind, provider, model, effort, input_tokens, output_tokens, cost_usd, outcome)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ok')`,
    [userId, call.kind, k.provider, call.model, call.effort, reply.usage.input, reply.usage.output, cost],
  );
  return { ...reply, cost };
}

