// The merge gate for the agent's own code: which paths, what the core may contain, and when a change earns a merge.
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BenchResult } from "../../scripts/evolve/bench.js";
import { classify, decide, judge, maxDrop, minGain, report, scanDir, scanFile } from "../../scripts/evolve/gate.js";

const bench = (scores: Record<string, [number, number]>, extra: Partial<BenchResult> = {}): BenchResult => {
  const scenarios = Object.fromEntries(Object.entries(scores).map(([id, [c, t]]) => [id, { correct: c, total: t, contexts: {}, calls: 1, error: null }]));
  const all = Object.values(scenarios);
  return {
    core: { dir: "x", version: "core@1", strategy: "s" }, set: "fresh", seed: 7, model: "muse-spark-1.3", scenarios,
    correct: all.reduce((n, s) => n + s.correct, 0), total: all.reduce((n, s) => n + s.total, 0), calls: 4, cost: 0.01, ...extra,
  };
};

describe("paths", () => {
  it("separates the core from everything else", () => {
    expect(classify(["packages/agent-core/src/index.js", "api/agent.js", " ", "packages/agent-core-x/a.js"])).toEqual({
      core: ["packages/agent-core/src/index.js"],
      other: ["api/agent.js", "packages/agent-core-x/a.js"],
    });
  });
});

describe("the core's source", () => {
  it("allows plain code that imports its own files", () => {
    expect(scanFile("src/index.js", 'import { a } from "./a.js";\nexport { b } from "../src/b.js";\n// we process records and fetch nothing\nexport const x = 1;')).toEqual([]);
    expect(scanFile("test/core.test.mjs", 'import { test } from "node:test";\nimport assert from "node:assert/strict";')).toEqual([]);
    expect(scanFile("README.md", "process fetch eval")).toEqual([]);
  });

  it("refuses the network, files, secrets, the host's globals and memorized ids", () => {
    const bad: [string, RegExp][] = [
      ["const r = await fetch(url);", /fetch/],
      ["const k = process.env.META_API_KEY;", /process/],
      ['const fs = require("fs");', /require/],
      ['const m = await import("node:fs");', /dynamic import/],
      ["globalThis.x = 1;", /globalThis/],
      ['eval("1")', /eval/],
      ['const f = Function("return 1");', /Function/],
      ['const g = (() => {}).constructor.constructor("return this")();', /constructor/],
      ['if (id === "i_ea6143bad3ff") return "aceptar";', /memorizing/],
      ['import fs from "node:fs";', /imports "node:fs"/],
      ['import { EVALSET } from "../../../api/_data/evalset.js";', /outside the package/],
      ['import x from "lodash";', /imports "lodash"/],
    ];
    for (const [src, why] of bad) expect(scanFile("src/index.js", src).join(" "), src).toMatch(why);
    expect(scanFile("src/tool.py", "print(1)")[0]).toMatch(/only \.js/);
    expect(scanFile("test/x.test.mjs", 'import fs from "node:fs";')[0]).toMatch(/node:fs/);
  });

  it("scans a whole copy, links and size included", () => {
    const dir = mkdtempSync(join(tmpdir(), "core-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/index.js"), "export const CORE_VERSION = 'core@2';");
    expect(scanDir(dir).problems).toEqual([]);
    symlinkSync("/etc/hostname", join(dir, "src/link.js"));
    writeFileSync(join(dir, "src/big.js"), `export const s = "${"x".repeat(260_000)}";`);
    const { problems } = scanDir(dir);
    expect(problems.join(" ")).toMatch(/symbolic links/);
    expect(problems.join(" ")).toMatch(/bytes/);
    expect(scanDir(mkdtempSync(join(tmpdir(), "empty-"))).problems).toContain("src/index.js is missing");
  });
});

describe("the verdict", () => {
  it("needs a real gain on the whole exam and no scenario broken", () => {
    expect(minGain(100)).toBe(2);
    expect(minGain(360)).toBe(8);
    expect(maxDrop(20)).toBe(1);
    expect(maxDrop(90)).toBe(3);
    const base = bench({ a: [50, 90], b: [60, 90], c: [70, 90], d: [80, 90] });
    expect(judge(base, bench({ a: [60, 90], b: [60, 90], c: [70, 90], d: [80, 90] })).reason).toBe("improves");
    expect(judge(base, bench({ a: [53, 90], b: [60, 90], c: [70, 90], d: [80, 90] })).reason).toBe("no-gain");
    const reg = judge(base, bench({ a: [75, 90], b: [55, 90], c: [70, 90], d: [80, 90] }));
    expect(reg.reason).toBe("regression");
    expect(reg.drops).toEqual([{ scenario: "b", drop: 5, allowed: 3 }]);
    const broken = bench({ a: [90, 90], b: [90, 90], c: [90, 90], d: [0, 90] });
    broken.scenarios.d = { correct: 0, total: 90, contexts: {}, calls: 1, error: "timed out" };
    expect(judge(base, broken).reason).toBe("broken");
  });

  it("merges only an agent PR that touches only the core and improves", () => {
    const core = ["packages/agent-core/src/index.js"];
    const improves = { pass: true, reason: "improves" as const, gain: 9, needed: 8, drops: [] };
    const noGain = { ...improves, pass: false, reason: "no-gain" as const, gain: 1 };
    expect(decide({ files: ["README.md"], problems: [], verdict: null, agentPr: true }).decision).toBe("skip");
    expect(decide({ files: core, problems: ["src/index.js: uses fetch"], verdict: improves, agentPr: true }).decision).toBe("reject");
    expect(decide({ files: core, problems: [], verdict: null, agentPr: true }).decision).toBe("reject");
    expect(decide({ files: core, problems: [], verdict: { ...improves, pass: false, reason: "regression" }, agentPr: true }).decision).toBe("reject");
    expect(decide({ files: core, problems: [], verdict: improves, agentPr: true }).decision).toBe("merge");
    expect(decide({ files: [...core, "api/agent.js"], problems: [], verdict: improves, agentPr: true }).decision).toBe("human");
    expect(decide({ files: core, problems: [], verdict: improves, agentPr: false }).decision).toBe("human");
    expect(decide({ files: core, problems: [], verdict: noGain, agentPr: true }).decision).toBe("human");
  });

  it("writes a PR comment the app can read back", () => {
    const base = bench({ a: [50, 90], b: [60, 90] });
    const head = bench({ a: [62, 90], b: [61, 90] }, { core: { dir: "y", version: "core@2", strategy: "votes" } });
    const verdict = judge(base, head);
    const text = report({ decision: "merge", reasons: ["ok"], base, head, verdict });
    expect(text.startsWith("<!-- agent-gate -->\n### ✅")).toBe(true);
    expect(text).toContain("| **Total** | **110/180** (61.1%) | **123/180** (68.3%) | **+13** |");
    expect(text).toContain("seed `7`");
  });
});
