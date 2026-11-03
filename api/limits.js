// /api/limits: the harness settings of the signed-in user.
//   GET  { monthly, spent, runs }  this month's budget and spending
//   PUT  { monthly }               set the monthly budget in USD (0.5 to 1000)
import { requireUser } from "./_lib/auth.js";
import { db } from "./_lib/db.js";
import { budgetOf } from "./_lib/harness.js";
import { HttpError, handle, json, readJson } from "./_lib/http.js";

export const GET = handle(async (request) => {
  const user = await requireUser(request);
  return json(await budgetOf(db(), user.id));
});

export const PUT = handle(async (request) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const monthly = Number(body.monthly);
  if (!Number.isFinite(monthly) || monthly < 0.5 || monthly > 1000) throw new HttpError(400, "Choose a budget between $0.50 and $1,000");
  await db().query(
    `INSERT INTO app.user_limits (user_id, monthly_budget_usd) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET monthly_budget_usd = EXCLUDED.monthly_budget_usd, updated_at = now()`,
    [user.id, Math.round(monthly * 100) / 100],
  );
  return json(await budgetOf(db(), user.id));
});
