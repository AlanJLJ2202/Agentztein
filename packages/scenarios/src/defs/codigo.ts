import type { ScenarioBatch } from "@skillab/contracts";
import { Rng } from "@skillab/env-recon";
import { batchIdFor, materialize, num } from "../common.js";
import type { Policy, Role, ScenarioDefinition } from "../types.js";

/**
 * Code, in the style of SWE-bench Pro: did a proposed patch resolve the issue? Like SWE-bench, a patch resolves it
 * when every FAIL_TO_PASS test now passes and no PASS_TO_PASS test broke.
 * Trap: in the second repository the maintainers also reject any patch that lowers test coverage (not stated).
 * Change (R2): that repository starts reporting coverage before and after instead of the delta.
 */

const CONTEXT = { A: "repo_biblioteca", B: "repo_plataforma" } as const;
const REPOS = {
  train: { A: ["psf/requests", "pallets/flask", "sympy/sympy"], B: ["django/django", "astropy/astropy"] },
  heldout: { A: ["pytest-dev/pytest", "sphinx-doc/sphinx", "pylint-dev/pylint"], B: ["scikit-learn/scikit-learn", "matplotlib/matplotlib"] },
} as const;
const ISSUES = ["off-by-one en paginación", "None sin validar", "zona horaria", "codificación UTF-8", "caché sin invalidar", "condición de carrera", "regex demasiado amplia"];

const opt = (v: unknown) => (typeof v === "number" ? v : Number.NaN);
const role = (b: ScenarioBatch): Role => (b.context === CONTEXT.A ? "A" : "B");
type F = ScenarioBatch["items"][number]["fields"];
const testsOk = (f: F) => num(f.f2p_pasan) === num(f.f2p_total) && num(f.p2p_rotas) === 0;
const coverageDelta = (f: F, honourR2: boolean) =>
  honourR2 && typeof f.cobertura_antes === "number" ? opt(f.cobertura_despues) - opt(f.cobertura_antes) : opt(f.cobertura_delta);

const decide = (coverage: (b: ScenarioBatch) => boolean, honourR2: boolean): Policy => (b) =>
  b.items.map((i) => ({
    itemId: i.itemId,
    label: testsOk(i.fields) && (!coverage(b) || coverageDelta(i.fields, honourR2) >= 0) ? "resuelve" : "no_resuelve",
  }));

export const codigo: ScenarioDefinition = {
  id: "codigo",
  version: "1",
  info: {
    industry: "Benchmark de código · estilo SWE-bench Pro",
    title: "Revisar parches de software",
    summary: "Decidir si el parche que propuso un agente resuelve de verdad el issue de un repositorio.",
    problem:
      "En SWE-bench un parche cuenta solo si las pruebas que fallaban ahora pasan y no rompe ninguna que ya pasaba. Cada repositorio, además, tiene sus propias reglas de revisión.",
    task: "Marcar cada parche como resuelve o no_resuelve con los resultados de las pruebas y la cobertura.",
    contexts: {
      A: { id: CONTEXT.A, name: "Repositorio de biblioteca", rule: "Pasan las pruebas objetivo y no se rompe ninguna otra." },
      B: { id: CONTEXT.B, name: "Repositorio de plataforma", rule: "Lo mismo y, además, la cobertura de pruebas no puede bajar." },
    },
    labels: [
      { id: "resuelve", meaning: "El parche resuelve el issue según las reglas del repositorio" },
      { id: "no_resuelve", meaning: "El parche no lo resuelve" },
    ],
    trap: "“Si las pruebas pasan, resuelve.” Es correcta en la biblioteca y acepta en la plataforma parches que bajan la cobertura.",
    change: "La plataforma empieza a reportar la cobertura antes y después en vez de la diferencia. Una regla que lee la diferencia deja de funcionar, solo ahí.",
    scopedSkill: "“En el repositorio de plataforma, rechaza si la cobertura baja (después − antes < 0)”, solo para ese contexto.",
    whyItMatters: "Los agentes de código se miden así: no basta con que compile, tiene que pasar las reglas de quien mantiene el proyecto.",
  },
  schemaFor: (r, rules) => (r === "A" ? "swe-lib@1" : rules === "R2" ? "swe-plat-cov@2" : "swe-plat@1"),
  generate: (spec) => {
    const rng = new Rng(spec.seed);
    const schema = codigo.schemaFor(spec.role, spec.rulesVersion);
    const split = schema === "swe-plat-cov@2";
    const n = spec.profile === "heldout" ? rng.int(13, 18) : rng.int(9, 12);
    const kinds: ("good" | "trap" | "badF2p" | "badP2p")[] = [];
    if (spec.role === "B") {
      kinds.push("good", "trap");
      for (let i = rng.int(0, 2); i > 0; i--) kinds.push("trap");
    }
    while (kinds.length < n) kinds.push(rng.next() < 0.5 ? "good" : rng.next() < 0.5 ? "badF2p" : "badP2p");

    const rows = rng.shuffle(kinds).map((kind) => {
      const total = rng.int(1, 4);
      const pasan = kind === "badF2p" ? rng.int(0, total - 1) : total;
      const rotas = kind === "badP2p" ? rng.int(1, 6) : 0;
      // coverage delta in tenths of a point: never borderline
      const tenths = kind === "trap" ? -rng.int(3, 40) : spec.role === "A" ? rng.int(-30, 25) : rng.int(0, 25);
      const before = rng.int(650, 950);
      const okCoverage = spec.role === "A" || tenths >= 0;
      const label = pasan === total && rotas === 0 && okCoverage ? "resuelve" : "no_resuelve";
      const coverage: Record<string, number> = split
        ? { cobertura_antes: before / 10, cobertura_despues: (before + tenths) / 10 }
        : { cobertura_delta: tenths / 10 };
      return {
        label,
        fields: {
          repositorio: rng.pick(REPOS[spec.profile][spec.role]),
          issue: rng.pick(ISSUES),
          archivos_cambiados: rng.int(1, 5),
          f2p_pasan: pasan,
          f2p_total: total,
          p2p_rotas: rotas,
          p2p_total: rng.int(40, 400),
          ...coverage,
        },
      };
    });
    const batchId = batchIdFor("codigo", codigo.version, spec);
    const { items, truth } = materialize(batchId, rows);
    return { batch: { batchId, scenario: "codigo", context: CONTEXT[spec.role], schemaVersion: schema, rulesVersion: spec.rulesVersion, items }, truth };
  },
  policies: {
    naive: decide(() => false, false),
    legacy: decide((b) => role(b) === "B", false),
    reference: decide((b) => role(b) === "B", true),
  },
};
