// GitHub for the self-change loop (ADR-026): the app only starts the evolve workflow for one user's run
// (workflow_dispatch). Building and judging happen in GitHub Actions, which reports back to /api/evolve-ci.
import { HttpError } from "./http.js";

const API = "https://api.github.com";
export const EVOLVE_WORKFLOW = "evolve.yml";

/** The repo and token, if configured. AGENT_GH_REPO, else the repo Vercel deploys from. */
export function githubConfig(env = process.env) {
  const token = (env.AGENT_GH_TOKEN ?? "").trim();
  const fromVercel = env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}` : "";
  const repo = (env.AGENT_GH_REPO ?? fromVercel).trim();
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return { token, repo };
}

/**
 * @param {{ token: string, repo: string }} cfg
 * @param {string} path  relative to the repo ("issues", "pulls?state=all") or absolute from the API root ("/…")
 * @param {{ method?: string, body?: unknown, fetchImpl?: typeof fetch }} [opts]
 */
export async function gh(cfg, path, { method = "GET", body, fetchImpl = fetch } = {}) {
  const url = path.startsWith("/") ? `${API}${path}` : `${API}/repos/${cfg.repo}/${path}`;
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers: {
        authorization: `Bearer ${cfg.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "agentztein",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(502, "Could not reach GitHub");
  }
  if (res.status === 401 || res.status === 403) throw new HttpError(502, "GitHub rejected AGENT_GH_TOKEN (it needs Actions: read and write on the repo)", { reason: "github-auth" });
  if (res.status === 404) throw new HttpError(502, "GitHub can't find the repo or the evolve workflow (check AGENT_GH_REPO, the token's repository access, and that evolve.yml is on main)", { reason: "github-repo" });
  if (!res.ok) throw new HttpError(502, `GitHub answered with an error (${res.status})`);
  return res.status === 204 ? null : res.json();
}

/**
 * Starts the evolve workflow for one run. The inputs carry no secret but the run's one-time token.
 * @param {{ token: string, repo: string }} cfg
 * @param {{ runId: string, token: string, appUrl: string, ref?: string }} run
 * @param {typeof fetch} [fetchImpl]
 */
export async function dispatchEvolve(cfg, run, fetchImpl = fetch) {
  await gh(cfg, `actions/workflows/${EVOLVE_WORKFLOW}/dispatches`, {
    method: "POST",
    body: { ref: run.ref ?? "main", inputs: { run_id: run.runId, token: run.token, app_url: run.appUrl } },
    fetchImpl,
  });
}
