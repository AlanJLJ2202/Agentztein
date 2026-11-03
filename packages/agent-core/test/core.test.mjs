// The core's own tests: plain `node --test`, no dependencies and no network (the model is a fake).
// Run them with `pnpm test:core` (the workshop runs `node --test test/*.test.mjs`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, CORE_VERSION, STRATEGY } from "../src/index.js";
import { parseAnswers, parseJsonObject } from "../src/parse.js";
import { executorPrompt } from "../src/prompts.js";

const TASK = {
  scenario: {
    id: "demo",
    title: "Demo",
    task: "Aceptar o rechazar cada pieza.",
    labels: [{ id: "aceptar", meaning: "dentro" }, { id: "rechazar", meaning: "fuera" }],
    contexts: [{ id: "A", name: "Línea A" }, { id: "B", name: "Línea B" }],
  },
  skills: [{ context: "B", version: 2, instructions: "Tolerancia ±0.05 mm." }],
  batches: [
    { context: "A", rows: [{ n: "1", fields: { medida: 12.04, nominal: 12 } }] },
    { context: "B", rows: [{ n: "2", fields: { medida: 8.9, nominal: 8.5 } }] },
  ],
};

/** A fake model that answers every number it sees in the prompt. */
const fakeTools = (/** @type {(user: string) => string} */ reply) => {
  const calls = [];
  return {
    calls,
    tools: {
      maxCalls: 3,
      model: async (/** @type {any} */ req) => {
        calls.push(req);
        const text = reply(req.user ?? "");
        return { text, toolCalls: [], message: { role: "assistant", content: text } };
      },
    },
  };
};

test("declares its version and strategy", () => {
  assert.match(CORE_VERSION, /^core@\d+/);
  assert.ok(STRATEGY.length > 10);
});

test("lays out every batch, every row and the active skills", () => {
  const p = executorPrompt(TASK);
  assert.match(p, /Lote 1 · contexto A \(Línea A\)/);
  assert.match(p, /2\. medida=8\.9; nominal=8\.5/);
  assert.match(p, /\[B\] skill v2:\nTolerancia/);
  assert.match(p, /\[A\] sin skill todavía/);
});

test("solves with the model and returns one label per number", async () => {
  const { tools, calls } = fakeTools(() => '```json\n{"answers": {"1": "aceptar", "2": " rechazar "}}\n```');
  const out = await solve(TASK, tools);
  assert.deepEqual(out.answers, { 1: "aceptar", 2: "rechazar" });
  assert.ok(calls.length >= 1 && calls.length <= tools.maxCalls);
});

test("an unreadable reply means no answers, not a crash", async () => {
  const { tools } = fakeTools(() => "no sé");
  assert.deepEqual((await solve(TASK, tools)).answers, {});
  assert.deepEqual(parseAnswers('{"1": "aceptar", "2": 3}'), { 1: "aceptar" });
  assert.throws(() => parseJsonObject("nada"));
});
