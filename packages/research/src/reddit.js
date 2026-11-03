// Reddit: the week's top posts of the AI subreddits, through Reddit's Data API.
// Reddit blocks traffic without OAuth, so this needs an approved app (REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET):
// it asks for an app-only token (client_credentials) and reads with it. Without credentials the source stays off.
import { hintCapability } from "./capabilities.js";
import { safeUrl } from "./story.js";

export const REDDIT_SUBS = ["MachineLearning", "LocalLLaMA"];
const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";

/** URL of the week's top posts of every sub at once. @param {string[]} [subs] */
export const redditTopUrl = (subs = REDDIT_SUBS) => `https://oauth.reddit.com/r/${subs.join("+")}/top?t=week&limit=50&raw_json=1`;

/**
 * @param {any} child An item of a Reddit listing ({ kind: "t3", data })
 * @returns {import("./story.js").Story | null}
 */
export function toRedditStory(child) {
  const p = child?.data;
  if (!p || typeof p.id !== "string" || typeof p.title !== "string" || !p.title.trim()) return null;
  if (p.over_18 || p.stickied || p.removed_by_category) return null;
  const title = p.title.replace(/\s+/g, " ").trim();
  const thread = `https://www.reddit.com${typeof p.permalink === "string" && p.permalink.startsWith("/") ? p.permalink : `/comments/${encodeURIComponent(p.id)}`}`;
  const link = p.is_self ? null : safeUrl(p.url_overridden_by_dest ?? p.url);
  return {
    id: `reddit:${p.id}`,
    source: "reddit",
    title,
    // a link post points at its article; links back into reddit count as text posts
    url: link && !/^https?:\/\/(www\.|old\.)?reddit\.com\//i.test(link) ? link : null,
    discussionUrl: thread,
    points: Number(p.score) || 0,
    comments: Number(p.num_comments) || 0,
    author: typeof p.author === "string" ? p.author : "",
    postedAt: new Date((Number(p.created_utc) || 0) * 1000).toISOString(),
    hint: hintCapability(title),
  };
}

/**
 * An app-only token for the Data API.
 * @param {{ clientId: string, clientSecret: string, userAgent: string, fetchImpl?: typeof fetch, signal?: AbortSignal }} opts
 */
export async function redditToken({ clientId, clientSecret, userAgent, fetchImpl = fetch, signal }) {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": userAgent,
    },
    body: "grant_type=client_credentials",
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw new Error(`Reddit sign-in failed (${res.status})`);
  const body = await res.json();
  if (typeof body?.access_token !== "string") throw new Error("Reddit returned no token");
  return body.access_token;
}

/**
 * Fetches the week's top AI posts with at least `minScore`, highest score first.
 * @param {{ clientId: string, clientSecret: string, userAgent?: string, days?: number, minScore?: number, limit?: number, fetchImpl?: typeof fetch, signal?: AbortSignal, now?: number }} opts
 * @returns {Promise<import("./story.js").Story[]>}
 */
export async function fetchRedditStories({ clientId, clientSecret, userAgent = "web:agentztein:0.1 (research radar)", days = 7, minScore = 100, limit = 12, fetchImpl = fetch, signal, now = Date.now() }) {
  const token = await redditToken({ clientId, clientSecret, userAgent, fetchImpl, signal });
  const res = await fetchImpl(redditTopUrl(), { headers: { authorization: `Bearer ${token}`, "user-agent": userAgent }, ...(signal ? { signal } : {}) });
  if (!res.ok) throw new Error(`Reddit listing failed (${res.status})`);
  const body = await res.json();
  const children = Array.isArray(body?.data?.children) ? body.data.children : [];
  const since = now - days * 86_400_000;
  /** @type {import("./story.js").Story[]} */
  const stories = [];
  for (const c of children) {
    const s = toRedditStory(c);
    if (s && s.points >= minScore && new Date(s.postedAt).getTime() >= since) stories.push(s);
  }
  return stories
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}
