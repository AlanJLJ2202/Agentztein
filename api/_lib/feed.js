// The radar's sources, read on the server so the browser never calls them directly and so the
// Reddit and GitHub credentials stay here. A short cache per instance keeps us well inside their rate limits.
import { fetchFeed } from "@skillab/research";

const TTL_MS = 10 * 60_000;
/** @type {{ at: number, limit: number, data: Awaited<ReturnType<typeof fetchFeed>> } | null} */
let cache = null;

/** Reddit asks every client for a descriptive User-Agent. */
export const USER_AGENT = "web:agentztein:0.1 (AI research radar)";

/** Which sources are configured (names only, never values). */
export function feedConfig() {
  return {
    reddit: Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET),
    githubToken: Boolean(process.env.GITHUB_TOKEN),
  };
}

/**
 * The mixed feed of every source, cached for a few minutes.
 * @param {{ limit?: number, fresh?: boolean }} [opts]
 */
export async function loadFeed({ limit = 12, fresh = false } = {}) {
  if (!fresh && cache && cache.limit >= limit && Date.now() - cache.at < TTL_MS) {
    return { ...cache.data, stories: cache.data.stories.slice(0, limit) };
  }
  const data = await fetchFeed({
    days: 7,
    limit,
    signal: AbortSignal.timeout(10_000),
    reddit: { clientId: process.env.REDDIT_CLIENT_ID, clientSecret: process.env.REDDIT_CLIENT_SECRET, userAgent: USER_AGENT },
    githubToken: process.env.GITHUB_TOKEN || undefined,
  });
  cache = { at: Date.now(), limit, data };
  return data;
}

/** Forget the cache (tests). */
export const resetFeedCache = () => { cache = null; };
