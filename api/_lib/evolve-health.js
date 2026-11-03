// What a user's agent needs to change its own code, checked for real, so the dashboard can say exactly what is
// missing and who fixes it. Server setup ("admin": whoever runs the deployment) and the user's own ("you").
// Every check is { id, ok, who, title, fix } (ok null = couldn't verify). Values never leave: only names.
import { budgetOf } from "./harness.js";
import { EVOLVE_WORKFLOW, gh, githubConfig } from "./github.js";

export const MIN_LEFT_USD = 0.5;
/** A queued run whose workflow never fetched its key, or one that never reported back, is marked failed. */
export const STALE_QUEUED_MIN = 15;
export const STALE_BUILDING_MIN = 90;

/** @param {string} id @param {boolean | null} ok @param {"admin" | "you"} who @param {{ en: string, es: string }} title @param {{ en: string, es: string }} fix */
const check = (id, ok, who, title, fix) => ({ id, ok, who, title, fix });
const E = (/** @type {string} */ en, /** @type {string} */ es) => ({ en, es });

/** @type {{ at: number, key: string, value: any } | null} */
let ghCache = null;
const GH_TTL_MS = 5 * 60_000;
/** Forget the cached GitHub checks (tests, or right after fixing the setup). */
export const resetHealthCache = () => { ghCache = null; };

/** GitHub-side checks, cached 5 minutes per repo. @param {{ token: string, repo: string }} cfg @param {typeof fetch} fetchImpl */
async function githubChecks(cfg, fetchImpl) {
  const key = `${cfg.repo}|${cfg.token.slice(-6)}`;
  if (ghCache && ghCache.key === key && Date.now() - ghCache.at < GH_TTL_MS) return ghCache.value;
  /** @param {string} path */
  const status = async (path) => {
    try { await gh(cfg, path, { fetchImpl }); return 200; } catch (err) {
      const reason = /** @type {any} */ (err)?.extra?.reason;
      return reason === "github-auth" ? 403 : reason === "github-repo" ? 404 : 0;
    }
  };
  const repo = await status(`/repos/${cfg.repo}`);
  const workflow = repo === 200 ? await status(`actions/workflows/${EVOLVE_WORKFLOW}`) : 0;
  const secret = repo === 200 ? await status("actions/secrets/EVOLVE_CI_SECRET") : 0;
  const value = { repo, workflow, secret };
  ghCache = { at: Date.now(), key, value };
  return value;
}

/** Marks runs that will never finish as failed, with the likely cause. @param {import("pg").Pool} pool @param {string} userId */
export async function failStaleRuns(pool, userId) {
  await pool.query(
    `UPDATE app.evolve_runs SET status = 'failed', updated_at = now(), detail = detail || $3::jsonb
     WHERE user_id = $1 AND status = 'queued' AND key_fetched_at IS NULL AND created_at < now() - ($2 || ' minutes')::interval`,
    [userId, String(STALE_QUEUED_MIN), JSON.stringify({ stage: "stale", error: "The workflow never picked this run up: check that evolve.yml is on main and that EVOLVE_CI_SECRET is the same in GitHub and Vercel." })],
  );
  await pool.query(
    `UPDATE app.evolve_runs SET status = 'failed', updated_at = now(), detail = detail || $3::jsonb
     WHERE user_id = $1 AND status = 'building' AND updated_at < now() - ($2 || ' minutes')::interval`,
    [userId, String(STALE_BUILDING_MIN), JSON.stringify({ stage: "stale", error: "The run never reported back. Open it in GitHub Actions to see where it stopped." })],
  );
}

/**
 * @param {{ pool: import("pg").Pool, userId: string, env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch }} o
 * @returns {Promise<{ ready: boolean, tables: boolean, checks: ReturnType<typeof check>[] }>}
 */
