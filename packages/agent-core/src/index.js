// Agentztein's core: the part of the agent that the agent itself may rewrite (see ../README.md).
// The host (the app's /api/agent and the gate's bench in CI) gives it a task and a model. It returns one label per
// row. It has no network, no files and no secrets of its own: it reaches the model only through `tools.model`,
// which the host meters (call limit, budget, log). Everything outside this package is the host and the judge.
import { EXECUTOR_SYSTEM, executorPrompt } from "./prompts.js";
import { parseAnswers } from "./parse.js";

/** Bump it with every change you make to the core: the PR and the agent-vN tag show it. */
export const CORE_VERSION = "core@1";

/** One or two sentences on how the core solves a task today. The planner reads this to propose the next change. */
export const STRATEGY =
  "Una sola llamada al modelo con todos los lotes y las skills activas en el prompt; respuesta en JSON con una etiqueta por número.";

/**
 * @typedef {{ id: string, meaning: string }} Label
 * @typedef {{ id: string, name: string }} Context
 * @typedef {{ context: string, version: number, instructions: string }} SkillText
 * @typedef {{ n: string, fields: Record<string, unknown> }} Row
 * @typedef {{ context: string, rows: Row[] }} Batch
 * @typedef {{
 *   scenario: { id: string, title: string, task: string, labels: Label[], contexts: Context[] },
 *   skills: SkillText[],
 *   batches: Batch[],
 * }} Task
 * @typedef {{ name: string, description: string, parameters: Record<string, unknown> }} ToolSpec
 * @typedef {{ role: "system" | "user" | "assistant" | "tool", content: string | null, tool_call_id?: string, tool_calls?: unknown[] }} Message
 * @typedef {{
 *   system?: string,
 *   user?: string,
 *   messages?: Message[],
 *   tools?: ToolSpec[],
 *   effort?: "minimal" | "low" | "medium" | "high" | "xhigh" | null,
 * }} ModelRequest
 * @typedef {{ id: string, name: string, arguments: string }} ToolCall
 * @typedef {{ text: string, toolCalls: ToolCall[], message: Message }} ModelReply
 * @typedef {{ model: (req: ModelRequest) => Promise<ModelReply>, maxCalls: number }} Tools
 * @typedef {{ answers: Record<string, string>, notes?: string }} Solution
 */

/**
 * Labels every row of the task.
 * @param {Task} task
 * @param {Tools} tools
 * @returns {Promise<Solution>}
 */
export async function solve(task, tools) {
  const reply = await tools.model({ system: EXECUTOR_SYSTEM, user: executorPrompt(task) });
  return { answers: parseAnswers(reply.text) };
}
