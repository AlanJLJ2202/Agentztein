// The harness on the server: each user's monthly budget and what they have spent this calendar month (UTC).

/** Upper bound of tokens a single model answer may use, for the worst-case cost check. */
export const MAX_OUTPUT_TOKENS = 6000;
export const DEFAULT_BUDGET_USD = 5;

/**
 * @param {import("pg").Pool} pool
 * @param {string} userId
 * @returns {Promise<{ monthly: number, spent: number, runs: number }>}
 */
export async function budgetOf(pool, userId) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE((SELECT monthly_budget_usd FROM app.user_limits WHERE user_id = $1), $2)::float AS monthly,
       COALESCE(SUM(cost_usd), 0)::float AS spent,
       COUNT(*)::int AS runs
     FROM app.harness_runs
     WHERE user_id = $1 AND created_at >= date_trunc('month', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'`,
    [userId, DEFAULT_BUDGET_USD],
  );
  const r = rows[0] ?? {};
  return { monthly: Number(r.monthly ?? DEFAULT_BUDGET_USD), spent: Number(r.spent ?? 0), runs: Number(r.runs ?? 0) };
}
