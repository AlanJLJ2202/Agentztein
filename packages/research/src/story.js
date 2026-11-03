// The shape every source (Hacker News, Reddit, GitHub) turns its items into, so the radar can mix them.

/** @typedef {"hackernews" | "reddit" | "github"} Source */

/** Every source the radar can read, in the order the feed interleaves them. */
export const SOURCE_IDS = /** @type {const} */ (["hackernews", "reddit", "github"]);

/**
 * @typedef {object} Story
 * @property {string} id Unique across sources: Hacker News ids are bare numbers, the others carry a prefix
 * @property {Source} source
 * @property {string} title
 * @property {string | null} url The original link (article or repository); null for text-only posts
 * @property {string} discussionUrl Where people discuss it (the thread, or the repository page)
 * @property {number} points Hacker News points, Reddit score or GitHub stars
 * @property {number | null} comments Null when the source has no comment count (GitHub)
 * @property {string} author
 * @property {string} postedAt ISO date
 * @property {import("./capabilities.js").Capability | null} hint Keyword guess, not a verdict
 */

/** Only http(s) links, never javascript: or similar. @param {unknown} v */
export const safeUrl = (v) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v : null);
