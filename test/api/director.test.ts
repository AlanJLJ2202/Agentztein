// The director's plan (when the agent decides its own cycle) and the talk reply are read and checked by the server:
// nothing the model writes can pick a scenario or model that doesn't exist, or go over the cycle's cap.
import { describe, expect, it } from "vitest";
import { scenarioOf } from "../../api/_lib/agent.js";
import { estimateCycle, parseDirection, usableFamilies } from "../../api/_lib/director.js";
import { cleanTurns, readReply } from "../../api/talk.js";

const families = [
  { family: "spark", id: "muse-spark-1.3", effort: true, cycle: { manufactura: 0.04, envios: 0.03 } },
  { family: "wonder", id: "muse-wonder-1.0", effort: false, cycle: { manufactura: 0.6, envios: 0.5 } },
];
const ctx = { scenarios: ["manufactura", "envios"], families, cap: 0.45, fallback: { scenario: "envios", family: "spark" } };

describe("the director's plan", () => {
  it("keeps a valid plan and its proposals", () => {
    const p = parseDirection(JSON.stringify({
      scenario: "manufactura", executor: "spark", effort: "high", why: "Ahí falla más.",
      steps: [{ tool: "exam", why: "medirme" }, { tool: "teleport", why: "x" }],
      proposals: [{ capability: "vision", model: "spark", idea: "Ver fotos de las piezas", why: "La inspección es visual" }, { capability: "magic", idea: "x" }],
    }), ctx);
    expect(p).toMatchObject({ scenario: "manufactura", executor: "muse-spark-1.3", effort: "high", why: "Ahí falla más.", fixes: [] });
    expect(p.steps).toEqual([{ tool: "exam", why: "medirme" }]);
    expect(p.proposals).toHaveLength(1);
    expect(p.proposals[0]?.capability).toBe("vision");
  });

  it("falls back when it names what doesn't exist, and never goes over the cap", () => {
    const p = parseDirection(JSON.stringify({ scenario: "mars", executor: "wonder", effort: "max" }), ctx);
    // Wonder doesn't fit in $0.45 for envios: the cheapest family that fits instead
    expect(p).toMatchObject({ scenario: "envios", executor: "muse-spark-1.3", effort: "medium" });
    expect(p.fixes).toEqual(expect.arrayContaining(["scenario", "over-cap"]));
    expect(parseDirection("not json", ctx)).toMatchObject({ scenario: "envios", family: "spark", fixes: expect.arrayContaining(["unreadable"]) });
    // a family without effort levels gets none
    expect(parseDirection(JSON.stringify({ scenario: "envios", executor: "wonder", effort: "high" }), { ...ctx, cap: 5 }).effort).toBeNull();
  });

  it("estimates a cycle and only offers the key's families, never the contributor one", () => {
    const sc = scenarioOf("manufactura");
    const cheap = estimateCycle(sc, "muse-spark-1.3", "muse-wonder-1.0");
    expect(cheap).toBeGreaterThan(0);
    expect(estimateCycle(sc, "muse-wonder-1.0", "muse-wonder-1.0")).toBeGreaterThan(cheap);
    const fams = usableFamilies(["muse-spark-1.3", "muse-spark-1.3-contributor"]).map((f) => f.family);
    expect(fams).toContain("spark");
    expect(fams).not.toContain("spark-contributor");
  });
});

describe("talking with it", () => {
  it("takes a clean conversation that ends with the person", () => {
    expect(cleanTurns([{ role: "system", content: "x" }, { role: "user", content: " hola " }])).toEqual([{ role: "user", content: "hola" }]);
    expect(() => cleanTurns([{ role: "assistant", content: "hola" }])).toThrow(/last message/);
    expect(() => cleanTurns("hola")).toThrow();
  });

  it("reads what to say and only known actions", () => {
    expect(readReply('{"say": "Hola", "action": "auto-cycle"}')).toEqual({ say: "Hola", action: "auto-cycle" });
    expect(readReply('{"say": "Hola", "action": "rm -rf"}')).toEqual({ say: "Hola", action: null });
    expect(readReply("Solo texto")).toEqual({ say: "Solo texto", action: null });
  });
});
