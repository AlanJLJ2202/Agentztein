# Agentztein en la frontera: qué medir y hacia dónde ir

Investigación del 2 de noviembre de 2026. Alan pidió dejar de centrar el proyecto en problemas de negocio
(bancos, paquetería…) y llevarlo a la frontera: un **agente de investigación de IA que se mejora solo**,
medido en los benchmarks con los que se comparan los laboratorios grandes. Este documento resume lo que hay
hoy y propone el camino. La decisión queda registrada como propuesta en ADR-018.

> **Cómo leer los números.** Las tablas de resultados públicas no coinciden entre sí: mezclan versiones del
> mismo benchmark (p. ej. Terminal-Bench 2.1, 3.0 y 4.0), muchos puntajes son reportados por el propio
> proveedor y algunas páginas no se pueden verificar. Por eso aquí no se citan puntajes de modelos salvo
> donde varias fuentes coinciden. Antes de citar una cifra en el reporte, confírmala en la página oficial.

## 1. Lo que ya sabemos del problema que estudia Agentztein

La pregunta de investigación del proyecto sigue siendo la misma y está en el centro del debate actual:
*¿puede un agente mejorarse a sí mismo sin descomponer lo que ya sabía?*

- Dos estudios de octubre de 2026 apuntan justo a ese hueco: los agentes que se mejoran solos
  [arreglan fallas pero les cuesta generalizar](https://arxiv.org/abs/2610.22984) y
  [no se comportan como aprendices continuos](https://arxiv.org/abs/2610.25858).
- La línea de trabajo de 2026 trata las habilidades, prompts, herramientas y memoria como partes del
  "arnés" que el agente puede mejorar (encuesta [arXiv 2607.07663](https://arxiv.org/abs/2607.07663)).
  Aparecen benchmarks específicos de automejora (PAST-Bench, SkillLearnBench) y una crítica fuerte:
  medir solo el puntaje final esconde *cómo* mejora el agente
  ([evaluación por proceso, arXiv 2609.24663](https://arxiv.org/abs/2609.24663)).
- Riesgo documentado: los agentes que evolucionan pueden "malevolucionar" (aprender atajos o romper
  restricciones). Esto refuerza dos piezas que Agentztein ya tiene: aprobación humana y registro inmutable.

**Lo que aporta Agentztein:** cada habilidad lleva **alcance** (dónde se usa) y **vigencia** (con qué
versión de las reglas se probó), y se mide la **interferencia**: si mejorar en A empeoró B. Eso es lo que
casi ningún leaderboard reporta.

## 2. Benchmarks de frontera a los que apuntar

| Capacidad | Benchmark | Qué mide | Nota |
|---|---|---|---|
| Código | SWE-bench Pro | Arreglar errores reales en repositorios | SWE-bench Verified se considera saturado; OpenAI dejó de reportarlo en febrero de 2026 ([arXiv 2609.08149](https://arxiv.org/pdf/2609.08149)) |
| Terminal | Terminal-Bench | Tareas largas en la terminal (compilar, configurar, depurar) | Hay varias versiones vigentes; comparar solo dentro de la misma ([BenchLM](https://benchlm.ai/benchmarks/terminalbench21), [CodingFleet](https://codingfleet.com/blog/terminal-bench-3-leaderboard-2026/)) |
| Razonamiento | ARC-AGI-3 | Juegos interactivos nuevos: descubrir reglas sin instrucciones | Al lanzarse (marzo de 2026) las personas lo resolvían y los modelos de frontera quedaban por debajo de 1 % ([Decrypt](https://decrypt.co/362496/is-agi-here-not-even-close-ai-benchmark?amp=1), [resultados oficiales](https://arcprize.org/results)) |
| Web | BrowseComp | Encontrar información muy difícil navegando | Útil para el ejemplo de interferencia (buscar en web ayuda aquí y estorba en ARC) |
| Investigación de IA | MLE-bench, PaperBench, RE-Bench | Competencias de ML, replicar artículos, ingeniería de investigación con líneas base humanas | [MLE-bench](https://arxiv.org/abs/2410.07095), [PaperBench](https://arxiv.org/abs/2504.01848), [RE-Bench (METR)](https://metr.org/blog/2024-11-22-evaluating-r-d-capabilities-of-llms) |
| Autonomía | Horizonte de tiempo de METR | Cuántas horas de trabajo experto completa solo | Duplicación histórica de ~7 meses y más rápida desde 2024; METR advierte que las estimaciones recientes son sensibles al método ([nota de METR](https://metr.org/notes/2026-03-20-impact-of-modelling-assumptions-on-time-horizon-results/)) |

## 3. Qué capacidades necesita el agente

1. **Arnés que se mejora** (no pesos): habilidades, memoria y herramientas versionadas. Ya existe la base
   (contratos, DB append-only, oráculos).
2. **Selector con alcance:** decidir qué habilidad aplica a cada tarea (código, terminal, web, acertijo…).
   Es el corazón del experimento: evita que "buscar en internet" se use en ARC.
3. **Evaluación honesta:** examen sellado, criterios preregistrados, intervalos de confianza, costo total y
   **matriz de interferencia** (efecto de cada habilidad en cada benchmark).
4. **Contenedores reproducibles** para correr tareas de terminal y código (los benchmarks de agentes ya se
   distribuyen así).
5. **Revisión ante cambios:** cuando sale una versión nueva de un benchmark, solo se revisan las
   habilidades cuyo alcance cubre ese benchmark.

## 4. Camino propuesto

1. **Conectar Muse Spark** como modelo del ejecutor (E2) y correr un subconjunto pequeño de un benchmark
   de terminal o código con registro completo y costo.
2. **Dos dominios con tensión real** para la corrida confirmatoria: uno donde una habilidad ayuda
   (investigación web) y otro donde estorba (acertijos tipo ARC). Es la versión de frontera del conflicto
   A/B que hoy prueban los escenarios sintéticos.
3. **Mantener los escenarios sintéticos actuales** como banco de pruebas rápido y barato del mecanismo
   (son deterministas y tienen respuesta correcta exacta), pero ya no como la cara del proyecto.
4. **Reporte:** puntaje por benchmark, interferencia entre benchmarks, costo y casos donde no ganó.

## Fuentes consultadas
- [Frontier AI Models Evaluation Benchmarks (blog, cifras sin verificar)](https://kharshit.github.io/blog/frontier-ai-models-evaluation-benchmarks/)
- [SWE-Bench Pro Verified, arXiv 2609.08149](https://arxiv.org/pdf/2609.08149)
- [Terminal-Bench 2.1, BenchLM](https://benchlm.ai/benchmarks/terminalbench21) · [Terminal-Bench 3.0, CodingFleet](https://codingfleet.com/blog/terminal-bench-3-leaderboard-2026/)
- [ARC Prize, resultados](https://arcprize.org/results) · [Decrypt sobre ARC-AGI-3](https://decrypt.co/362496/is-agi-here-not-even-close-ai-benchmark?amp=1)
- [METR: supuestos de modelado del horizonte de tiempo](https://metr.org/notes/2026-03-20-impact-of-modelling-assumptions-on-time-horizon-results/) · [METR (Wikipedia)](https://en.wikipedia.org/wiki/METR)
- [Recursive Self-Improvement in AI, arXiv 2607.07663](https://arxiv.org/abs/2607.07663) · [Process-Level Evaluation of Self-Evolving Agents, arXiv 2609.24663](https://arxiv.org/abs/2609.24663) · [PAST-Bench, arXiv 2608.04003](https://arxiv.org/pdf/2608.04003)
- [awesome-recursive-self-improvement](https://github.com/natnew/awesome-recursive-self-improvement)
- [MLE-bench](https://arxiv.org/abs/2410.07095) · [PaperBench](https://arxiv.org/abs/2504.01848) · [RE-Bench](https://metr.org/blog/2024-11-22-evaluating-r-d-capabilities-of-llms)
