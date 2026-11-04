// The memory's fixed rules: how a dream is read, how it is applied, and what each reader gets in its prompt.
import { describe, expect, it } from "vitest";
import { consolidate, episodeLine, lessonText, MAX_ACTIVE, MAX_STRENGTH, parseDream, recall, type MemoryRow } from "../../api/_lib/memory.js";

const T0 = "2026-11-01T00:00:00Z";
const mem = (id: string, o: Partial<MemoryRow> = {}): MemoryRow => ({
  id, scope: "global", kind: "rule", text: `lección ${id} sobre un umbral`, strength: 2, pinned: false, evidence: [], uses: 0, last_used_at: null, updated_at: T0, ...o,
});
const ctx = (rows: MemoryRow[]) => ({ memories: rows.map((row, i) => ({ alias: `m${i + 1}`, row })), episodes: [{ alias: "c1", id: "job-1" }] });

describe("a lesson", () => {
  it("is one short general sentence, never a concrete record", () => {
    expect(lessonText("  en   codigo la cobertura no puede bajar  ")).toBe("en codigo la cobertura no puede bajar");
    expect(lessonText("corto")).toBeNull();
    expect(lessonText("el registro i_0123456789ab es spam")).toBeNull();
    expect(lessonText("x".repeat(400))?.length).toBe(240);
  });
});

describe("reading a dream", () => {
  it("maps aliases back, drops what it can't use and names it", () => {
    const rows = [mem("a"), mem("b"), mem("c")];
    const d = parseDream(
      "```json\n" + JSON.stringify({
        keep: ["m1", "m9"],
        rewrite: [{ id: "m2", text: "la lección b, corregida con nueva evidencia" }, { id: "m7", text: "no existe ese recuerdo" }],
        add: [
          { scope: "codigo", kind: "dead-end", text: "subir el esfuerzo del ejecutor no ayudó en código", evidence: ["c1", "c4"] },
          { scope: "marte", kind: "rule", text: "un alcance que no existe en el laboratorio" },
          { scope: "global", kind: "chisme", text: "un tipo de recuerdo que no existe" },
        ],
        forget: ["m3", "m1"],
        summary: "Soñé con código.",
      }) + "\n```",
      ctx(rows),
    );
    expect([...d.keep]).toEqual([]); // m1 was also forgotten: forgetting wins over keeping
    expect([...d.forget].sort()).toEqual(["a", "c"]);
    expect(d.rewrite).toEqual([{ id: "b", text: "la lección b, corregida con nueva evidencia" }]);
    expect(d.add).toEqual([{ scope: "codigo", kind: "dead-end", text: "subir el esfuerzo del ejecutor no ayudó en código", evidence: ["job-1"] }]);
    expect(d.fixes).toEqual(["rewrite", "add", "add"]);
    expect(d.summary).toBe("Soñé con código.");
  });

  it("survives a reply that isn't JSON", () => {
    const d = parseDream("I had a nice dream", ctx([mem("a")]));
    expect(d.fixes).toContain("unreadable");
    expect(d.add).toEqual([]);
  });
});

