// The translation of what the models wrote: bounded input, a checked answer, and a prompt that keeps identifiers.
import { describe, expect, it } from "vitest";
import { cleanTexts, parseTranslation, TRANSLATE_LIMITS, TRANSLATE_SYSTEM, translatePrompt } from "../../api/_lib/translate.js";

describe("translate", () => {
  it("bounds what it accepts", () => {
    expect(cleanTexts(["hola", "adiós"])).toEqual(["hola", "adiós"]);
    expect(() => cleanTexts([])).toThrow();
    expect(() => cleanTexts(["hola", ""])).toThrow();
    expect(() => cleanTexts([1])).toThrow();
    expect(() => cleanTexts(Array(TRANSLATE_LIMITS.texts + 1).fill("x"))).toThrow();
    expect(() => cleanTexts(Array(TRANSLATE_LIMITS.texts).fill("x".repeat(TRANSLATE_LIMITS.chars)))).toThrow();
    expect(cleanTexts(["y".repeat(TRANSLATE_LIMITS.chars + 50)])[0]).toHaveLength(TRANSLATE_LIMITS.chars);
  });

  it("asks for the same strings in the same order and keeps identifiers", () => {
    const p = translatePrompt(["Para set_general marca «valida»."], "en");
    expect(p).toContain("into English");
    expect(p).toContain('exactly 1 strings');
    expect(p.split("\n").at(-1)).toBe(JSON.stringify(["Para set_general marca «valida»."]));
    expect(translatePrompt(["x"], "es")).toContain("Spanish");
    expect(TRANSLATE_SYSTEM).toContain("underscores");
  });

  it("only accepts a complete answer", () => {
    expect(parseTranslation('```json\n{"t": ["a", "b"]}\n```', 2)).toEqual(["a", "b"]);
    expect(() => parseTranslation('{"t": ["a"]}', 2)).toThrow();
    expect(() => parseTranslation('{"t": ["a", ""]}', 2)).toThrow();
    expect(() => parseTranslation("not json", 1)).toThrow();
  });
});
