// POST /api/track: what a visitor did on the landing or the app (ADR-034). Sent by navigator.sendBeacon as text/plain
// (no CORS preflight), or by fetch when the app reports a sign-in with the session token, which ties the visit to
// the account. Always answers 204, even for bots and bad bodies: the page never waits on it and never retries.
//   { v, s, page, lang?, ref?, utm?: { source, medium, campaign }, events: [{ e, t?, n? }] }
import { requireUser } from "./_lib/auth.js";
import { db } from "./_lib/db.js";
import { MAX_PER_DAY, isBot, parseBatch } from "./_lib/visits.js";

const COLS = ["visitor_id", "session_id", "page", "event", "target", "value", "referrer", "utm_source", "utm_medium", "utm_campaign", "country", "device", "lang", "user_id"];
const done = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(/** @type {Request} */ request) {
  try {
    const ua = request.headers.get("user-agent");
    if (isBot(ua) || !process.env.DATABASE_URL) return done();
    const text = await request.text();
    if (text.length > 16_000) return done();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return done();
    }
    const rows = parseBatch(body, {
      ua,
      host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
      country: request.headers.get("x-vercel-ip-country"),
    });
    if (!rows?.length) return done();

    const pool = db();
    const { rows: seen } = await pool.query(
      "SELECT count(*)::int AS n FROM app.visit_events WHERE visitor_id = $1 AND created_at > now() - interval '1 day'",
      [rows[0].visitorId],
    );
    if ((seen[0]?.n ?? 0) + rows.length > MAX_PER_DAY) return done();

    // only a sign-in carries a token, and only a token Supabase accepts names the user
    let userId = null;
    if (rows.some((r) => r.event === "signed_in") && request.headers.get("authorization")) {
      userId = await requireUser(request).then((u) => u.id, () => null);
    }
    /** @type {unknown[]} */
    const values = [];
    const tuples = rows.map((r) => {
      const row = [r.visitorId, r.sessionId, r.page, r.event, r.target, r.value, r.referrer, r.utmSource, r.utmMedium, r.utmCampaign, r.country, r.device, r.lang, r.event === "signed_in" ? userId : null];
      const at = values.length;
      values.push(...row);
      return `(${row.map((_, i) => `$${at + i + 1}`).join(", ")})`;
    });
    await pool.query(`INSERT INTO app.visit_events (${COLS.join(", ")}) VALUES ${tuples.join(", ")}`, values);
  } catch (err) {
    console.error("track", err);
  }
  return done();
}
