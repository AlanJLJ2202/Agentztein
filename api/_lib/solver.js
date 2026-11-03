// The host side of the agent's core (packages/agent-core). The core is code the agent rewrites about itself, so
// the host treats it as untrusted: it hands the core a copy of the task without answers and one way out, a
// metered `model` function (call limit; the caller adds budget, log and timeouts). Whatever the core returns is
// only read as `{ answers }`; scoring happens outside, with answers the core never sees.

const ROLES = new Set(["system", "user", "assistant", "tool"]);
const EFFORT = new Set(["minimal", "low", "medium", "high", "xhigh"]);
const MAX_TEXT = 400_000;
const MAX_TOOLS = 8;

/**
 * @typedef {{ system?: string, user?: string, messages?: any[], tools?: { name: string, description: string, parameters: Record<string, unknown> }[], effort?: string | null }} CoreRequest
 * @typedef {{ text: string, toolCalls: { id: string, name: string, arguments: string }[], message: Record<string, unknown> }} CoreReply
 */

/** @param {unknown} v @param {string} what */
function text(v, what) {
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new Error(`core request: ${what} must be text`);
  if (v.length > MAX_TEXT) throw new Error(`core request: ${what} is too long`);
  return v;
}

/**
 * Checks what the core asks the model for, so it can only send a well-formed chat request.
 * @param {unknown} raw
 * @returns {CoreRequest & { effort: string | null | undefined }}
 */
export function cleanRequest(raw) {
  if (!raw || typeof raw !== "object") throw new Error("core request: expected an object");
  const r = /** @type {Record<string, unknown>} */ (raw);
  const system = text(r.system, "system");
  const user = text(r.user, "user");
  /** @type {any[] | undefined} */
  let messages;
  if (r.messages !== undefined) {
    if (!Array.isArray(r.messages) || r.messages.length === 0 || r.messages.length > 200) throw new Error("core request: bad messages");
    messages = r.messages.map((m) => {
      if (!m || typeof m !== "object" || !ROLES.has(m.role)) throw new Error("core request: bad message role");
      const content = m.content === null ? null : text(m.content, "message content") ?? null;
      return {
        role: m.role,
        content,
        ...(typeof m.tool_call_id === "string" ? { tool_call_id: m.tool_call_id.slice(0, 200) } : {}),
        ...(Array.isArray(m.tool_calls) ? { tool_calls: JSON.parse(JSON.stringify(m.tool_calls)) } : {}),
      };
    });
    if (JSON.stringify(messages).length > MAX_TEXT) throw new Error("core request: messages are too long");
  } else if (user === undefined) {
    throw new Error("core request: send `user` or `messages`");
  }
  /** @type {CoreRequest["tools"]} */
  let tools;
  if (r.tools !== undefined) {
    if (!Array.isArray(r.tools) || r.tools.length > MAX_TOOLS) throw new Error(`core request: at most ${MAX_TOOLS} tools`);
    tools = r.tools.map((t) => {
      if (!t || typeof t.name !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(t.name)) throw new Error("core request: bad tool name");
      return { name: t.name, description: String(t.description ?? "").slice(0, 2000), parameters: t.parameters && typeof t.parameters === "object" ? JSON.parse(JSON.stringify(t.parameters)) : { type: "object", properties: {} } };
    });
  }
  const effort = r.effort === null ? null : typeof r.effort === "string" && EFFORT.has(r.effort) ? r.effort : undefined;
  return { system, user, messages, tools, effort };
}

/**
 * Runs the core's `solve` on one task.
 * @param {{ solve: (task: any, tools: any) => Promise<unknown> }} core
 * @param {Record<string, unknown>} task  scenario, skills and batches (rows without answers)
 * @param {(req: ReturnType<typeof cleanRequest>) => Promise<CoreReply>} call  one metered model call
 * @param {{ maxCalls?: number }} [opts]
 * @returns {Promise<{ answers: Record<string, string>, calls: number, notes: string }>}
 */
export async function runCore(core, task, call, { maxCalls = 3 } = {}) {
  let calls = 0;
  const tools = Object.freeze({
    maxCalls,
    model: async (/** @type {unknown} */ req) => {
      if (calls >= maxCalls) throw new Error(`The core used up its ${maxCalls} model calls`);
      calls++;
      const reply = await call(cleanRequest(req));
      return { text: reply.text, toolCalls: reply.toolCalls ?? [], message: reply.message };
    },
  });
  const out = /** @type {any} */ (await core.solve(structuredClone(task), tools));
  /** @type {Record<string, string>} */
  const answers = {};
  const raw = out && typeof out === "object" && out.answers && typeof out.answers === "object" ? out.answers : {};
  for (const [n, v] of Object.entries(raw)) if (typeof v === "string") answers[n] = v;
  return { answers, calls, notes: typeof out?.notes === "string" ? out.notes.slice(0, 500) : "" };
}

/** The public part of a bench scenario that the core may see (no sets, no answers). @param {any} sc */
export const publicScenario = (sc) => ({ id: sc.id, title: sc.title, task: sc.task, labels: sc.labels, contexts: sc.contexts });
