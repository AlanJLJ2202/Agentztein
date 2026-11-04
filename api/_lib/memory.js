// Agentztein's memory, in four layers (ADR-031):
//   working     the prompt of each call. Nobody reads "everything": each reader (planner, director, talk) gets a
//               memory block packed to its own character budget, most relevant and strongest first.
//   episodic    what happened: every cycle (app.agent_jobs) with its trace, mistakes and verdict. Raw, long, never
//               sent whole to a model.
//   semantic    what it learned from those cycles: short lessons (app.agent_memories), written only while it dreams.
//   procedural  how it does things: its skills and its own code, which only change behind the harness.
//
// Dreaming: with no exam running, the planner model rereads the cycles it hasn't digested yet (each squeezed into
// one line) and the lessons it already has (under short aliases m1, m2… instead of uuids), and answers which to
// keep, rewrite, add or forget. The heavy reasoning happens once, there; cycles afterwards read the result. The
// server applies the answer by fixed rules: a lesson kept or rewritten gets stronger; one it neither mentions nor
// used since the last dream fades a step; at zero it is forgotten (the row stays, status "faded"). A person can pin
// a lesson (it never fades) or forget it. Memory never reaches the executor: exams only see skills that passed the
// harness, so remembering can't leak an answer into a grade.
import { benchSummary, parseJsonObject } from "./agent.js";
import { HttpError } from "./http.js";

export const MEMORY_KINDS = /** @type {const} */ (["rule", "dead-end", "strategy", "fact"]);
export const MEMORY_STATUS = /** @type {const} */ (["active", "faded", "superseded", "forgotten"]);
export const MEMORY_TEXT_MAX = 240;
export const MAX_ACTIVE = 40;
export const START_STRENGTH = 2;
export const MAX_STRENGTH = 5;
/** Finished cycles not yet dreamt about after which a cycle the agent decides itself starts by dreaming. */
export const DREAM_AFTER = 3;
/** Most cycles one dream digests (older ones wait for the next). */
export const DREAM_JOBS = 10;
/** What a dream may spend when a person asks for one outside a cycle (USD). */
export const DREAM_CAP = 0.25;
/** Characters of memory each reader gets in its prompt. */
export const BUDGETS = { planner: 1200, director: 900, talk: 500 };

/** A record id from the bench (memorizing one is never a lesson); the same pattern the core rules use. */
const RECORD_ID = /\b[ib]_[0-9a-f]{12}\b/;

/** @typedef {{ id: string, scope: string, kind: string, text: string, strength: number, pinned: boolean, evidence: string[], uses: number, last_used_at: Date | string | null, updated_at: Date | string, created_at?: Date | string }} MemoryRow */

/** Every scope a lesson may have: the whole lab, one exam, or one situation inside an exam. */
export function scopes() {
  const out = ["global"];
  for (const b of benchSummary()) {
    if (b.legacy) continue;
    out.push(b.id);
    for (const c of b.contexts) out.push(`${b.id}:${c.id}`);
  }
  return out;
}

/** A lesson's text, cleaned; null if it can't be one (too short, or it names a concrete record). @param {unknown} v */
export function lessonText(v) {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().slice(0, MEMORY_TEXT_MAX);
  if (t.length < 12 || RECORD_ID.test(t)) return null;
  return t;
}

