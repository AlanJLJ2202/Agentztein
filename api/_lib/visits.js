// Site traffic (ADR-034): what /api/track accepts from the browser, and the summary /api/visits shows the owners.
// No cookies, no IP and no fingerprint: the browser keeps a random visitor id, the country comes from Vercel's edge
// header and the device from the user agent, reduced to mobile / tablet / desktop. Obvious bots are dropped.

export const EVENTS = /** @type {const} */ (["view", "section", "cta", "lab", "leave", "tab", "signin", "signed_in"]);
const EVENT_SET = new Set(/** @type {readonly string[]} */ (EVENTS));
const ID = /^[A-Za-z0-9_-]{8,64}$/;
const TARGET = /^[a-z0-9:_-]{1,48}$/i;
/** most events one request may carry, and one visitor may leave in a day (the rest are dropped) */
export const MAX_BATCH = 25;
export const MAX_PER_DAY = 600;
/** a "leave" reports visible time; more than 6 hours in one go is a tab left open, not reading */
const MAX_VISIBLE_MS = 6 * 3600 * 1000;

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|curl|wget|python|axios|node-fetch|undici|go-http|java\/|okhttp|playwright|puppeteer|phantom|selenium|vercel|monitor|uptime|pingdom/i;

/** @param {string | null} ua */
export function isBot(ua) {
  return !ua || ua.length < 20 || BOT.test(ua);
}

/** @param {string | null} ua @returns {"mobile" | "tablet" | "desktop"} */
export function deviceOf(ua) {
  const s = ua ?? "";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|BlackBerry|Opera Mini|IEMobile/i.test(s)) return "mobile";
  return "desktop";
}

/** The host of the page that sent the visitor, or null when it is this same site or not a URL. */
export function referrerHost(raw, ownHost) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const bare = (/** @type {string} */ h) => h.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
    const host = bare(new URL(raw).hostname);
    if (!host || host === bare(ownHost ?? "")) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

/** @param {unknown} v */
const short = (v, n = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

/**
 * Turns what the browser sent into rows ready to insert, or null when the body is not a visit at all.
 * Unknown events and malformed targets are dropped one by one; the rest of the batch still counts.
 * @param {unknown} body
 * @param {{ ua: string | null, host: string | null, country: string | null }} req
 */
export function parseBatch(body, req) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = /** @type {Record<string, unknown>} */ (body);
  const visitorId = typeof b.v === "string" && ID.test(b.v) ? b.v : null;
  const sessionId = typeof b.s === "string" && ID.test(b.s) ? b.s : null;
  const page = b.page === "landing" || b.page === "app" ? b.page : null;
  if (!visitorId || !sessionId || !page || !Array.isArray(b.events)) return null;
  const utm = b.utm && typeof b.utm === "object" ? /** @type {Record<string, unknown>} */ (b.utm) : {};
  const shared = {
    visitorId,
    sessionId,
    page,
    referrer: referrerHost(b.ref, req.host),
    utmSource: short(utm.source),
    utmMedium: short(utm.medium),
    utmCampaign: short(utm.campaign),
    country: req.country && /^[A-Z]{2}$/.test(req.country) ? req.country : null,
    device: deviceOf(req.ua),
    lang: b.lang === "es" || b.lang === "en" ? b.lang : null,
  };
  const events = [];
  for (const raw of b.events.slice(0, MAX_BATCH)) {
    if (!raw || typeof raw !== "object") continue;
    const e = /** @type {Record<string, unknown>} */ (raw);
    if (typeof e.e !== "string" || !EVENT_SET.has(e.e)) continue;
    const target = typeof e.t === "string" && TARGET.test(e.t) ? e.t.toLowerCase() : null;
    const n = Number(e.n);
    const value = e.n == null || !Number.isFinite(n) ? null : Math.max(0, Math.min(MAX_VISIBLE_MS, Math.round(n)));
    if (e.e === "leave" && !value) continue;
    events.push({ ...shared, event: e.e, target, value });
  }
  return events;
}

/** @param {string | null | undefined} email */
export function isAdmin(email) {
  const list = (process.env.ADMIN_EMAILS ?? "").split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return Boolean(email) && list.includes(String(email).toLowerCase());
}

