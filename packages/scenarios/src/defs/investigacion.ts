import type { ScenarioBatch } from "@skillab/contracts";
import { Rng } from "@skillab/env-recon";
import { batchIdFor, materialize } from "../common.js";
import type { Policy, Role, ScenarioDefinition } from "../types.js";

/**
 * AI research, in the style of MLE-bench: did an agent's Kaggle submission earn a medal? MLE-bench grades with
 * Kaggle's medal rules, which depend on how many teams entered.
 * Trap: big competitions only give a bronze medal to the top 10 %, not the top 40 % (not stated).
 * Change (R2): big competitions start reporting the leaderboard position instead of the percentile.
 */

const CONTEXT = { A: "competencia_chica", B: "competencia_grande" } as const;
const CUTOFF: Record<Role, number> = { A: 40, B: 10 };
const COMPS = {
  train: ["clasificar reseñas", "predecir precios de casas", "detectar spam", "segmentar células"],
  heldout: ["pronosticar demanda", "detectar fraude", "traducir dialectos", "clasificar radiografías"],
} as const;
const METRICS = ["accuracy", "AUC", "RMSE", "F1", "log loss"];

const opt = (v: unknown) => (typeof v === "number" ? v : Number.NaN);
const role = (b: ScenarioBatch): Role => (b.context === CONTEXT.A ? "A" : "B");
type F = ScenarioBatch["items"][number]["fields"];
const percentile = (f: F, honourR2: boolean) =>
  honourR2 && typeof f.posicion === "number" ? (100 * f.posicion) / opt(f.equipos) : opt(f.percentil);

const decide = (cutoff: (b: ScenarioBatch) => number, honourR2: boolean): Policy => (b) =>
  b.items.map((i) => ({ itemId: i.itemId, label: percentile(i.fields, honourR2) <= cutoff(b) ? "medalla" : "sin_medalla" }));

export const investigacion: ScenarioDefinition = {
  id: "investigacion",
  version: "1",
  info: {
    industry: "Benchmark de investigación de IA · estilo MLE-bench",
    title: "Calificar experimentos de machine learning",
    summary: "Decidir si el modelo que entrenó un agente gana medalla en una competencia de Kaggle, como en MLE-bench.",
    problem:
      "MLE-bench pone al agente a competir en Kaggle: entrena, envía y se compara contra personas. La medalla depende del lugar en la tabla y del tamaño de la competencia.",
    task: "Marcar cada envío como medalla o sin_medalla con su lugar en la tabla.",
    contexts: {
      A: { id: CONTEXT.A, name: "Competencia chica (menos de 250 equipos)", rule: "Medalla de bronce dentro del 40 % mejor." },
      B: { id: CONTEXT.B, name: "Competencia grande (más de 1,000 equipos)", rule: "Medalla de bronce dentro del 10 % mejor." },
    },
    labels: [
      { id: "medalla", meaning: "El envío entra en las medallas" },
      { id: "sin_medalla", meaning: "El envío queda fuera de las medallas" },
    ],
    trap: "“Dentro del 40 % mejor hay medalla.” Es correcta en competencias chicas y regala medallas en las grandes.",
    change: "Las competencias grandes empiezan a reportar el lugar en la tabla y el número de equipos en vez del percentil. Una regla que lee el percentil deja de funcionar, solo ahí.",
    scopedSkill: "“En competencias grandes, medalla solo si lugar ÷ equipos ≤ 10 %”, solo para ese contexto.",
    whyItMatters: "MLE-bench mide si un agente puede hacer investigación de IA de punta a punta; leer mal la tabla cambia toda la conclusión.",
  },
  schemaFor: (r, rules) => (r === "A" ? "mle-small@1" : rules === "R2" ? "mle-large-rank@2" : "mle-large@1"),
  generate: (spec) => {
    const rng = new Rng(spec.seed);
    const schema = investigacion.schemaFor(spec.role, spec.rulesVersion);
    const rank = schema === "mle-large-rank@2";
    const n = spec.profile === "heldout" ? rng.int(13, 18) : rng.int(9, 12);
    const kinds: ("good" | "trap" | "bad")[] = [];
    if (spec.role === "B") {
      kinds.push("good", "trap");
      for (let i = rng.int(0, 2); i > 0; i--) kinds.push("trap");
    }
    while (kinds.length < n) kinds.push(rng.next() < 0.5 ? "good" : "bad");

    const rows = rng.shuffle(kinds).map((kind) => {
      const teams = spec.role === "A" ? rng.int(40, 240) : rng.int(1000, 5000);
      // percentiles keep a clear gap around each cutoff
      const pct =
        kind === "bad" ? rng.int(46, 100) : kind === "trap" ? rng.int(12, 38) : spec.role === "A" ? rng.int(1, 36) : rng.int(1, 8);
      const position = Math.max(1, Math.round((pct * teams) / 100));
      const label = pct <= CUTOFF[spec.role] ? "medalla" : "sin_medalla";
      return {
        label,
        fields: {
          competencia: rng.pick(COMPS[spec.profile]),
          metrica: rng.pick(METRICS),
          equipos: teams,
          horas_de_computo: rng.int(2, 24),
          ...(rank ? { posicion: position } : { percentil: pct }),
        },
      };
    });
    const batchId = batchIdFor("investigacion", investigacion.version, spec);
    const { items, truth } = materialize(batchId, rows);
    return { batch: { batchId, scenario: "investigacion", context: CONTEXT[spec.role], schemaVersion: schema, rulesVersion: spec.rulesVersion, items }, truth };
  },
  policies: {
    naive: decide(() => CUTOFF.A, false),
    legacy: decide((b) => CUTOFF[role(b)], false),
    reference: decide((b) => CUTOFF[role(b)], true),
  },
};
