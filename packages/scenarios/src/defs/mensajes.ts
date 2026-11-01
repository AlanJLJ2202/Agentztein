import type { ScenarioBatch } from "@skillab/contracts";
import { Rng } from "@skillab/env-recon";
import { batchIdFor, materialize, str } from "../common.js";
import type { Policy, Role, ScenarioDefinition } from "../types.js";

/**
 * Routing customer messages for a (fictional) motorcycle-accessories store with two audiences.
 * Trap: "price question → send the catalogue" is right for consumers, wrong for distributors,
 * who need a wholesale quote from a sales rep.
 * Change (R2): distributors' warranty claims move from support to their sales rep.
 */

const CONTEXT = { A: "instagram_consumidores", B: "whatsapp_distribuidores" } as const;
type Intent = "precio" | "garantia" | "envio";

/** Article forms per product so templates stay grammatical: el/la/los, mi/mis, del/de la/de los. */
type Product = { el: string; mi: string; del: string };
const P = (art: "m" | "f" | "mp" | "fp", noun: string): Product => {
  const el = { m: "el", f: "la", mp: "los", fp: "las" }[art];
  const mi = art === "mp" || art === "fp" ? "mis" : "mi";
  return { el: `${el} ${noun}`, mi: `${mi} ${noun}`, del: art === "m" ? `del ${noun}` : `de ${el} ${noun}` };
};

const PRODUCTS: Record<"train" | "heldout", Product[]> = {
  train: [P("m", "casco abatible"), P("mp", "guantes de piel"), P("f", "llanta 90/90-18"), P("f", "mica para casco"), P("f", "chamarra con protecciones")],
  heldout: [P("m", "impermeable"), P("m", "intercomunicador"), P("m", "candado de disco"), P("fp", "rodilleras"), P("fp", "botas de moto")],
};

const TEMPLATES: Record<"train" | "heldout", Record<Intent, string[]>> = {
  train: {
    precio: ["Hola, ¿me pasas el precio {del}?", "Precio {del}, porfa", "Quiero saber el precio {del}"],
    garantia: [
      "Tengo un defecto en {mi}, ¿aplica la garantía?",
      "Quiero hacer válida la garantía de {mi}",
      "Hola, ¿cómo hago válida la garantía {del}?",
    ],
    envio: ["¿Cuándo llega mi pedido {o}?", "No me ha llegado el pedido {o}", "¿Me das la guía del pedido {o}?"],
  },
  heldout: {
    precio: ["Buenas, ¿en cuánto me dejas {el}?", "Necesito el costo {del}", "Cotízame {n} unidades {del}"],
    garantia: ["Encontré una falla de fábrica en {mi}", "Vino con defecto {el}, ¿me hacen el cambio?"],
    envio: ["¿Dónde viene mi paquete {o}?", "Mi envío {o} sigue sin llegar"],
  },
};

/** Keyword intent detection shared by all reference policies; tests prove it is exact on every template. */
export function intentOf(text: string): Intent {
  const t = text.toLowerCase();
  if (/garant|defect|falla|rompi/.test(t)) return "garantia";
  if (/pedido|llega|gu[ií]a|paquete|env[ií]o/.test(t)) return "envio";
  if (/precio|cuesta|cu[aá]nto me dejas|costo|cot[ií]z/.test(t)) return "precio";
  throw new Error(`unknown intent: ${text}`);
}

function route(intent: Intent, r: Role, rules: ScenarioBatch["rulesVersion"], perChannel: boolean, knowsR2: boolean): string {
  if (intent === "envio") return "logistica";
  if (intent === "precio") return perChannel && r === "B" ? "ventas" : "catalogo";
  return perChannel && knowsR2 && r === "B" && rules === "R2" ? "ventas" : "soporte";
}

const role = (b: ScenarioBatch): Role => (b.context === CONTEXT.A ? "A" : "B");

const decide = (perChannel: boolean, knowsR2: boolean): Policy => (b) =>
  b.items.map((i) => ({
    itemId: i.itemId,
    label: route(intentOf(str(i.fields.texto)), role(b), b.rulesVersion, perChannel, knowsR2),
  }));

