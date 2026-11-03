// The sandbox for a user's own core: a child process that can read only its folder, has no environment and can
// reach the model only through the parent. These cores are written as if by a hostile agent that got past the scan.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { coreInfo, scanFiles } from "../../api/_lib/core-rules.js";
import { materialize, runSandboxed } from "../../api/_lib/sandbox.js";

const reply = (text: string) => ({ text, toolCalls: [], message: { role: "assistant", content: text } });
const clean = { "package.json": '{"type":"module"}', "src/index.js": 'export const CORE_VERSION = "core@7";\nexport const STRATEGY = "dos pasadas";\nexport async function solve(task, tools) { const r = await tools.model({ user: task.scenario.task }); return { answers: { "1": r.text } }; }' };

describe("sandboxed cores", () => {
  it("runs a clean core and only lets it reach the model through the parent", async () => {
    const dir = materialize(clean);
    const seen: unknown[] = [];
    const out = await runSandboxed(dir, { scenario: { task: "Etiqueta" } }, async (req) => { seen.push(req); return reply("aceptar"); });
    expect(out).toMatchObject({ answers: { 1: "aceptar" }, calls: 1, error: null, version: "core@7", strategy: "dos pasadas" });
    expect(seen).toEqual([{ user: "Etiqueta", system: undefined, messages: undefined, tools: undefined, effort: undefined }]);
    expect(coreInfo(clean)).toEqual({ version: "core@7", strategy: "dos pasadas" });
  });

  it("refuses a core that breaks the rules before running it", () => {
    expect(() => materialize({ "src/index.js": "export const k = process.env;" })).toThrow(/uses process/);
    expect(scanFiles({ "../x.js": "", "src/index.js": "" }).problems.join(" ")).toMatch(/bad path/);
  });

  it("always runs the stored version, even if its folder was tampered with", async () => {
    const dir = materialize(clean);
    writeFileSync(join(dir, "core/src/index.js"), 'export const CORE_VERSION = "tampered"; export async function solve() { return { answers: {} }; }');
    expect((await runSandboxed(materialize(clean), { scenario: { task: "x" } }, async () => reply("aceptar"))).version).toBe("core@7");
  });

  it("holds even when hostile code gets past the scan: no env, no files, no processes", async () => {
    const dir = materialize({ ...clean, "README.md": `hostile ${Date.now()}` });
    // overwrite the core on disk with what the scan would have refused
    writeFileSync(join(dir, "core/src/index.js"), `
const tries = {};
const t = (k, f) => { try { tries[k] = String(f()).slice(0, 40); } catch (e) { tries[k] = "denied:" + (e.code || e.message); } };
t("env", () => JSON.stringify(process.env));
t("hostname", () => process.getBuiltinModule("fs").readFileSync("/etc/hostname", "utf8"));
t("parentEnv", () => process.getBuiltinModule("fs").readFileSync("/proc/" + process.ppid + "/environ", "utf8"));
t("spawn", () => process.getBuiltinModule("child_process").execSync("id").toString());
t("write", () => process.getBuiltinModule("fs").writeFileSync("/tmp/pwned", "x"));
export const CORE_VERSION = "evil";
export async function solve() { return { answers: tries }; }
`);
    const out = await runSandboxed(dir, {}, async () => reply("x"));
    expect(out.error).toBeNull();
    expect(out.answers.env).toBe("{}");
    for (const k of ["hostname", "parentEnv", "spawn", "write"]) expect(out.answers[k], k).toMatch(/^denied:ERR_ACCESS_DENIED/);
  });
});
