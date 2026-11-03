// GET /api/feed: what the tech communities (Hacker News, Reddit, GitHub) discuss most about AI this week.
// Public and cached at the edge; the landing and the app read it instead of calling the sources themselves.
// `sources` says which ones answered ("ok"), failed ("error") or aren't configured yet ("off").
import { loadFeed } from "./_lib/feed.js";
import { HttpError, handle } from "./_lib/http.js";

export const GET = handle(async () => {
  let feed;
  try {
    feed = await loadFeed({ limit: 12 });
  } catch {
    throw new HttpError(502, "The news sources did not answer; try again in a moment");
  }
  const stories = feed.stories.map(({ id, source, title, url, points, comments, postedAt, hint }) => ({ id, source, title, url, points, comments, postedAt, hint }));
  return new Response(JSON.stringify({ stories, sources: feed.status }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
    },
  });
});