const norm = (/** @type {string} */ s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const time = (/** @type {Date | string | null | undefined} */ d) => (d ? new Date(d).getTime() : 0);

/** @param {any} s */
const frac = (s) => Object.entries(s ?? {}).map(([c, v]) => `${c} ${/** @type {any} */ (v).correct}/${/** @type {any} */ (v).total}`).join(", ") || "—";
const clip = (/** @type {unknown} */ s, n = 160) => {
  const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * One finished cycle in one line: the episode the dream rereads. Deterministic, so the same cycle always costs the
 * same tokens. Only practice mistakes appear (the planner already saw those answers); validation is only counts.
 * @param {string} alias @param {any} job
 */
export function episodeLine(alias, job) {
  const s = job.state ?? {};
  const v = s.verdict;
  const parts = [`${alias} · ${job.scenario} · ejecutor ${job.executor}${job.effort ? ` esfuerzo ${job.effort}` : ""}`];
  parts.push(`resultado ${s.outcome ?? job.phase}${v?.reason ? ` (arnés: ${v.reason})` : ""}`);
  if (s.plan?.why) parts.push(`el director eligió porque: ${clip(s.plan.why, 140)}`);
  if (s.before?.validation) parts.push(`validación antes ${frac(s.before.validation)}${s.after ? ` → con la candidata ${frac(s.after)}` : ""}`);
  if (s.candidate) parts.push(`candidata ${s.candidate.context} v${s.candidate.version}: "${clip(s.candidate.instructions, 200)}" — por qué: "${clip(s.candidate.rationale, 140)}"`);
  const wrong = Array.isArray(s.practice) ? s.practice.filter((/** @type {any} */ p) => !p.ok).slice(0, 3) : [];
  if (wrong.length) {
    parts.push(`errores de práctica: ${wrong.map((/** @type {any} */ p) => `[${p.context}] ${clip(Object.entries(p.fields ?? {}).map(([k, x]) => `${k}=${typeof x === "number" ? x : JSON.stringify(x)}`).join("; "), 120)} → correcta ${p.truth}, dijo ${p.given ?? "nada"}`).join(" | ")}`);
  }
  if (s.detail) parts.push(`detalle: ${clip(s.detail, 100)}`);
  return parts.join(" · ");
}

export const DREAM_SYSTEM =
  "Eres Agentztein soñando: no hay ningún examen corriendo. Relees tus ciclos recientes y lo que ya recuerdas, y " +
  "consolidas tu memoria para que la próxima vez gastes menos contexto y menos razonamiento. Guarda solo lo que " +
  "cambiaría una decisión futura: reglas que encontraste en los datos (qué campo, qué umbral, qué fórmula: kind rule), " +
  "callejones sin salida (una habilidad, modelo o esfuerzo que no mejoró, y por qué: kind dead-end), estrategias (qué " +
  "modelo y esfuerzo rinden en qué examen: kind strategy) y datos estables del laboratorio (kind fact). Cada recuerdo es " +
  "una sola frase general y comprobable, de máximo 240 caracteres; nunca ids, números de fila ni registros concretos. " +
  "Fusiona los repetidos, reescribe los que la nueva evidencia corrige, olvida los que los hechos contradicen o ya no " +
  "sirven, y en keep pon los que siguen valiendo. Menos y mejores recuerdos es mejor que muchos. Responde SOLO con JSON.";

/**
 * @param {{ episodes: { alias: string, line: string }[], memories: { alias: string, row: MemoryRow }[], lang: string }} o
 */
export function dreamPrompt(o) {
  const parts = [
    `Alcances posibles: ${scopes().join(", ")}.`,
    o.memories.length
      ? `Lo que ya recuerdas (alias · tipo · alcance · fuerza 1-${MAX_STRENGTH}${o.memories.some((m) => m.row.pinned) ? " · fijado por la persona" : ""}):\n${o.memories
        .map((m) => `- ${m.alias} · ${m.row.kind} · ${m.row.scope} · ${m.row.strength}${m.row.pinned ? " · fijado" : ""}: ${m.row.text}`)
        .join("\n")}`
      : "Todavía no recuerdas nada.",
    `Ciclos que no has digerido:\n${o.episodes.map((e) => `- ${e.line}`).join("\n")}`,
    `Escribe "text" y "summary" en ${o.lang === "es" ? "español, con palabras sencillas" : "plain English"}. "summary" es una o dos frases: qué soñaste.`,
    'Formato: {"keep": ["m1"], "rewrite": [{"id": "m2", "text": "..."}], "add": [{"scope": "<alcance>", "kind": "rule|dead-end|strategy|fact", ' +
      '"text": "...", "evidence": ["c1"]}], "forget": ["m3"], "summary": "..."}',
  ];
  return parts.join("\n\n");
}

/**
 * Reads the dream. Anything it can't use is dropped and named in `fixes`; aliases go back to real ids.
 * @param {string} reply
 * @param {{ memories: { alias: string, row: MemoryRow }[], episodes: { alias: string, id: string }[] }} ctx
 */
export function parseDream(reply, ctx) {
  /** @type {any} */
  let obj = {};
  /** @type {string[]} */
  const fixes = [];
  try {
    obj = parseJsonObject(reply);
  } catch {
    fixes.push("unreadable");
  }
  const byAlias = new Map(ctx.memories.map((m) => [m.alias, m.row]));
  const jobOf = new Map(ctx.episodes.map((e) => [e.alias, e.id]));
  const allowed = new Set(scopes());
  const ids = (/** @type {unknown} */ list) => (Array.isArray(list) ? list : [])
    .map((a) => byAlias.get(String(a).trim())?.id)
    .filter((x) => typeof x === "string");
  const keep = new Set(ids(obj.keep));
  const forget = new Set(ids(obj.forget));
  /** @type {{ id: string, text: string }[]} */
  const rewrite = [];
  for (const r of Array.isArray(obj.rewrite) ? obj.rewrite : []) {
    const row = byAlias.get(String(r?.id ?? "").trim());
    const text = lessonText(r?.text);
    if (!row || !text) { fixes.push("rewrite"); continue; }
    if (norm(text) === norm(row.text)) keep.add(row.id);
    else rewrite.push({ id: row.id, text });
  }
  /** @type {{ scope: string, kind: string, text: string, evidence: string[] }[]} */
  const add = [];
  for (const a of Array.isArray(obj.add) ? obj.add : []) {
    const text = lessonText(a?.text);
    const scope = typeof a?.scope === "string" ? a.scope.trim() : "";
    const kind = typeof a?.kind === "string" ? a.kind.trim() : "";
    if (!text || !allowed.has(scope) || !(/** @type {readonly string[]} */ (MEMORY_KINDS)).includes(kind)) { fixes.push("add"); continue; }
    const evidence = (Array.isArray(a.evidence) ? a.evidence : []).map((e) => jobOf.get(String(e).trim())).filter((x) => typeof x === "string");
    add.push({ scope, kind, text, evidence: [...new Set(evidence)] });
  }
  // a lesson can't be kept and forgotten at once: forgetting wins only if it wasn't also rewritten
  for (const r of rewrite) forget.delete(r.id);
  for (const id of forget) keep.delete(id);
  const summary = typeof obj.summary === "string" ? obj.summary.replace(/\s+/g, " ").trim().slice(0, 400) : "";
  return { keep, rewrite, add: add.slice(0, 8), forget, summary, fixes };
}

/**
 * The fixed rules a dream is applied with. Pure: returns what to write, the caller writes it.
 * @param {MemoryRow[]} memories the active ones
 * @param {ReturnType<typeof parseDream>} dream
 * @param {Date | string | null} lastDreamAt
 */
export function consolidate(memories, dream, lastDreamAt) {
  const since = time(lastDreamAt);
  /** @type {{ id: string, strength: number }[]} */
  const strengthen = [];
  /** @type {{ id: string, strength: number }[]} */
  const weaken = [];
  /** @type {string[]} */
  const fade = [];
  /** @type {{ parent: MemoryRow, text: string, strength: number }[]} */
  const supersede = [];
  /** @type {{ scope: string, kind: string, text: string, evidence: string[] }[]} */
  const add = [];
  const rewritten = new Map(dream.rewrite.map((r) => [r.id, r.text]));
  for (const m of memories) {
    const up = Math.min(MAX_STRENGTH, m.strength + 1);
    // a person pinned it: dreams can't rewrite, fade or forget it, only find it still holds
    if (m.pinned) { if ((dream.keep.has(m.id) || rewritten.has(m.id)) && up !== m.strength) strengthen.push({ id: m.id, strength: up }); continue; }
    if (rewritten.has(m.id)) supersede.push({ parent: m, text: /** @type {string} */ (rewritten.get(m.id)), strength: up });
    else if (dream.keep.has(m.id)) { if (up !== m.strength) strengthen.push({ id: m.id, strength: up }); }
    else if (dream.forget.has(m.id)) fade.push(m.id);
    else if (time(m.last_used_at) > since) continue; // used since the last dream: it earned its place
    else if (m.strength <= 1) fade.push(m.id);
    else weaken.push({ id: m.id, strength: m.strength - 1 });
  }
  const known = new Set(memories.filter((m) => !fade.includes(m.id)).map((m) => norm(m.text)));
  for (const r of supersede) known.add(norm(r.text));
  for (const a of dream.add) {
    const k = norm(a.text);
    if (known.has(k)) continue; // the same lesson again is not a new one
    known.add(k);
    add.push(a);
  }
  // never more than MAX_ACTIVE: the weakest unpinned lessons fade first (new ones count, at START_STRENGTH)
  const left = memories.filter((m) => !fade.includes(m.id)).length + add.length;
  if (left > MAX_ACTIVE) {
    const strengthOf = new Map([...strengthen, ...weaken].map((x) => [x.id, x.strength]));
    for (const s of supersede) strengthOf.set(s.parent.id, s.strength);
    const pool = memories
      .filter((m) => !m.pinned && !fade.includes(m.id))
      .sort((a, b) => (strengthOf.get(a.id) ?? a.strength) - (strengthOf.get(b.id) ?? b.strength) || time(a.last_used_at ?? a.updated_at) - time(b.last_used_at ?? b.updated_at));
    for (const m of pool.slice(0, left - MAX_ACTIVE)) fade.push(m.id);
  }
  const faded = new Set(fade);
  return {
    strengthen: strengthen.filter((x) => !faded.has(x.id)),
    weaken: weaken.filter((x) => !faded.has(x.id)),
    fade,
    supersede: supersede.filter((x) => !faded.has(x.parent.id)),
    add,
  };
}

/**
 * The memory block for one reader, packed to its budget: the lessons for this exam and situation first, then the
 * lab-wide ones; inside that, pinned and stronger first, then the most recent. Lessons for other exams only enter
 * when no exam is given (the director, the talk).
 * @param {MemoryRow[]} memories @param {{ budget: number, scenario?: string, context?: string }} o
 * @returns {{ text: string, ids: string[] }}
 */
export function recall(memories, o) {
  const rel = (/** @type {MemoryRow} */ m) => {
    if (!o.scenario) return m.scope === "global" ? 2 : 1;
    if (o.context && m.scope === `${o.scenario}:${o.context}`) return 4;
    if (m.scope === o.scenario) return 3;
    if (m.scope.startsWith(`${o.scenario}:`)) return 2;
    return m.scope === "global" ? 1 : 0;
  };
  const ranked = memories
    .map((m) => ({ m, r: rel(m) }))
    .filter((x) => x.r > 0)
    .sort((a, b) => b.r - a.r || Number(b.m.pinned) - Number(a.m.pinned) || b.m.strength - a.m.strength || time(b.m.updated_at) - time(a.m.updated_at));
  const lines = [];
  const ids = [];
  let used = 0;
  for (const { m } of ranked) {
    const line = `- [${m.kind} · ${m.scope}] ${m.text}`;
    if (used + line.length + 1 > o.budget) continue;
    lines.push(line);
    ids.push(m.id);
    used += line.length + 1;
  }
  return { text: lines.join("\n"), ids };
}

/** @param {any} r */
export const memoryOut = (r) => ({
  id: r.id,
  scope: r.scope,
  kind: r.kind,
  text: r.text,
  strength: r.strength,
  pinned: r.pinned,
  status: r.status,
  evidence: Array.isArray(r.evidence) ? r.evidence : [],
  parentId: r.parent_id,
  uses: r.uses,
  lastUsedAt: r.last_used_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** @param {any} r */
export const dreamOut = (r) => ({
  id: r.id,
  model: r.model,
  jobs: Array.isArray(r.jobs) ? r.jobs.length : 0,
  summary: r.summary,
  stats: r.stats ?? {},
  cost: Number(r.cost_usd ?? 0),
  createdAt: r.created_at,
});

/** @param {import("pg").Pool | import("pg").PoolClient} pool @param {string} userId @returns {Promise<MemoryRow[]>} */
export async function activeMemories(pool, userId) {
  const { rows } = await pool.query(
    "SELECT * FROM app.agent_memories WHERE user_id = $1 AND status = 'active' ORDER BY pinned DESC, strength DESC, updated_at DESC",
    [userId],
  );
  return rows;
}

/** How many finished cycles it hasn't dreamt about. @param {import("pg").Pool} pool @param {string} userId */
export async function undigested(pool, userId) {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM app.agent_jobs WHERE user_id = $1 AND phase = 'done' AND dreamt_at IS NULL", [userId]);
  return Number(rows[0]?.n ?? 0);
}

/** Notes that these lessons went into a prompt (so they don't fade). @param {import("pg").Pool} pool @param {string[]} ids */
export async function markUsed(pool, ids) {
  if (!ids.length) return;
  await pool.query("UPDATE app.agent_memories SET uses = uses + 1, last_used_at = now() WHERE id = ANY($1::uuid[]) AND status = 'active'", [ids]);
}

/**
 * Builds the dream's prompt from the database: the cycles not digested yet (oldest first, at most DREAM_JOBS) and
 * the active lessons, both under short aliases.
 * @param {import("pg").Pool} pool @param {string} userId @param {string} lang
 */
export async function dreamInput(pool, userId, lang) {
  const [{ rows: jobs }, memories, { rows: last }] = await Promise.all([
    pool.query(
      "SELECT id, scenario, executor, effort, phase, state FROM app.agent_jobs WHERE user_id = $1 AND phase = 'done' AND dreamt_at IS NULL ORDER BY created_at ASC LIMIT $2",
      [userId, DREAM_JOBS],
    ),
    activeMemories(pool, userId),
    pool.query("SELECT created_at FROM app.agent_dreams WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [userId]),
  ]);
  const episodes = jobs.map((j, i) => ({ alias: `c${i + 1}`, id: /** @type {string} */ (j.id), line: episodeLine(`c${i + 1}`, j) }));
  const mem = memories.map((row, i) => ({ alias: `m${i + 1}`, row }));
  return { episodes, memories: mem, lastDreamAt: last[0]?.created_at ?? null, prompt: dreamPrompt({ episodes, memories: mem, lang }) };
}

/**
 * Writes a dream: the new lessons and the status and strength changes, the digested cycles marked, and the dream
 * itself, in one transaction.
 * @param {import("pg").Pool} pool @param {string} userId
 * @param {{ model: string, cost: number, jobIds: string[], summary: string, plan: ReturnType<typeof consolidate>, fixes: string[], jobId?: string | null }} d
 */
export async function saveDream(pool, userId, d) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // two dreams at once over the same cycles: the second one finds them taken and writes nothing
    if (d.jobIds.length) {
      const { rows: free } = await client.query("SELECT id FROM app.agent_jobs WHERE id = ANY($1::uuid[]) AND user_id = $2 AND dreamt_at IS NULL FOR UPDATE", [d.jobIds, userId]);
      if (free.length !== d.jobIds.length) throw new HttpError(409, "It already dreamt about these cycles", { reason: "dreamt" });
    }
    const stats = {
      added: d.plan.add.length, rewritten: d.plan.supersede.length, strengthened: d.plan.strengthen.length,
      weakened: d.plan.weaken.length, faded: d.plan.fade.length, fixes: d.fixes,
    };
    const { rows } = await client.query(
      `INSERT INTO app.agent_dreams (user_id, model, jobs, summary, stats, cost_usd, job_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, d.model, JSON.stringify(d.jobIds), d.summary, JSON.stringify(stats), d.cost, d.jobId ?? null],
    );
    const dream = rows[0];
    for (const s of [...d.plan.strengthen, ...d.plan.weaken]) {
      await client.query("UPDATE app.agent_memories SET strength = $3, updated_at = now() WHERE id = $1 AND user_id = $2 AND status = 'active'", [s.id, userId, s.strength]);
    }
    if (d.plan.fade.length) {
      await client.query("UPDATE app.agent_memories SET status = 'faded', strength = 0, updated_at = now() WHERE id = ANY($1::uuid[]) AND user_id = $2 AND status = 'active'", [d.plan.fade, userId]);
    }
    for (const s of d.plan.supersede) {
      await client.query("UPDATE app.agent_memories SET status = 'superseded', updated_at = now() WHERE id = $1 AND user_id = $2 AND status = 'active'", [s.parent.id, userId]);
      await client.query(
        `INSERT INTO app.agent_memories (user_id, scope, kind, text, evidence, strength, pinned, parent_id, dream_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [userId, s.parent.scope, s.parent.kind, s.text, JSON.stringify([...new Set([...(s.parent.evidence ?? []), ...d.jobIds])].slice(-20)), s.strength, s.parent.pinned, s.parent.id, dream.id],
      );
    }
    for (const a of d.plan.add) {
      await client.query(
        `INSERT INTO app.agent_memories (user_id, scope, kind, text, evidence, strength, dream_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, a.scope, a.kind, a.text, JSON.stringify(a.evidence), START_STRENGTH, dream.id],
      );
    }
    if (d.jobIds.length) await client.query("UPDATE app.agent_jobs SET dreamt_at = now() WHERE id = ANY($1::uuid[]) AND user_id = $2", [d.jobIds, userId]);
    await client.query("COMMIT");
    return dream;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
