// GitHub for the self-change loop (ADR-026). The app only opens issues labeled "evolve" and reads what came of
// them (PRs, the gate's verdict, the agent-vN tags). Writing code, judging and merging happen in GitHub Actions.
import { HttpError } from "./http.js";

export const EVOLVE_LABEL = "evolve";
const API = "https://api.github.com";

/** The repo and token, if configured. AGENT_GH_REPO, else the repo Vercel deploys from. */
export function githubConfig(env = process.env) {
  const token = (env.AGENT_GH_TOKEN ?? "").trim();
  const fromVercel = env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}` : "";
  const repo = (env.AGENT_GH_REPO ?? fromVercel).trim();
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return { token, repo };
}

/** Who may spend the project's Meta key and open evolve issues: emails in EVOLVE_ADMINS (comma separated). */
export function isAdmin(email, env = process.env) {
  const admins = (env.EVOLVE_ADMINS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return Boolean(email) && admins.includes(String(email).toLowerCase());
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
  if (res.status === 401 || res.status === 403) throw new HttpError(502, "GitHub rejected AGENT_GH_TOKEN (check its permissions)", { reason: "github-auth" });
  if (res.status === 404) throw new HttpError(502, "GitHub can't find the repo (check AGENT_GH_REPO and the token's repository access)", { reason: "github-repo" });
  if (!res.ok) throw new HttpError(502, `GitHub answered with an error (${res.status})`);
  return res.status === 204 ? null : res.json();
}

const GATE_TITLES = /** @type {const} */ ({ "✅": "merge", "🟡": "human", "⛔": "reject", "⚪": "skip" });

/** The decision and the totals in the gate's PR comment, if there is one. @param {string | null | undefined} body */
export function gateOf(body) {
  if (!body || !body.startsWith("<!-- agent-gate -->")) return null;
  const head = /###\s*(\S+)/.exec(body)?.[1] ?? "";
  const decision = /** @type {Record<string, string>} */ (GATE_TITLES)[head] ?? null;
  const total = /\|\s*\*\*Total\*\*\s*\|\s*\*\*(\d+)\/(\d+)\*\*[^|]*\|\s*\*\*(\d+)\/(\d+)\*\*[^|]*\|\s*\*\*([+-]?\d+)\*\*/.exec(body);
  return {
    decision,
    base: total ? { correct: Number(total[1]), total: Number(total[2]) } : null,
    head: total ? { correct: Number(total[3]), total: Number(total[4]) } : null,
    gain: total ? Number(total[5]) : null,
  };
}

/** The builder named in an evolve PR body (`<!-- evolve:run=… builder=… -->`). @param {string | null | undefined} body */
export const builderOf = (body) => /<!-- evolve:run=\d+ builder=([\w-]+) -->/.exec(body ?? "")?.[1] ?? null;
