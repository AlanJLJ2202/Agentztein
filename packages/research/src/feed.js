// The radar's feed: reads every source at once and mixes them, so no single community fills the list.
// A source that fails or isn't configured is reported in `status` and the others still answer.
import { fetchGithubStories } from "./github.js";
import { fetchAiStories } from "./hn.js";
import { fetchRedditStories } from "./reddit.js";
import { SOURCE_IDS } from "./story.js";

/** @typedef {"ok" | "error" | "off"} SourceStatus  "off": not configured (Reddit without credentials) */

/**
 * Takes the best of each source in turn (round-robin), skipping a link already taken from another source.
 * @param {import("./story.js").Story[][]} lists One list per source, each already sorted best first
 * @param {number} limit
 */
export function interleave(lists, limit) {
  /** @type {import("./story.js").Story[]} */
  const out = [];
  const seen = new Set();
  const key = (/** @type {import("./story.js").Story} */ s) => (s.url ?? s.discussionUrl).replace(/^https?:\/\/(www\.)?/i, "").replace(/[/#?]+$/, "").toLowerCase();
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest && out.length < limit; i++) {
    for (const list of lists) {
      const s = list[i];
      if (!s || seen.has(key(s)) || out.length >= limit) continue;
      seen.add(key(s));
      out.push(s);
    }
  }
  return out;
}

/**
 * @param {{
 *   days?: number, limit?: number, fetchImpl?: typeof fetch, signal?: AbortSignal,
 *   reddit?: { clientId?: string, clientSecret?: string, userAgent?: string },
 *   githubToken?: string,
 * }} [opts]
 * @returns {Promise<{ stories: import("./story.js").Story[], status: Record<import("./story.js").Source, SourceStatus> }>}
 */
export async function fetchFeed({ days = 7, limit = 12, fetchImpl = fetch, signal, reddit = {}, githubToken } = {}) {
  /** @type {Record<import("./story.js").Source, (() => Promise<import("./story.js").Story[]>) | null>} */
  const readers = {
    hackernews: () => fetchAiStories({ days, limit, fetchImpl, signal }),
    reddit: reddit.clientId && reddit.clientSecret
      ? () => fetchRedditStories({ clientId: String(reddit.clientId), clientSecret: String(reddit.clientSecret), userAgent: reddit.userAgent, days, limit, fetchImpl, signal })
      : null,
    github: () => fetchGithubStories({ days, limit, token: githubToken, fetchImpl, signal }),
  };
  const results = await Promise.all(SOURCE_IDS.map(async (id) => {
    const read = readers[id];
    if (!read) return { id, status: /** @type {SourceStatus} */ ("off"), stories: /** @type {import("./story.js").Story[]} */ ([]) };
    try {
      return { id, status: /** @type {SourceStatus} */ ("ok"), stories: await read() };
    } catch {
      return { id, status: /** @type {SourceStatus} */ ("error"), stories: /** @type {import("./story.js").Story[]} */ ([]) };
    }
  }));
  if (!results.some((r) => r.status === "ok")) throw new Error("No source answered");
  const status = /** @type {Record<import("./story.js").Source, SourceStatus>} */ (Object.fromEntries(results.map((r) => [r.id, r.status])));
  return { stories: interleave(results.map((r) => r.stories), limit), status };
}