/**
 * The steps of the visit, in the order the site leads people through it. A visitor "reached" a step when they did it
 * at least once in the period; the last two come from the account they created (keys saved, cycles run).
 * Every `where` is a constant written here, never input.
 */
export const STEPS = [
  { id: "landing", en: "Opened the landing", es: "Abrió la landing", where: "page = 'landing' AND event = 'view'" },
  { id: "como-funciona", en: "Read “How it works”", es: "Leyó “Cómo funciona”", where: "event = 'section' AND target = 'como-funciona'" },
  { id: "meta", en: "Reached Meta's models", es: "Llegó a los modelos de Meta", where: "event = 'section' AND target = 'meta'" },
  { id: "app-shots", en: "Saw the app screenshots", es: "Vio las capturas de la app", where: "event = 'section' AND target = 'app'" },
  { id: "laboratorio", en: "Reached the 3D lab", es: "Llegó al laboratorio 3D", where: "event = 'section' AND target = 'laboratorio'" },
  { id: "lab", en: "Played with the 3D lab", es: "Jugó con el laboratorio 3D", where: "event = 'lab'" },
  { id: "arnes", en: "Reached the harness", es: "Llegó al arnés", where: "event = 'section' AND target = 'arnes'" },
  { id: "fin", en: "Scrolled to the end", es: "Bajó hasta el final", where: "event = 'section' AND target IN ('avance', 'fin')" },
  { id: "cta", en: "Clicked to enter the app", es: "Hizo clic para entrar a la app", where: "event = 'cta'" },
  { id: "app", en: "Opened the app", es: "Abrió la app", where: "page = 'app'" },
  { id: "signed_in", en: "Signed in", es: "Inició sesión", where: "event = 'signed_in'" },
];

