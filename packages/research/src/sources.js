// The research radar's sources besides Hacker News: new papers on arXiv, the papers the community upvotes on
// Hugging Face, and fast-rising AI repositories on GitHub. All public, no key. Each source can fail on its own (rate
// limits, outages): the radar keeps whatever answered and says which ones didn't.
import { hintCapability } from "./capabilities.js";
import { fetchAiStories } from "./hn.js";

/** @typedef {"hackernews" | "arxiv" | "huggingface" | "github"} Source */
/** @type {Record<Source, { name: string, home: string }>} */
export const SOURCES = {
  hackernews: { name: "Hacker News", home: "https://news.ycombinator.com" },
  arxiv: { name: "arXiv", home: "https://arxiv.org/list/cs.AI/recent" },
  huggingface: { name: "Hugging Face Papers", home: "https://huggingface.co/papers" },
  github: { name: "GitHub", home: "https://github.com/topics/llm" },
};
export const SOURCE_IDS = /** @type {Source[]} */ (Object.keys(SOURCES));
/** How each source shows up in the pages: a short tag in its own color. */
/** @type {Record<Source, { short: string, color: string }>} */
export const SOURCE_STYLE = {
  hackernews: { short: "HN", color: "#ff6600" },
  arxiv: { short: "arXiv", color: "#b31b1b" },
  huggingface: { short: "HF Papers", color: "#e8a200" },
  github: { short: "GitHub", color: "#1c2b33" },
};

/**
 * The live feed for a browser page: the site's own /api/radar?live=1 (every source, cached by the CDN), or only
 * Hacker News straight from its public API when the site's API isn't there (a local copy of the landing).
 * @param {{ signal?: AbortSignal, limit?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ items: import("./hn.js").Story[], sources: { id: Source, ok: boolean, count: number }[] }>}
 */
export async function fetchLiveFeed({ signal, limit = 12, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl("/api/radar?live=1", signal ? { signal } : {});
    if (res.ok) {
      const body = await res.json();
      if (Array.isArray(body?.items) && body.items.length) return { items: body.items.slice(0, limit), sources: body.sources ?? [] };
    }
  } catch {
    if (signal?.aborted) throw new Error("aborted");
  }
  const items = (await fetchAiStories({ limit, fetchImpl, signal })).map((s) => ({ ...s, source: /** @type {const} */ ("hackernews") }));
  return { items, sources: [{ id: "hackernews", ok: true, count: items.length }] };
}

/** Words that make an arXiv paper relevant to an agent that improves itself on frontier benchmarks. */
const RELEVANT = /\b(agents?|agentic|benchmarks?|reasoning|tool[- ]use|self[- ]improv\w*|code generation|software engineering|terminal|web (?:agents?|navigation|browsing)|evaluation|LLMs?|language models?)\b/i;

const clean = (/** @type {string} */ s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/\s+/g, " ").trim();
const decode = (/** @type {string} */ s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const tag = (/** @type {string} */ xml, /** @type {string} */ name) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decode(clean(m[1] ?? "")) : "";
};

/**
 * Newest AI papers on arXiv (cs.AI, cs.CL, cs.LG), keeping the ones about agents, benchmarks and reasoning.
 * @param {string} atom The Atom feed of the arXiv API
 * @returns {import("./hn.js").Story[]}
 */
export function parseArxiv(atom) {
  const entries = atom.split("<entry>").slice(1).map((e) => e.split("</entry>")[0] ?? "");
  return /** @type {import("./hn.js").Story[]} */ (entries
    .map((e) => {
      const absUrl = tag(e, "id");
      const id = /abs\/([^v\s]+)/.exec(absUrl)?.[1] ?? "";
      const title = tag(e, "title");
      const summary = tag(e, "summary");
      if (!id || !title) return null;
      return {
        id: `arxiv:${id}`,
        source: /** @type {const} */ ("arxiv"),
        title,
        url: `https://arxiv.org/abs/${id}`,
        hnUrl: `https://arxiv.org/abs/${id}`,
        discussionUrl: `https://arxiv.org/abs/${id}`,
        points: 0,
        comments: 0,
        author: tag(e, "name"),
        postedAt: tag(e, "published") || new Date(0).toISOString(),
        summary: summary.slice(0, 400),
        hint: hintCapability(`${title} ${summary}`),
      };
    })
    .filter((s) => s !== null && RELEVANT.test(`${s.title} ${s.summary}`)));
}

export const ARXIV_URL =
  "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=60";

/**
 * Hugging Face Daily Papers: the papers the community picked and upvoted.
 * @param {any} body The JSON of https://huggingface.co/api/daily_papers
 * @returns {import("./hn.js").Story[]}
 */
