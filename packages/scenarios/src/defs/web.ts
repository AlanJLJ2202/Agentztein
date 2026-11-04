import type { ScenarioBatch } from "@skillab/contracts";
import { Rng } from "@skillab/env-recon";
import { batchIdFor, materialize, num, str } from "../common.js";
import type { Policy, Role, ScenarioDefinition } from "../types.js";

/**
 * Web, in the style of BrowseComp: is an answer found by browsing valid? BrowseComp questions stack several clues
 * that the answer must satisfy at once.
 * Trap: the editorial set also requires the answer to come from a primary source (not stated).
 * Change (R2): that set starts reporting the site's kind instead of the source type.
 */

const CONTEXT = { A: "set_general", B: "set_editorial" } as const;
const PRIMARY_SITES = ["gobierno", "universidad", "archivo oficial"];
const OTHER_SITES = ["periódico", "blog", "foro", "wiki comunitaria"];
const TOPICS = {
  train: ["un científico del siglo XX", "una banda de los 80", "un puente colgante", "un torneo de ajedrez"],
  heldout: ["una novela traducida", "un volcán activo", "una patente médica", "un club de futbol fundado antes de 1950"],
} as const;

const role = (b: ScenarioBatch): Role => (b.context === CONTEXT.A ? "A" : "B");
type F = ScenarioBatch["items"][number]["fields"];
const primary = (f: F, honourR2: boolean) =>
  honourR2 && typeof f.sitio === "string" ? PRIMARY_SITES.includes(f.sitio) : str(f.fuente_tipo) === "primaria";

const decide = (needsPrimary: (b: ScenarioBatch) => boolean, honourR2: boolean): Policy => (b) =>
  b.items.map((i) => ({
    itemId: i.itemId,
    label: num(i.fields.pistas_cumplidas) === num(i.fields.pistas_total) && (!needsPrimary(b) || primary(i.fields, honourR2)) ? "valida" : "invalida",
  }));

export const web: ScenarioDefinition = {
  id: "web",
  version: "1",
  info: {
    industry: "Benchmark web · estilo BrowseComp",
    title: "Verificar respuestas encontradas en la web",
    summary: "Decidir si una respuesta que un agente encontró navegando es válida, como en BrowseComp.",
    problem:
      "BrowseComp hace preguntas difíciles de encontrar, con varias pistas a la vez. Una respuesta que cumple casi todas no sirve, y cada set pide su propio tipo de fuente.",
    task: "Marcar cada respuesta como valida o invalida con cuántas pistas cumple y de dónde salió.",
    contexts: {
      A: { id: CONTEXT.A, name: "Set general", rule: "Válida si cumple todas las pistas." },
      B: { id: CONTEXT.B, name: "Set editorial", rule: "Válida si cumple todas las pistas y viene de una fuente primaria." },
    },
    labels: [
      { id: "valida", meaning: "La respuesta cumple las reglas del set" },
      { id: "invalida", meaning: "La respuesta no las cumple" },
    ],
    trap: "“Si cumple todas las pistas, es válida.” Es correcta en el set general y acepta en el editorial respuestas sacadas de blogs o foros.",
    change: "El set editorial empieza a reportar el tipo de sitio (gobierno, universidad, periódico…) en vez de si la fuente es primaria. Una regla que lee el tipo de fuente deja de funcionar, solo ahí.",
    scopedSkill: "“En el set editorial, solo valen gobierno, universidad o archivo oficial como fuente”, solo para ese contexto.",
    whyItMatters: "Un agente que busca en la web tiene que verificar, no solo encontrar; BrowseComp mide justo esa persistencia.",
  },
  schemaFor: (r, rules) => (r === "A" ? "bc-general@1" : rules === "R2" ? "bc-editorial-site@2" : "bc-editorial@1"),
  generate: (spec) => {
    const rng = new Rng(spec.seed);
    const schema = web.schemaFor(spec.role, spec.rulesVersion);
    const site = schema === "bc-editorial-site@2";
    const n = spec.profile === "heldout" ? rng.int(13, 18) : rng.int(9, 12);
    const kinds: ("good" | "trap" | "bad")[] = [];
    if (spec.role === "B") {
      kinds.push("good", "trap");
      for (let i = rng.int(0, 2); i > 0; i--) kinds.push("trap");
    }
    while (kinds.length < n) kinds.push(rng.next() < 0.55 ? "good" : "bad");

    const rows = rng.shuffle(kinds).map((kind) => {
      const total = rng.int(3, 6);
      const met = kind === "bad" ? rng.int(1, total - 1) : total;
      const isPrimary = kind === "trap" ? false : spec.role === "B" ? kind === "good" || rng.next() < 0.5 : rng.next() < 0.5;
      const label = met === total && (spec.role === "A" || isPrimary) ? "valida" : "invalida";
      return {
        label,
        fields: {
          pregunta: `bc-${rng.int(100, 999)}`,
          tema: rng.pick(TOPICS[spec.profile]),
          pistas_cumplidas: met,
          pistas_total: total,
          paginas_visitadas: rng.int(3, 60),
          ...(site
            ? { sitio: rng.pick(isPrimary ? PRIMARY_SITES : OTHER_SITES) }
            : { fuente_tipo: isPrimary ? "primaria" : rng.pick(["secundaria", "foro"]) }),
        },
      };
    });
    const batchId = batchIdFor("web", web.version, spec);
    const { items, truth } = materialize(batchId, rows);
    return { batch: { batchId, scenario: "web", context: CONTEXT[spec.role], schemaVersion: schema, rulesVersion: spec.rulesVersion, items }, truth };
  },
  policies: {
    naive: decide(() => false, false),
    legacy: decide((b) => role(b) === "B", false),
    reference: decide((b) => role(b) === "B", true),
  },
};
