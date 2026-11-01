import { conciliacion } from "./defs/conciliacion.js";
import { devoluciones } from "./defs/devoluciones.js";
import { envios } from "./defs/envios.js";
import { manufactura } from "./defs/manufactura.js";
import { mensajes } from "./defs/mensajes.js";
import type { ScenarioDefinition } from "./types.js";

/** Order matters: the index is part of each scenario's seed range. Append only. */
export const SCENARIOS: readonly ScenarioDefinition[] = [conciliacion, manufactura, devoluciones, mensajes, envios];

export function scenarioIndex(id: string): number {
  const i = SCENARIOS.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`unknown scenario ${id}`);
  return i;
}
