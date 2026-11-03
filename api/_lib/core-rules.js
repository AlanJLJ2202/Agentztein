// The rules for the agent's core (packages/agent-core and every user's own versions of it), shared by the server
// (before storing or activating a version) and the judge in CI. They live outside the core, so the agent can't
// loosen them. See docs/EVOLVE.md.

export const CORE_EXTENSIONS = /\.(js|mjs|json|md)$/;
export const MAX_CORE_BYTES = 250_000;
export const MAX_CORE_FILES = 60;

/** Identifiers that would reach the network, files, processes, secrets or the host's globals. @type {[RegExp, string][]} */
const FORBIDDEN = [
  [/\bprocess\b/, "process"],
  [/\bfetch\b/, "fetch"],
  [/\brequire\s*\(/, "require()"],
  [/\bimport\s*\(/, "dynamic import()"],
  [/\bimport\.meta\b/, "import.meta"],
  [/\bglobalThis\b/, "globalThis"],
  [/\beval\s*\(/, "eval()"],
  [/\bFunction\s*\(/, "Function()"],
  [/\bconstructor\s*\.\s*constructor\b/, "constructor.constructor"],
  [/\b(XMLHttpRequest|WebSocket|EventSource|Deno|Bun|navigator|Worker|SharedArrayBuffer|Atomics)\b/, "host API"],
  [/\b__proto__\b|\bObject\.(setPrototypeOf|defineProperty)\s*\(\s*(Object|Array|String|JSON|Promise|Function)\b/, "patching built-ins"],
  [/\b[ib]_[0-9a-f]{12}\b/, "a bench record id (memorizing)"],
];

/** Code without comments, so a word in a comment doesn't trip the scan (strings stay). @param {string} src */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/** Static imports (`import … from "x"`, `export … from "x"`, `import "x"`). @param {string} src */
function importsOf(src) {
  const out = [];
  for (const m of src.matchAll(/\b(?:import|export)\s+(?:[^"'`;]*?\bfrom\s*)?["']([^"']+)["']/g)) out.push(m[1] ?? "");
  return out;
}

/** "a/./b/../c" → "a/c"; null if it climbs out of the package. @param {string} p */
export function normalPath(p) {
  const out = [];
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") { if (!out.length) return null; out.pop(); } else out.push(part);
  }
  return out.join("/");
}

/** Problems in one file of a core. `path` is relative to the package (e.g. "src/index.js"). @param {string} path @param {string} src */
export function scanFile(path, src) {
  /** @type {string[]} */
  const problems = [];
  const clean = normalPath(path);
  if (clean === null || clean !== path || path.startsWith("/")) return [`${path}: bad path`];
  if (!CORE_EXTENSIONS.test(path)) return [`${path}: only .js, .mjs, .json and .md files are allowed`];
  if (!/\.(js|mjs)$/.test(path)) return problems;
  const isTest = path.startsWith("test/");
  const code = stripComments(src);
  for (const [re, what] of FORBIDDEN) if (re.test(code)) problems.push(`${path}: uses ${what}`);
  for (const spec of importsOf(code)) {
    if (isTest && /^node:(test|assert)(\/strict)?$/.test(spec)) continue;
    if (!spec.startsWith("./") && !spec.startsWith("../")) { problems.push(`${path}: imports "${spec}" (only files of this package)`); continue; }
    const dir = path.split("/").slice(0, -1).join("/");
    if (normalPath(`${dir}/${spec}`) === null) problems.push(`${path}: imports "${spec}", outside the package`);
  }
  return problems;
}

/** Scans a whole core given as { path: text }. @param {Record<string, string>} files */
export function scanFiles(files) {
  /** @type {string[]} */
  const problems = [];
  const paths = Object.keys(files);
  let bytes = 0;
  for (const p of paths) {
    const text = files[p];
    if (typeof text !== "string") { problems.push(`${p}: not text`); continue; }
    bytes += text.length;
    problems.push(...scanFile(p, text));
  }
  if (!paths.includes("src/index.js")) problems.push("src/index.js is missing");
  if (paths.length > MAX_CORE_FILES) problems.push(`the core has ${paths.length} files (max ${MAX_CORE_FILES})`);
  if (bytes > MAX_CORE_BYTES) problems.push(`the core is ${bytes} bytes (max ${MAX_CORE_BYTES})`);
  return { files: paths.sort(), problems, bytes };
}

/** CORE_VERSION and STRATEGY as written in src/index.js. @param {Record<string, string>} files */
export function coreInfo(files) {
  const src = files["src/index.js"] ?? "";
  return {
    version: /CORE_VERSION\s*=\s*["'`]([^"'`]{1,60})["'`]/.exec(src)?.[1] ?? "?",
    strategy: /STRATEGY\s*=\s*\n?\s*["'`]([^"'`]{1,600})["'`]/.exec(src)?.[1] ?? "—",
  };
}

// ── did it get better? ──────────────────────────────────────────────────────────────────────────

/** Points the new version must gain on the whole exam: 2, or 2% of it if that is more (noise between runs). @param {number} total */
export const minGain = (total) => Math.max(2, Math.ceil(total * 0.02));
/** Points one scenario may lose before it counts as broken: 1, or 3% of it. @param {number} total */
export const maxDrop = (total) => Math.max(1, Math.ceil(total * 0.03));

/**
 * @typedef {{ correct: number, total: number, error?: string | null }} ScenarioScore
 * @typedef {{ correct: number, total: number, scenarios: Record<string, ScenarioScore> }} ExamScore
 * @typedef {{ pass: boolean, reason: "improves" | "no-gain" | "regression" | "broken", gain: number, needed: number, drops: { scenario: string, drop: number, allowed: number }[] }} Verdict
 */

/** @param {ExamScore} base @param {ExamScore} head @returns {Verdict} */
export function judge(base, head) {
  const gain = head.correct - base.correct;
  const needed = minGain(base.total);
  const drops = Object.entries(base.scenarios)
    .map(([id, b]) => ({ scenario: id, drop: b.correct - (head.scenarios[id]?.correct ?? 0), allowed: maxDrop(b.total) }))
    .filter((d) => d.drop > d.allowed);
  const broken = Object.values(head.scenarios).some((s) => s.error) && !Object.values(base.scenarios).some((s) => s.error);
  if (broken) return { pass: false, reason: "broken", gain, needed, drops };
  if (drops.length) return { pass: false, reason: "regression", gain, needed, drops };
  if (gain < needed) return { pass: false, reason: "no-gain", gain, needed, drops };
  return { pass: true, reason: "improves", gain, needed, drops };
}
