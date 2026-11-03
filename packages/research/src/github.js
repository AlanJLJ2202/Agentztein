// GitHub: the AI repositories created in the last days that collect the most stars, through the public search API.
// Works without a token (10 searches a minute per IP); a token (GITHUB_TOKEN) raises the limit.
import { hintCapability } from "./capabilities.js";
import { safeUrl } from "./story.js";

export const GITHUB_API = "https://api.github.com";

/** Topics that cover what Agentztein watches. One search per topic. */
export const GITHUB_TOPICS = ["llm", "ai-agents"];

/**
 * URL of one search: repositories with `topic` created in the last `days`, with at least `minStars`.
 * @param {string} topic
 * @param {{ days?: number, minStars?: number, perQuery?: number, now?: number }} [opts]
 */
export function repoSearchUrl(topic, { days = 7, minStars = 50, perQuery = 15, now = Date.now() } = {}) {
  const since = new Date(now - days * 86_400_000).toISOString().slice(0, 10);
  const p = new URLSearchParams({ q: `topic:${topic} created:>=${since} stars:>=${minStars}`, sort: "stars", order: "desc", per_page: String(perQuery) });
  return `${GITHUB_API}/search/repositories?${p}`;
}

/**
 * @param {any} repo An item of GitHub's repository search
 * @returns {import("./story.js").Story | null}
 */
export function toRepoStory(repo) {
  const page = safeUrl(repo?.html_url);
  if (!repo || repo.id == null || typeof repo.full_name !== "string" || !page) return null;
  const about = typeof repo.description === "string" ? repo.description.replace(/\s+/g, " ").trim() : "";
  const title = about ? `${repo.full_name}: ${about.length > 140 ? about.slice(0, 139) + "…" : about}` : repo.full_name;
  const topics = Array.isArray(repo.topics) ? repo.topics.filter((/** @type {unknown} */ t) => typeof t === "string") : [];
  return {
    id: `github:${repo.id}`,
    source: "github",
    title,
    url: page,
    discussionUrl: page,
    points: Number(repo.stargazers_count) || 0,
    comments: null,
    author: typeof repo.owner?.login === "string" ? repo.owner.login : "",
    postedAt: typeof repo.created_at === "string" ? repo.created_at : new Date(0).toISOString(),
    hint: hintCapability(`${title} ${topics.join(" ")}`),
  };
}

/**
 * Fetches the most starred new AI repositories, most stars first, without duplicates.
 * @param {{ days?: number, minStars?: number, limit?: number, token?: string, userAgent?: string, fetchImpl?: typeof fetch, signal?: AbortSignal }} [opts]
 * @returns {Promise<import("./story.js").Story[]>}
 */
export async function fetchGithubStories({ days = 7, minStars = 50, limit = 12, token, userAgent = "agentztein-radar", fetchImpl = fetch, signal } = {}) {
  /** @type {Record<string, string>} */
  const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": userAgent };
  if (token) headers.authorization = `Bearer ${token}`;
  const lists = await Promise.all(
    GITHUB_TOPICS.map(async (topic) => {
      const res = await fetchImpl(repoSearchUrl(topic, { days, minStars }), { headers, ...(signal ? { signal } : {}) });
      if (!res.ok) throw new Error(`GitHub search failed (${res.status})`);
      const body = await res.json();
      return Array.isArray(body?.items) ? body.items : [];
    }),
  );
  /** @type {Map<string, import("./story.js").Story>} */
  const byId = new Map();
  for (const items of lists) for (const it of items) {
    const s = toRepoStory(it);
    if (s && !byId.has(s.id)) byId.set(s.id, s);
  }
  return [...byId.values()].sort((a, b) => b.points - a.points).slice(0, limit);
}
