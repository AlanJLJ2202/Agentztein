// The judge's exams. They live outside packages/agent-core, so the agent can't read or change them.
//   fresh     records generated on the spot from a seed chosen when the gate runs, in a seed range no other set
//             uses and with the held-out profile. They didn't exist when the agent wrote its code, so
//             memorizing anything is useless.
//   practice  the bench's practice set (the agent may see its mistakes here, with the right answers).
import { SCENARIO_SEED_STRIDE, SCENARIOS, SPLIT_SEED_BASE, scenarioIndex } from "@skillab/scenarios";
import { EVALSET } from "../../api/_data/evalset.js";
import { AGENT_SCENARIOS } from "../evalset.js";

export type Batch = { context: string; items: { id: string; fields: Record<string, unknown> }[]; truth: string[] };
export type ExamScenario = {
  id: string;
  title: string;
  task: string;
  labels: { id: string; meaning: string }[];
  contexts: { id: string; name: string }[];
  batches: Batch[];
};

/** Fresh seeds sit in each scenario's sub-range past the three families (0–299,999), so they never repeat a set. */
export const FRESH_OFFSET = 500_000;
export const FRESH_SPAN = 400_000;
export const DEFAULT_FRESH_BATCHES = 6;

export function freshSeed(seed: number, scenarioId: string, i: number): number {
  const base = FRESH_OFFSET + (Math.abs(Math.trunc(seed)) % FRESH_SPAN);
  return SPLIT_SEED_BASE.validation + scenarioIndex(scenarioId) * SCENARIO_SEED_STRIDE + base + i;
}

function publicOf(id: string) {
  const sc = (EVALSET.scenarios as Record<string, { id: string; title: string; task: string; labels: ExamScenario["labels"]; contexts: ExamScenario["contexts"] }>)[id];
  if (!sc) throw new Error(`missing scenario ${id}`);
  return { id: sc.id, title: sc.title, task: sc.task, labels: sc.labels, contexts: sc.contexts };
}

/** A new exam for every scenario of the bench: `batches` batches each, alternating its two contexts. */
export function freshExam(seed: number, batches = DEFAULT_FRESH_BATCHES): ExamScenario[] {
  return AGENT_SCENARIOS.map((id) => {
    const def = SCENARIOS.find((s) => s.id === id);
    if (!def) throw new Error(`missing scenario ${id}`);
    const out: Batch[] = [];
    for (let i = 0; i < batches; i++) {
      const { batch, truth } = def.generate({
        split: "validation",
        family: "interleaved",
        seed: freshSeed(seed, id, i),
        role: i % 2 === 0 ? "A" : "B",
        rulesVersion: "R1",
        profile: "heldout",
      });
      const byId = new Map(truth.map((t) => [t.itemId, t.label]));
      out.push({
        context: batch.context,
        items: batch.items.map((it) => ({ id: it.itemId, fields: it.fields as Record<string, unknown> })),
        truth: batch.items.map((it) => byId.get(it.itemId) ?? ""),
      });
    }
    return { ...publicOf(id), batches: out };
  });
}

/** The bench's practice set, scenario by scenario. */
export function practiceExam(): ExamScenario[] {
  return AGENT_SCENARIOS.map((id) => {
    const sc = (EVALSET.scenarios as Record<string, { sets: { practice: Batch[] } }>)[id];
    if (!sc) throw new Error(`missing scenario ${id}`);
    return { ...publicOf(id), batches: sc.sets.practice };
  });
}