export function parseHfPapers(body) {
  const list = Array.isArray(body) ? body : [];
  return /** @type {import("./hn.js").Story[]} */ (list
    .map((/** @type {any} */ d) => {
      const p = d?.paper ?? d ?? {};
      const id = typeof p.id === "string" ? p.id : "";
      const title = clean(String(p.title ?? d?.title ?? ""));
      if (!id || !title) return null;
      const summary = clean(String(p.summary ?? d?.summary ?? "")).slice(0, 400);
      return {
        id: `hf:${id}`,
        source: /** @type {const} */ ("huggingface"),
        title,
        url: `https://huggingface.co/papers/${encodeURIComponent(id)}`,
        hnUrl: `https://huggingface.co/papers/${encodeURIComponent(id)}`,
        discussionUrl: `https://huggingface.co/papers/${encodeURIComponent(id)}`,
        points: Number(p.upvotes ?? d?.upvotes) || 0,
        comments: Number(d?.numComments) || 0,
        author: Array.isArray(p.authors) && p.authors[0]?.name ? String(p.authors[0].name) : "",
        postedAt: String(p.publishedAt ?? d?.publishedAt ?? new Date(0).toISOString()),
        summary,
        hint: hintCapability(`${title} ${summary}`),
      };
    })
    .filter((s) => s !== null))
    .sort((a, b) => b.points - a.points);
}

export const HF_URL = "https://huggingface.co/api/daily_papers?limit=40";

/** GitHub search for AI repositories created in the last `days`, most stars first. */
export function githubUrl(days = 14, now = Date.now()) {
  const since = new Date(now - days * 86400_000).toISOString().slice(0, 10);
  const q = `topic:llm created:>${since} stars:>=50`;
  return `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=15`;
}

/**
 * @param {any} body The JSON of GitHub's repository search
 * @returns {import("./hn.js").Story[]}
 */
export function parseGithub(body) {
  const items = Array.isArray(body?.items) ? body.items : [];
  return /** @type {import("./hn.js").Story[]} */ (items
    .map((/** @type {any} */ r) => {
      const name = typeof r?.full_name === "string" ? r.full_name : "";
      if (!name) return null;
      const description = clean(String(r.description ?? "")).slice(0, 300);
      return {
        id: `gh:${name}`,
        source: /** @type {const} */ ("github"),
        title: description ? `${name}: ${description}` : name,
        url: typeof r.html_url === "string" ? r.html_url : `https://github.com/${name}`,
        hnUrl: typeof r.html_url === "string" ? r.html_url : `https://github.com/${name}`,
        discussionUrl: typeof r.html_url === "string" ? r.html_url : `https://github.com/${name}`,
        points: Number(r.stargazers_count) || 0,
        comments: 0,
        author: typeof r.owner?.login === "string" ? r.owner.login : "",
        postedAt: String(r.created_at ?? new Date(0).toISOString()),
        summary: description,
        hint: hintCapability(`${name} ${description} ${(Array.isArray(r.topics) ? r.topics : []).join(" ")}`),
      };
    })
    .filter((/** @type {unknown} */ s) => s !== null));
}

/**
 * Everything new from every source, a few per source so none drowns the others.
 * @param {{ perSource?: Partial<Record<Source, number>>, fetchImpl?: typeof fetch, signal?: AbortSignal, now?: number }} [opts]
 * @returns {Promise<{ items: import("./hn.js").Story[], sources: { id: Source, ok: boolean, count: number }[] }>}
 */
export async function fetchResearch({ perSource = {}, fetchImpl = fetch, signal, now = Date.now() } = {}) {
  const want = { hackernews: 8, arxiv: 4, huggingface: 4, github: 3, ...perSource };
  const init = signal ? { signal } : {};
  const get = async (/** @type {string} */ url, /** @type {"json" | "text"} */ as) => {
    const res = await fetchImpl(url, { ...init, headers: { accept: as === "json" ? "application/json" : "application/atom+xml" } });
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return as === "json" ? res.json() : res.text();
  };
  /** @type {Record<Source, () => Promise<import("./hn.js").Story[]>>} */
  const run = {
    hackernews: async () => (await fetchAiStories({ limit: want.hackernews, fetchImpl, signal })).map((s) => ({ ...s, source: "hackernews", discussionUrl: s.hnUrl })),
    arxiv: async () => parseArxiv(String(await get(ARXIV_URL, "text"))),
    huggingface: async () => parseHfPapers(await get(HF_URL, "json")),
    github: async () => parseGithub(await get(githubUrl(14, now), "json")),
  };
  const settled = await Promise.allSettled(SOURCE_IDS.map((id) => run[id]()));
  const items = [];
  const sources = [];
  for (const [i, r] of settled.entries()) {
    const id = /** @type {Source} */ (SOURCE_IDS[i]);
    const got = r.status === "fulfilled" ? r.value.slice(0, want[id] ?? 4) : [];
    items.push(...got);
    sources.push({ id, ok: r.status === "fulfilled", count: got.length });
  }
  return { items, sources };
}
