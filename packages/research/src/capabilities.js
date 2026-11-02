// The capabilities Agentztein trains and the benchmark (lab station) that measures each one.
// Shared by the landing (live Hacker News feed), the app and the API (research triage).

/** @typedef {"code" | "terminal" | "reasoning" | "web" | "research" | "autonomy"} Capability */
/** @typedef {"swe" | "terminal" | "arc" | "web" | "research" | "horizon"} Benchmark */

/** @type {Record<Capability, { benchmark: Benchmark, color: string, en: string, es: string }>} */
export const CAPABILITIES = {
  code: { benchmark: "swe", color: "#5b9bff", en: "Code", es: "Código" },
  terminal: { benchmark: "terminal", color: "#2ec4b6", en: "Terminal", es: "Terminal" },
  reasoning: { benchmark: "arc", color: "#ff8f70", en: "Reasoning", es: "Razonamiento" },
  web: { benchmark: "web", color: "#3ccf6e", en: "Web", es: "Web" },
  research: { benchmark: "research", color: "#ffb53d", en: "AI research", es: "Investigación de IA" },
  autonomy: { benchmark: "horizon", color: "#8a7dff", en: "Autonomy", es: "Autonomía" },
};

/** @type {Record<Benchmark, string>} */
export const BENCHMARK_NAMES = {
  swe: "SWE-bench Pro",
  terminal: "Terminal-Bench",
  arc: "ARC-AGI-3",
  web: "BrowseComp",
  research: "MLE-bench & PaperBench",
  horizon: "METR time horizon",
};

/** Keyword hints, most specific first. A hint is only a guess from the headline, never the agent's verdict. */
/** @type {Array<[Capability, RegExp]>} */
const HINTS = [
  ["code", /\b(swe-?bench|coding|codegen|code review|copilot|cursor|codex|claude code|refactor\w*|programm\w+|compiler|pull requests?|ide)\b/i],
  ["terminal", /\b(terminal-?bench|terminal|shell|bash|cli|devops|docker|kubernetes|sandbox\w*|linux|sysadmin)\b/i],
  ["reasoning", /\b(arc-?agi|reasoning|puzzles?|math\w*|olympiad|logic|theorem|chain[- ]of[- ]thought)\b/i],
  ["web", /\b(browsecomp|brows\w+|web agents?|search engines?|deep research|crawl\w*|retriev\w+|rag)\b/i],
  ["research", /\b(mle-?bench|paperbench|re-?bench|arxiv|papers?|kaggle|fine-?tun\w+|training|pretrain\w*|rl|reinforcement|replicat\w+|scaling laws?)\b/i],
  ["autonomy", /\b(agents?|agentic|autonomous|long[- ]horizon|time horizon|metr|multi-?agent|computer use)\b/i],
];

/**
 * Best-guess capability for a headline, or null when nothing matches.
 * @param {string} text
 * @returns {Capability | null}
 */
export function hintCapability(text) {
  for (const [cap, re] of HINTS) if (re.test(text)) return cap;
  return null;
}

/** @param {unknown} v @returns {v is Capability} */
export const isCapability = (v) => typeof v === "string" && Object.hasOwn(CAPABILITIES, v);
