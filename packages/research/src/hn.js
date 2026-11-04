// Hacker News through its public Algolia search API (https://hn.algolia.com/api). No key needed, CORS open.
import { hintCapability } from "./capabilities.js";

export const HN_API = "https://hn.algolia.com/api/v1";

/** Searches that cover what Agentztein watches: new models, agents, benchmarks and research. */
export const HN_QUERIES = ["LLM", "AI agent", "benchmark", "AI model", "AI research"];

/**
 * @typedef {object} Story
 * @property {string} id Item id: the Hacker News id, or prefixed by its source ("arxiv:…", "hf:…", "gh:…")
 * @property {import("./sources.js").Source} [source] Where it came from (Hacker News when missing)
 * @property {string} title
 * @property {string | null} url Link of the story (null for Ask HN and similar)
 * @property {string} hnUrl Discussion thread on Hacker News (for other sources, the item's own page)
 * @property {string} [discussionUrl] Where people discuss it
 * @property {string} [summary] Abstract or description, when the source gives one
 * @property {number} points
 * @property {number} comments
 * @property {string} author
 * @property {string} postedAt ISO date
 * @property {import("./capabilities.js").Capability | null} hint Keyword guess, not a verdict
 */

/**
 * URL of one search: stories from the last `days` with at least `minPoints`.
 * @param {string} query
 * @param {{ days?: number, minPoints?: number, perQuery?: number, now?: number }} [opts]
 */
export function searchUrl(query, { days = 7, minPoints = 40, perQuery = 20, now = Date.now() } = {}) {
  const since = Math.floor(now / 1000) - days * 86400;
  const p = new URLSearchParams({
    query,
    tags: "story",
    numericFilters: `created_at_i>${since},points>=${minPoints}`,
    hitsPerPage: String(perQuery),
  });
  return `${HN_API}/search?${p}`;
}

/**
 * @param {any} hit An Algolia hit
 * @returns {Story | null}
 */
export function toStory(hit) {
  if (!hit || typeof hit.objectID !== "string" || typeof hit.title !== "string" || !hit.title.trim()) return null;
  const title = hit.title.trim();
  return {
    id: hit.objectID,
    title,
    url: typeof hit.url === "string" && /^https?:\/\//.test(hit.url) ? hit.url : null,
    hnUrl: `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`,
    source: "hackernews",
    discussionUrl: `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`,
    points: Number(hit.points) || 0,
    comments: Number(hit.num_comments) || 0,
    author: typeof hit.author === "string" ? hit.author : "",
    postedAt: typeof hit.created_at === "string" ? hit.created_at : new Date((Number(hit.created_at_i) || 0) * 1000).toISOString(),
    hint: hintCapability(title),
  };
}

/**
 * Merges the hits of several searches: one entry per story, most points first.
 * @param {any[][]} hitLists
 * @param {number} limit
 * @returns {Story[]}
 */
export function mergeStories(hitLists, limit) {
  /** @type {Map<string, Story>} */
  const byId = new Map();
  for (const hits of hitLists) {
    for (const hit of hits) {
      const s = toStory(hit);
      if (s && !byId.has(s.id)) byId.set(s.id, s);
    }
  }
  return [...byId.values()].sort((a, b) => b.points - a.points).slice(0, limit);
}

/**
 * Fetches the most discussed AI stories of the last days.
 * @param {{ days?: number, minPoints?: number, limit?: number, fetchImpl?: typeof fetch, signal?: AbortSignal }} [opts]
 * @returns {Promise<Story[]>}
 */
export async function fetchAiStories({ days = 7, minPoints = 40, limit = 12, fetchImpl = fetch, signal } = {}) {
  // one search that fails doesn't sink the others; only when none answers does Hacker News count as down
  const settled = await Promise.allSettled(
    HN_QUERIES.map(async (q) => {
      const res = await fetchImpl(searchUrl(q, { days, minPoints }), signal ? { signal } : {});
      if (!res.ok) throw new Error(`Hacker News search failed (${res.status})`);
      const body = await res.json();
      return Array.isArray(body?.hits) ? body.hits : [];
    }),
  );
  const lists = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!lists.length) throw settled.find((r) => r.status === "rejected")?.reason ?? new Error("Hacker News didn't answer");
  return mergeStories(lists, limit);
}
