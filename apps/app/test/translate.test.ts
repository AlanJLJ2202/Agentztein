// The app only asks to translate what is clearly in the other language, and a translated cycle keeps its numbers.
import { describe, expect, it } from "vitest";
import { guessLang, mtJob, type MtFn } from "../src/translate.js";
import type { Job } from "../src/api.js";

describe("what the models wrote, in the reader's language", () => {
  it("tells Spanish from English and stays quiet when it can't", () => {
    expect(guessLang("Ningún escenario está medido ni tiene habilidades, así que web tiene todo el margen")).toBe("es");
    expect(guessLang("No scenario is measured yet and it has no skills, so the web exam has all the room to improve")).toBe("en");
    expect(guessLang("set_general v1")).toBeNull();
    expect(guessLang("muse-spark-1.3")).toBeNull();
  });

  it("translates the words of a cycle and nothing else", () => {
    const mt: MtFn = (s) => (s ? (`EN(${s})` as typeof s) : s);
    const job = {
      id: "j", scenario: "web", executor: "x", planner: "y", effort: null, phase: "awaiting", running: false, createdAt: "", updatedAt: "",
      state: {
        mistakes: [], cost: 0.1,
        plan: { scenario: "web", family: "spark", executor: "x", effort: null, why: "porque sí", steps: [{ tool: "exam", why: "medir" }], proposals: [{ capability: "web", model: "spark", idea: "buscar", why: "para ver" }], estimate: null, fixes: [] },
        trace: [{ at: "", tool: "director", note: "handed-over" }, { at: "", tool: "director", note: "porque sí" }, { at: "", tool: "grader", note: "3/4" }],
      },
    } as unknown as Job;
    const out = mtJob(job, mt);
    expect(out.state.plan?.why).toBe("EN(porque sí)");
    expect(out.state.plan?.proposals[0]?.idea).toBe("EN(buscar)");
    expect(out.state.trace?.map((e) => e.note)).toEqual(["handed-over", "EN(porque sí)", "3/4"]);
    expect(out.state.cost).toBe(0.1);
    expect(job.state.plan?.why).toBe("porque sí");
  });
});