export async function evolveHealth({ pool, userId, env = process.env, fetchImpl = fetch }) {
  const checks = [];
  const cfg = githubConfig(env);
  const repoKnown = Boolean(githubConfig({ ...env, AGENT_GH_TOKEN: "x" }));
  checks.push(check("gh-token", Boolean(cfg), "admin",
    E("GitHub token in Vercel", "Token de GitHub en Vercel"),
    E(`Add AGENT_GH_TOKEN${repoKnown ? "" : " and AGENT_GH_REPO"} in Vercel → Environment Variables: a fine-grained token for this repo with Actions: Read and write (add Secrets: Read-only so this check can also see the repo secret).`,
      `Agrega AGENT_GH_TOKEN${repoKnown ? "" : " y AGENT_GH_REPO"} en Vercel → Environment Variables: un token fine-grained de este repo con Actions: Read and write (agrega Secrets: Read-only para que esta revisión también vea el secreto del repo).`)));
  const secretOk = (env.EVOLVE_CI_SECRET ?? "").length >= 32;
  checks.push(check("ci-secret-vercel", secretOk, "admin",
    E("CI secret in Vercel", "Secreto de CI en Vercel"),
    E("Add EVOLVE_CI_SECRET in Vercel (32+ characters, e.g. `openssl rand -base64 48`), and the same value as a repo secret in GitHub.",
      "Agrega EVOLVE_CI_SECRET en Vercel (32+ caracteres, p. ej. `openssl rand -base64 48`), y el mismo valor como secreto del repo en GitHub.")));

  let tables = false;
  try {
    const { rows } = await pool.query("SELECT to_regclass('app.agent_cores') IS NOT NULL AND to_regclass('app.evolve_runs') IS NOT NULL AS ok");
    tables = Boolean(rows[0]?.ok);
  } catch { tables = false; }
  checks.push(check("migration", tables, "admin",
    E("Database migration 0008", "Migración 0008 de la base de datos"),
    E("Run GitHub → Actions → db-migrate → Run workflow (type migrate).", "Corre GitHub → Actions → db-migrate → Run workflow (escribe migrate).")));

  if (cfg) {
    const g = await githubChecks(cfg, fetchImpl);
    checks.push(check("gh-repo", g.repo === 200, "admin",
      E(`GitHub can reach ${cfg.repo}`, `GitHub llega a ${cfg.repo}`),
      g.repo === 403
        ? E("GitHub rejected AGENT_GH_TOKEN: it expired or lacks access to this repo.", "GitHub rechazó AGENT_GH_TOKEN: venció o no tiene acceso a este repo.")
        : E("Check AGENT_GH_REPO (owner/repo) and that the token includes this repository.", "Revisa AGENT_GH_REPO (dueño/repo) y que el token incluya este repositorio.")));
    if (g.repo === 200) {
      checks.push(check("workflow", g.workflow === 200, "admin",
        E("The evolve workflow is on main", "El workflow evolve está en main"),
        E("Merge the branch that adds .github/workflows/evolve.yml into main: GitHub only starts workflows from the default branch.",
          "Fusiona a main la rama que agrega .github/workflows/evolve.yml: GitHub solo dispara workflows de la rama principal.")));
      checks.push(check("ci-secret-github", g.secret === 200 ? true : g.secret === 404 ? false : null, "admin",
        E("CI secret in GitHub", "Secreto de CI en GitHub"),
        g.secret === 404
          ? E("Add EVOLVE_CI_SECRET in GitHub → Settings → Secrets and variables → Actions (same value as in Vercel).", "Agrega EVOLVE_CI_SECRET en GitHub → Settings → Secrets and variables → Actions (el mismo valor que en Vercel).")
          : E("Couldn't verify it: give the token Secrets: Read-only, or make sure EVOLVE_CI_SECRET is set in the repo.", "No se pudo verificar: dale al token Secrets: Read-only, o confirma que EVOLVE_CI_SECRET esté en el repo.")));
    }
  }

  const { rows: keys } = await pool.query("SELECT model FROM app.provider_keys WHERE user_id = $1 AND provider = 'meta' LIMIT 1", [userId]);
  checks.push(check("meta-key", Boolean(keys[0]), "you",
    E("Your Meta key", "Tu llave de Meta"),
    E("Connect your Meta Model API key in Brain: every run uses it.", "Conecta tu llave de la Meta Model API en Cerebro: cada corrida la usa.")));
  const budget = await budgetOf(pool, userId);
  checks.push(check("budget", budget.monthly - budget.spent >= MIN_LEFT_USD, "you",
    E("Budget left this month", "Presupuesto disponible este mes"),
    E(`You have $${Math.max(0, budget.monthly - budget.spent).toFixed(2)} left; a run needs at least $${MIN_LEFT_USD.toFixed(2)}. Raise your monthly budget in Brain.`,
      `Te quedan $${Math.max(0, budget.monthly - budget.spent).toFixed(2)}; una corrida necesita al menos $${MIN_LEFT_USD.toFixed(2)}. Sube tu presupuesto mensual en Cerebro.`)));

  if (tables) {
    await failStaleRuns(pool, userId);
    const { rows } = await pool.query("SELECT status, detail FROM app.evolve_runs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [userId]);
    const last = rows[0];
    if (last?.status === "failed") {
      checks.push(check("last-run", false, "you",
        E("Your last run failed", "Tu última corrida falló"),
        E(String(last.detail?.error ?? "Open it in GitHub Actions to see why."), String(last.detail?.error ?? "Ábrela en GitHub Actions para ver por qué."))));
    }
  }
  return { ready: checks.every((c) => c.ok !== false || c.id === "last-run"), tables, checks };
}
