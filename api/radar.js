// /api/radar: the research radar.
//   GET   the user's past triage notes
//   POST  { provider?, lang?, effort? } read the most discussed AI stories on Hacker News this week and let the
//         user's own model decide, with a trade-off, which ones deserve an experiment in the lab.
import { EFFORTS, familyOf, fetchAiStories, parseTriage, triagePrompt, TRIAGE_SYSTEM } from "@skillab/research";
import { requireUser } from "./_lib/auth.js";
import { open } from "./_lib/crypto.js";
import { db } from "./_lib/db.js";
import { HttpError, handle, json, readJson } from "./_lib/http.js";
import { complete, isProvider } from "./_lib/providers.js";

const COOLDOWN_S = 60;

/** @param {any} r */
const note = (r) => ({
  id: r.external_id,
  source: r.source,
  title: r.title,
  url: r.url,
  discussionUrl: r.discussion_url,
  points: r.points,
  postedAt: r.posted_at,
  capability: r.capability,
  verdict: r.verdict,
  gain: r.gain,
  cost: r.cost,
  why: r.why,
  provider: r.provider,
  model: r.model,
  assessedAt: r.created_at,
});

export const GET = handle(async (request) => {
  const user = await requireUser(request);
  const { rows } = await db().query(
    "SELECT * FROM app.research_notes WHERE user_id = $1 ORDER BY created_at DESC, points DESC NULLS LAST LIMIT 120",
    [user.id],
  );
  return json({ notes: rows.map(note) });
});

export const POST = handle(async (request) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const lang = body.lang === "es" ? "es" : "en";
  const pool = db();

  const wanted = isProvider(body.provider) ? body.provider : null;
  const { rows: keys } = await pool.query(
    `SELECT provider, secret, model FROM app.provider_keys WHERE user_id = $1 ${wanted ? "AND provider = $2" : ""}
     ORDER BY updated_at DESC LIMIT 1`,
    wanted ? [user.id, wanted] : [user.id],
  );
  const row = keys[0];
  if (!row) throw new HttpError(409, "Connect an API key first", { reason: "no-key" });
  if (!row.model) throw new HttpError(409, "Choose which model to use first", { reason: "no-model" });

  const { rows: last } = await pool.query("SELECT max(created_at) AS at FROM app.research_notes WHERE user_id = $1", [user.id]);
  const wait = last[0]?.at ? COOLDOWN_S - (Date.now() - new Date(last[0].at).getTime()) / 1000 : 0;
  if (wait > 0) throw new HttpError(429, `Give it ${Math.ceil(wait)} s before the next round`);

  let stories;
  try {
    stories = await fetchAiStories({ days: 7, minPoints: 40, limit: 12, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new HttpError(502, "Hacker News did not answer; try again in a moment");
  }
  if (!stories.length) return json({ notes: [], read: 0 });

  const key = open(row.secret, { userId: user.id, provider: row.provider });
  // effort only for models that take it (Muse Spark); Muse Wonder always reasons at full depth
  const fam = familyOf(row.model);
  const effort = fam && !fam.effort ? null : EFFORTS.includes(body.effort) ? body.effort : "low";
  const reply = await complete({ provider: row.provider, key, model: row.model, effort, system: TRIAGE_SYSTEM, user: triagePrompt(stories, lang) });
  let assessments;
  try {
    assessments = parseTriage(reply, stories.map((s) => s.id));
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : "Unreadable answer");
  }
  const byId = new Map(stories.map((s) => [s.id, s]));
  const client = await pool.connect();
  const saved = [];
  try {
    await client.query("BEGIN");
    for (const a of assessments) {
      const s = byId.get(a.id);
      if (!s) continue;
      const { rows } = await client.query(
        `INSERT INTO app.research_notes (user_id, source, external_id, title, url, discussion_url, points, posted_at,
           capability, verdict, gain, cost, why, provider, model)
         VALUES ($1, 'hackernews', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (user_id, source, external_id) DO UPDATE SET title = EXCLUDED.title, points = EXCLUDED.points,
           capability = EXCLUDED.capability, verdict = EXCLUDED.verdict, gain = EXCLUDED.gain, cost = EXCLUDED.cost,
           why = EXCLUDED.why, provider = EXCLUDED.provider, model = EXCLUDED.model, created_at = now()
         RETURNING *`,
        [user.id, s.id, s.title, s.url, s.hnUrl, s.points, s.postedAt, a.capability, a.verdict, a.gain, a.cost, a.why, row.provider, row.model],
      );
      saved.push(note(rows[0]));
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return json({ notes: saved, read: stories.length, provider: row.provider, model: row.model, effort });
});
