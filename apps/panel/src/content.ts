/** Plain-language copy for the panel. Technical terms appear next to each idea, never instead of it. */

export const STEPS = [
  {
    title: "Trabaja y deja registro",
    body: "Cada caso que el agente resuelve queda guardado: qué datos vio, qué decidió, cuánto tardó y cuánto costó. Aunque se equivoque.",
    term: "trazas",
  },
  {
    title: "Encuentra un patrón y formula una hipótesis",
    body: "Al revisar aciertos y errores, propone una explicación concreta. Por ejemplo: “en el Banco B estoy borrando compras que sí eran reales”.",
    term: "hipótesis",
  },
  {
    title: "Propone una sola mejora",
    body: "Escribe una habilidad nueva, como una ficha de instrucciones. Una sola a la vez, para saber exactamente qué causó la mejora o el daño.",
    term: "habilidad candidata",
  },
  {
    title: "La prueba en un simulador",
    body: "Compara la versión nueva contra la actual en casos que no usó para aprender, incluidos los que ya funcionaban, para detectar daños colaterales.",
    term: "validación",
  },
  {
    title: "Decide dónde aplica y hasta cuándo",
    body: "La ficha solo se activa donde demostró funcionar y bajo las reglas con las que se probó. Los criterios se fijan antes del experimento y una persona aprueba.",
    term: "alcance · vigencia · promoción",
  },
  {
    title: "Vigila los cambios de reglas",
    body: "Si cambia una regla del negocio, solo se revisan las fichas afectadas. Si algo sale mal, se regresa a la versión anterior sin perder el historial.",
    term: "revalidación · rollback",
  },
] as const;

export const STRATEGIES = [
  {
    id: "A",
    name: "Congelado",
    analogy: "Nunca aprende: resuelve siempre igual.",
    detail: "Es el punto de comparación. Si las otras estrategias no le ganan, aprender no está sirviendo.",
    term: "baseline congelado",
  },
  {
    id: "B",
    name: "Libreta de trucos",
    analogy: "Anota cada truco que descubre y los aplica todos, siempre.",
    detail: "Riesgo: dos trucos que se contradicen, o uno que servía antes de un cambio de reglas y ya no.",
    term: "acumulación de habilidades",
  },
  {
    id: "C",
    name: "Manual único",
    analogy: "Reescribe un solo manual de instrucciones para todos los casos.",
    detail: "Riesgo: arreglar un contexto descompone otro, porque todo comparte las mismas instrucciones.",
    term: "instrucciones globales",
  },
  {
    id: "D",
    name: "Fichas con etiqueta (la propuesta)",
    analogy: "Cada aprendizaje es una ficha que dice dónde aplica y con qué reglas se probó.",
    detail: "Si cambian las reglas, solo se revisan las fichas afectadas. Puede que no gane: también queremos saber si su costo vale la pena.",
    term: "habilidades con alcance y vigencia",
  },
] as const;

export const METRICS = [
  { name: "Aciertos", body: "Cuántos casos resuelve bien, por negocio, por contexto y por versión de reglas. Siempre como “x de N”.", term: "éxito por familia" },
  { name: "Daños colaterales", body: "Si mejorar un contexto descompuso otro donde las reglas no habían cambiado.", term: "regresión" },
  { name: "Casos nuevos", body: "Si lo aprendido funciona con datos que nunca vio: otros productos, otros montos, otras redacciones.", term: "transferencia" },
  { name: "Recuperación", body: "Cuántos casos y cuánto dinero tarda en volver a acertar después de un cambio de reglas.", term: "recuperación tras drift" },
  { name: "Uso correcto de las fichas", body: "Si aplicó una ficha donde no debía, si no la aplicó donde sí, o si usó una ficha vencida.", term: "falsos positivos / negativos del selector" },
  { name: "Costo", body: "Cuánto cuesta aprender, incluidas las ideas que se probaron y se descartaron.", term: "costo total" },
  { name: "Incertidumbre", body: "Con pocos casos, un número solo engaña. Mostramos rangos y marcamos los resultados no concluyentes.", term: "intervalos de confianza" },
] as const;

export const STAGES = [
  ["E1", "Cimientos: datos de prueba, reglas y respuestas correctas", "done"],
  ["E2", "El agente trabaja y deja registro de todo", "next"],
  ["E3", "El agente propone mejoras, sin ver el examen", "todo"],
  ["E4", "Juez independiente y comparación justa", "todo"],
  ["E5", "Elegir la ficha correcta según el contexto", "todo"],
  ["E6", "Aprobar, restringir o deshacer cambios", "todo"],
  ["E7", "Panel de evidencia completo (esta página es un adelanto)", "todo"],
  ["E8", "Experimento final y reporte, con resultados buenos y malos", "todo"],
] as const;

export const GLOSSARY = [
  ["Agente", "Programa que usa un modelo de IA para tomar decisiones y usar herramientas."],
  ["Habilidad (ficha)", "Instrucciones reutilizables que el agente puede seguir. No modifica al modelo de IA."],
  ["Alcance", "Dónde se permite usar una habilidad: qué negocio, qué contexto, qué formato de datos."],
  ["Vigencia", "Bajo qué versión de las reglas se probó una habilidad, y cuándo hay que volver a probarla."],
  ["Contexto", "La situación observable: qué banco, qué línea de producción, qué canal de venta."],
  ["Cambio de reglas (R1 → R2)", "Un cambio explícito del entorno, como un formato o una política nueva."],
  ["Lote", "Un paquete de casos que el agente resuelve de una vez. Cuenta como bien resuelto solo si todo está bien."],
  ["Verdad de referencia", "Las respuestas correctas, calculadas por un programa y revisadas por una persona."],
  ["Examen sellado", "Casos reservados que el sistema nunca ve mientras aprende. Solo se usan para la medición final."],
  ["Pre-registro", "Los criterios de éxito se escriben y se congelan antes del experimento, para no acomodarlos después."],
  ["Regresión", "Empeorar en algo que ya funcionaba y cuyas reglas no cambiaron."],
  ["Rollback", "Regresar a una versión anterior conservando todo el historial."],
] as const;

export const POLICY_TEXT = {
  naive: {
    name: "Una sola regla para todo",
    body: "Lo que haría alguien que aprendió en un lugar y aplica lo mismo en todos lados.",
  },
  legacy: {
    name: "Reglas correctas, pero de antes del cambio",
    body: "Distingue bien los dos contextos, pero no se enteró del cambio de reglas.",
  },
  reference: {
    name: "Reglas correctas (referencia)",
    body: "Escritas a mano por el equipo para comprobar que el problema se puede resolver con los datos visibles.",
  },
} as const;
