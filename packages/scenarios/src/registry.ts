import { codigo } from "./defs/codigo.js";
import { conciliacion } from "./defs/conciliacion.js";
import { devoluciones } from "./defs/devoluciones.js";
import { envios } from "./defs/envios.js";
import { investigacion } from "./defs/investigacion.js";
import { manufactura } from "./defs/manufactura.js";
import { mensajes } from "./defs/mensajes.js";
import { razonamiento } from "./defs/razonamiento.js";
import { terminal } from "./defs/terminal.js";
import { web } from "./defs/web.js";
import type { ScenarioDefinition } from "./types.js";

/**
 * Order matters: the index is part of each scenario's seed range. Append only.
 * 0–4 are the original business cases; 5–9 are the exams in the style of the frontier benchmarks the agent aims at
 * (SWE-bench Pro, Terminal-Bench, ARC-AGI, BrowseComp, MLE-bench), the same ones as the rooms of the 3D lab.
 */
export const SCENARIOS: readonly ScenarioDefinition[] = [conciliacion, manufactura, devoluciones, mensajes, envios, codigo, terminal, razonamiento, web, investigacion];

export function scenarioIndex(id: string): number {
  const i = SCENARIOS.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`unknown scenario ${id}`);
  return i;
}