describe("applying a dream", () => {
  const last = "2026-11-02T00:00:00Z";

  it("strengthens what it keeps, supersedes what it rewrites, fades the neglected and keeps the used", () => {
    const rows = [
      mem("kept", { strength: MAX_STRENGTH }),
      mem("kept2"),
      mem("rewritten", { strength: 3 }),
      mem("neglected", { strength: 2 }),
      mem("weak", { strength: 1 }),
      mem("used", { strength: 1, last_used_at: "2026-11-03T00:00:00Z" }),
      mem("forgotten", { strength: 5 }),
    ];
    const plan = consolidate(rows, {
      keep: new Set(["kept", "kept2"]), forget: new Set(["forgotten"]),
      rewrite: [{ id: "rewritten", text: "la versión corregida de la lección" }],
      add: [{ scope: "global", kind: "fact", text: "Lección KEPT2 sobre un umbral", evidence: [] }, { scope: "codigo", kind: "rule", text: "una lección nueva de verdad", evidence: [] }],
      summary: "", fixes: [],
    }, last);
    expect(plan.strengthen).toEqual([{ id: "kept2", strength: 3 }]); // "kept" is already at the top
    expect(plan.supersede.map((s) => [s.parent.id, s.text, s.strength])).toEqual([["rewritten", "la versión corregida de la lección", 4]]);
    expect(plan.weaken).toEqual([{ id: "neglected", strength: 1 }]);
    expect(plan.fade.sort()).toEqual(["forgotten", "weak"]);
    // the same lesson again (other case and punctuation) is not new
    expect(plan.add.map((a) => a.text)).toEqual(["una lección nueva de verdad"]);
  });

  it("never touches a pinned lesson, even if the dream says to forget or rewrite it", () => {
    const rows = [mem("p1", { pinned: true, strength: 1 }), mem("p2", { pinned: true, strength: 2 })];
    const plan = consolidate(rows, { keep: new Set(), forget: new Set(["p1"]), rewrite: [{ id: "p2", text: "otro texto para la fijada" }], add: [], summary: "", fixes: [] }, last);
    expect(plan.fade).toEqual([]);
    expect(plan.supersede).toEqual([]);
    expect(plan.strengthen).toEqual([{ id: "p2", strength: 3 }]);
  });

  it(`keeps at most ${MAX_ACTIVE} lessons, fading the weakest unpinned first`, () => {
    const rows = Array.from({ length: MAX_ACTIVE }, (_, i) => mem(`m${i}`, { strength: i === 0 ? 1 : 4, pinned: i === 1, last_used_at: "2026-11-03T00:00:00Z" }));
    const plan = consolidate(rows, { keep: new Set(), forget: new Set(), rewrite: [], add: [{ scope: "global", kind: "rule", text: "una lección más que no cabe sin hacer espacio", evidence: [] }], summary: "", fixes: [] }, last);
    expect(plan.add).toHaveLength(1);
    expect(plan.fade).toEqual(["m0"]);
  });
});

describe("recalling", () => {
  const rows = [
    mem("ctx", { scope: "codigo:B", strength: 1 }),
    mem("exam", { scope: "codigo", strength: 2 }),
    mem("other", { scope: "web", strength: 5 }),
    mem("lab", { scope: "global", strength: 5 }),
    mem("pinned", { scope: "codigo:A", strength: 1, pinned: true }),
  ];

  it("gives the planner its exam's lessons first, its situation before all, and never another exam's", () => {
    const r = recall(rows, { budget: 10_000, scenario: "codigo", context: "B" });
    expect(r.ids).toEqual(["ctx", "exam", "pinned", "lab"]);
    expect(r.text.split("\n")[0]).toBe("- [rule · codigo:B] lección ctx sobre un umbral");
  });

  it("fits the budget, and without an exam puts lab-wide lessons first", () => {
    const r = recall(rows, { budget: 90 });
    expect(r.text.length).toBeLessThanOrEqual(90);
    expect(r.ids[0]).toBe("lab");
    expect(recall(rows, { budget: 10 }).ids).toEqual([]);
  });
});

describe("an episode", () => {
  it("squeezes a finished cycle into one line, with practice mistakes but no validation answers", () => {
    const line = episodeLine("c1", {
      scenario: "codigo", executor: "muse-spark-1.3", effort: "low", phase: "done",
      state: {
        outcome: "harness-rejected", verdict: { reason: "no-gain" },
        before: { validation: { A: { correct: 9, total: 10 }, B: { correct: 2, total: 10 } } },
        after: { A: { correct: 9, total: 10 }, B: { correct: 3, total: 10 } },
        candidate: { context: "B", version: 2, instructions: "Rechaza si baja la cobertura", rationale: "bajaba" },
        practice: [{ context: "B", fields: { cobertura: -2 }, truth: "rechazar", given: "aprobar", ok: false }, { context: "A", fields: {}, truth: "x", given: "x", ok: true }],
      },
    });
    expect(line).toContain("c1 · codigo · ejecutor muse-spark-1.3 esfuerzo low");
    expect(line).toContain("resultado harness-rejected (arnés: no-gain)");
    expect(line).toContain("validación antes A 9/10, B 2/10 → con la candidata A 9/10, B 3/10");
    expect(line).toContain("[B] cobertura=-2 → correcta rechazar, dijo aprobar");
    expect(line).not.toContain("[A]");
  });
});