/** @param {import("pg").Pool} pool @param {number} days */
export async function summary(pool, days) {
  const since = "created_at >= now() - make_interval(days => $1)";
  const flags = STEPS.map((s, i) => `bool_or(${s.where}) AS s${i}`).join(",\n      ");
  const counts = STEPS.map((_, i) => `count(*) FILTER (WHERE s${i})::int AS s${i}`).join(", ");
  const [funnel, totals, daily, refs, utms, countries, devices, ctas, tabs, sessions] = await Promise.all([
    pool.query(
      `WITH v AS (
         SELECT visitor_id, ${flags},
           (array_agg(user_id) FILTER (WHERE user_id IS NOT NULL))[1] AS user_id
         FROM app.visit_events WHERE ${since} GROUP BY visitor_id
       )
       SELECT ${counts},
         count(*) FILTER (WHERE user_id IS NOT NULL AND EXISTS (SELECT 1 FROM app.provider_keys k WHERE k.user_id = v.user_id))::int AS key,
         count(*) FILTER (WHERE user_id IS NOT NULL AND EXISTS (SELECT 1 FROM app.agent_jobs j WHERE j.user_id = v.user_id))::int AS run
       FROM v`,
      [days],
    ),
    pool.query(
      `SELECT count(DISTINCT visitor_id)::int AS visitors, count(DISTINCT session_id)::int AS sessions,
         count(*) FILTER (WHERE event = 'view')::int AS views,
         count(DISTINCT visitor_id) FILTER (WHERE visitor_id IN (
           SELECT visitor_id FROM app.visit_events GROUP BY visitor_id HAVING min(created_at) >= now() - make_interval(days => $1)
         ))::int AS new_visitors,
         (SELECT coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY ms), 0)::int FROM (
           SELECT sum(value) AS ms FROM app.visit_events WHERE ${since} AND event = 'leave' AND page = 'landing' GROUP BY session_id
         ) t) AS median_ms
       FROM app.visit_events WHERE ${since}`,
      [days],
    ),
    pool.query(
      `SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'America/Mexico_City'), 'YYYY-MM-DD') AS day,
         count(DISTINCT visitor_id)::int AS visitors, count(DISTINCT session_id)::int AS sessions
       FROM app.visit_events WHERE ${since} GROUP BY 1 ORDER BY 1`,
      [days],
    ),
    // where each visitor came from the first time we saw them in the period
    pool.query(
      `SELECT coalesce(referrer, '') AS name, count(*)::int AS n FROM (
         SELECT DISTINCT ON (visitor_id) visitor_id, referrer FROM app.visit_events
         WHERE ${since} AND event = 'view' ORDER BY visitor_id, created_at
       ) f GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
      [days],
    ),
    pool.query(
      `SELECT concat_ws(' / ', utm_source, utm_medium, utm_campaign) AS name, count(DISTINCT visitor_id)::int AS n
       FROM app.visit_events WHERE ${since} AND utm_source IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
      [days],
    ),
    pool.query(
      `SELECT coalesce(country, '') AS name, count(DISTINCT visitor_id)::int AS n
       FROM app.visit_events WHERE ${since} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
      [days],
    ),
    pool.query(
      `SELECT coalesce(device, '') AS name, count(DISTINCT visitor_id)::int AS n
       FROM app.visit_events WHERE ${since} GROUP BY 1 ORDER BY 2 DESC`,
      [days],
    ),
    pool.query(
      `SELECT coalesce(target, '') AS name, count(DISTINCT visitor_id)::int AS n
       FROM app.visit_events WHERE ${since} AND event = 'cta' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
      [days],
    ),
    pool.query(
      `SELECT coalesce(target, '') AS name, count(DISTINCT visitor_id)::int AS n
       FROM app.visit_events WHERE ${since} AND event = 'tab' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
      [days],
    ),
    // the latest visits, one row each, with everything they did: the page turns it into "how far they got"
    pool.query(
      `SELECT session_id, min(created_at) AS started, max(created_at) AS ended,
         (array_agg(country) FILTER (WHERE country IS NOT NULL))[1] AS country,
         (array_agg(device) FILTER (WHERE device IS NOT NULL))[1] AS device,
         (array_agg(referrer ORDER BY created_at) FILTER (WHERE referrer IS NOT NULL))[1] AS referrer,
         coalesce(sum(value) FILTER (WHERE event = 'leave'), 0)::int AS ms,
         bool_or(user_id IS NOT NULL) AS known,
         ${STEPS.map((s, i) => `bool_or(${s.where}) AS s${i}`).join(", ")}
       FROM app.visit_events WHERE ${since}
       GROUP BY session_id ORDER BY max(created_at) DESC LIMIT 30`,
      [days],
    ),
  ]);

  const f = funnel.rows[0] ?? {};
  const t = totals.rows[0] ?? {};
  const deepest = (/** @type {Record<string, unknown>} */ row) => {
    let last = -1;
    STEPS.forEach((_, i) => { if (row[`s${i}`]) last = i; });
    return last >= 0 ? STEPS[last].id : null;
  };
  return {
    days,
    totals: {
      visitors: t.visitors ?? 0,
      newVisitors: t.new_visitors ?? 0,
      sessions: t.sessions ?? 0,
      views: t.views ?? 0,
      medianSeconds: Math.round((t.median_ms ?? 0) / 1000),
    },
    funnel: [
      ...STEPS.map((s, i) => ({ id: s.id, en: s.en, es: s.es, visitors: Number(f[`s${i}`] ?? 0) })),
      { id: "key", en: "Saved their Meta key", es: "Guardó su llave de Meta", visitors: Number(f.key ?? 0) },
      { id: "run", en: "Ran the agent", es: "Corrió el agente", visitors: Number(f.run ?? 0) },
    ],
    daily: daily.rows,
    referrers: refs.rows,
    campaigns: utms.rows,
    countries: countries.rows,
    devices: devices.rows,
    ctas: ctas.rows,
    tabs: tabs.rows,
    sessions: sessions.rows.map((r) => ({
      id: String(r.session_id).slice(0, 8),
      started: r.started,
      seconds: Math.max(Math.round(r.ms / 1000), Math.round((new Date(r.ended).getTime() - new Date(r.started).getTime()) / 1000)),
      country: r.country,
      device: r.device,
      referrer: r.referrer,
      signedIn: Boolean(r.known) || Boolean(r[`s${STEPS.length - 1}`]),
      reached: deepest(r),
      steps: STEPS.filter((_, i) => r[`s${i}`]).map((s) => s.id),
    })),
  };
}