export const mensajes: ScenarioDefinition = {
  id: "mensajes",
  version: "1",
  info: {
    industry: "Atención a clientes y redes sociales",
    title: "Clasificar mensajes de clientes",
    summary: "Mandar cada mensaje al área correcta: catálogo automático, ventas, soporte o logística.",
    problem:
      "Un mensaje mal enrutado se queda sin respuesta o la recibe equivocada: a un distribuidor que pide precio de mayoreo no le sirve el catálogo de menudeo.",
    task: "Asignar cada mensaje a catálogo, ventas, soporte o logística según el canal y lo que pide el cliente.",
    contexts: {
      A: { id: CONTEXT.A, name: "Instagram · consumidores", rule: "Precio → catálogo automático; garantía → soporte; pedido → logística." },
      B: { id: CONTEXT.B, name: "WhatsApp · distribuidores", rule: "Precio → asesor de ventas (cotización de mayoreo); garantía → soporte; pedido → logística." },
    },
    labels: [
      { id: "catalogo", meaning: "Respuesta automática con catálogo y precios de menudeo" },
      { id: "ventas", meaning: "Asesor de ventas / ejecutivo de cuenta" },
      { id: "soporte", meaning: "Equipo de garantías" },
      { id: "logistica", meaning: "Estatus de pedidos y envíos" },
    ],
    trap: "“Si preguntan precio, manda el catálogo.” Funciona con consumidores y deja sin cotización a los distribuidores.",
    change: "La empresa decide que las garantías de distribuidores las atienda su ejecutivo de ventas. Lo de Instagram no cambia.",
    scopedSkill: "“Precio → ventas” con alcance: solo WhatsApp de distribuidores; y “garantía → ventas” solo bajo la política R2.",
    whyItMatters: "Muchos negocios atienden a mayoristas y a consumidores por canales distintos con el mismo equipo; un bot con una sola regla para todos pierde ventas.",
  },
  schemaFor: (r) => (r === "A" ? "MSG-IG@1" : "MSG-WA@1"),
  generate: (spec) => {
    const rng = new Rng(spec.seed);
    const tpl = TEMPLATES[spec.profile];
    const products = PRODUCTS[spec.profile];
    const n = spec.profile === "heldout" ? rng.int(12, 18) : rng.int(8, 12);

    const intents: Intent[] = [];
    if (spec.role === "B") intents.push("precio", "garantia");
    while (intents.length < n) intents.push(rng.pick(["precio", "garantia", "envio"] as const));

    const rows = rng.shuffle(intents).map((intent) => {
      const product = rng.pick(products);
      const text = rng
        .pick(tpl[intent])
        .replace("{el}", product.el)
        .replace("{mi}", product.mi)
        .replace("{del}", product.del)
        .replace("{o}", `PED-${rng.int(10000, 99999)}`)
        .replace("{n}", String(rng.int(5, 40)));
      return {
        label: route(intent, spec.role, spec.rulesVersion, true, true),
        fields: {
          mensaje: `MSG-${rng.hex(6).toUpperCase()}`,
          cliente: spec.role === "A" ? `@usuario_${rng.int(100, 999)}` : `Distribuidora ${rng.pick(["del Bajío", "Norte", "Occidente", "Centro"])}`,
          hora: `${String(rng.int(8, 21)).padStart(2, "0")}:${String(rng.int(0, 59)).padStart(2, "0")}`,
          texto: text,
        },
      };
    });

    const batchId = batchIdFor("mensajes", mensajes.version, spec);
    const { items, truth } = materialize(batchId, rows);
    return {
      batch: {
        batchId,
        scenario: "mensajes",
        context: CONTEXT[spec.role],
        schemaVersion: mensajes.schemaFor(spec.role, spec.rulesVersion),
        rulesVersion: spec.rulesVersion,
        items,
      },
      truth,
    };
  },
  policies: {
    naive: decide(false, false),
    legacy: decide(true, false),
    reference: decide(true, true),
  },
};
