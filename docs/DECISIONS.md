# Decisiones (ADR)

Formato: contexto → opción elegida → alternativas → consecuencias.
Las marcadas **[pendiente de confirmar por Alan]** son defaults para las "decisiones abiertas" del anteproyecto.

---

## ADR-000 — Fuente de verdad: anteproyecto v1.0 recibido y contrastado
- **Contexto:** E1 se construyó con el prompt maestro como especificación provisional porque el PDF no
  estaba disponible. El 2026-10-28 se recibió `Anteproyecto_Evolucion_Verificable_de_Agentes.pdf`
  (v1.0, 27-oct-2026, 14 páginas) y se revisó completo contra el prompt y contra lo construido.
- **Resultado de la revisión:** no hay contradicciones metodológicas entre prompt y PDF en separación de
  conjuntos, reglas de promoción ni límites del candidato. Sí hay huecos que el prompt no cubría y que
  el PDF exige; se resuelven así (gana el PDF):

  | Punto del PDF | Hueco | Resolución |
  |---|---|---|
  | §04 Decisión: "motivo, evaluador, umbrales, revisión humana, versión promovida" | `Decision` no tenía motivo | Campo `reason` obligatorio en el contrato + migración `0002_decision_reason` |
  | §06 "mejora mínima y tolerancia de regresión a calibrar con la variabilidad del baseline" | ADR-003 fijaba números | ADR-003 reescrito: los números son marcadores; se derivan de la calibración |
  | §07 "la verdad de referencia ... se revisa antes de ejecutar agentes" | No había revisión humana | ADR-011: `pnpm datasets:review` → `docs/GROUND_TRUTH_REVIEW.md` + aprobación de Alan |
  | §03 H3 "cambios individuales vs paquetes de cambios simultáneos" | El prompt no tenía condición de paquetes | ADR-012 |
  | §10 riesgo "sobreajuste y atajos → transformaciones semánticamente válidas [10]" | El test solo cambiaba distribución | ADR-013 |
  | §10 riesgo "experiencias contaminadas → procedencia, separación datos/instrucciones" | Sin regla explícita para el proponente | ADR-014 |
  | §06 "registrar ... cualquier cambio de infraestructura" | No previsto | Registro de infraestructura en E2 (`infra_changes`) |
  | §13 Referencias [1]–[14] | README sin referencias | Lista de referencias del anteproyecto en `README.md` |

- **Coincidencias confirmadas:** F1–F3, variantes A–D, piloto 360 episodios, ablaciones D-sin-alcance y
  D-sin-vigencia, operaciones permitidas, estados, regla de promoción, invariantes, demo de 4 minutos,
  criterios de MVP, Control solo como antecedente, nombre comercial pendiente.

## ADR-001 — Nombre de código y licencia
- **Decisión:** nombre de código `skillab` (paquetes `@skillab/*`). Repositorio sin licencia pública
  por ahora (todos los derechos reservados) hasta decidir publicación.
- **Alternativas:** MIT / Apache-2.0 desde el inicio.
- **Consecuencias:** no se puede publicar el benchmark hasta resolverlo. **[pendiente de confirmar por Alan]**

## ADR-002 — Stack y versiones fijadas
- **Decisión:** Node 22 LTS, pnpm 10 workspaces, TypeScript **5.9.3** (no 7.x: `typescript-eslint` 8
  soporta `<6.1`), Zod 4, Vitest 5, fast-check 4, Drizzle ORM 0.45 + drizzle-kit 0.31, `pg` 8,
  ESLint 9 (flat config, `typescript-eslint` strict).
- **Paquetes internos sin build:** cada paquete exporta `./src/index.ts`; `moduleResolution: Bundler`,
  ejecución con `tsx`/Vitest. Evita un paso de build en el MVP.
- **Alternativas:** project references + `tsc -b` con emisión a `dist/`.
- **Consecuencias:** los workers (E2) se lanzan con `tsx`. Si hiciera falta emitir JS, se añade luego.

## ADR-003 — Umbrales de promoción **[pendiente de confirmar por Alan]**
- **Contexto:** el PDF (§06) pide que mejora mínima y tolerancia de regresión se calibren con la
  variabilidad del baseline y se fijen antes de la corrida confirmatoria.
- **Decisión:** los umbrales se derivan en E8 a partir de la calibración de la variante A (dispersión del
  éxito por lote entre repeticiones, por familia), y se congelan con hash en `config/preregistration/v1.json`.
  Regla de derivación por defecto: mejora mínima = máx(10 pp, 2 × desviación típica entre repeticiones);
  tolerancia de regresión = máx(5 pp, 1 × desviación típica). Además, el límite inferior del IC 95%
  bootstrap por casos de la mejora debe ser > 0.
- **Restricciones duras (booleanas):** 0 violaciones observadas de invariantes, validación estructural OK,
  permisos ⊆ herramientas. Se reportan como "0 observadas", nunca como "sin fallos".
- **Consecuencias:** hasta la calibración, ningún número de umbral es definitivo.

## ADR-004 — Autonomía de promoción **[pendiente de confirmar por Alan]**
- **Decisión:** `human_required` por defecto en el pre-registro v1. `auto` solo en `--dry-run`/tests.

## ADR-005 — Modelo y proveedor **[pendiente de confirmar por Alan]**
- **Decisión:** proveedor `anthropic` detrás de `ModelClient`. Modelo ejecutor y proponente: a definir
  tras leer la documentación oficial vigente en E2 (no se asume nombre de modelo ni precio).
  `config/pricing.json` se llena con precios que Alan confirme; sin precio → el adaptador falla al arrancar.
- Presupuesto: USD 50 global, USD 10 por experimento (defaults del prompt).

## ADR-006 — Publicación del benchmark **[pendiente de confirmar por Alan]**
- **Decisión:** no se publica. El generador y los hashes de splits quedan en el repo; el split `test`
  (sellado) y el ground truth no se commitean: se regeneran de semillas y se verifican por hash.

## ADR-007 — Diseño del entorno sintético (env-recon)
- **Lote = caso = unidad experimental.** Cada lote es de un solo proveedor, de modo que
  `get_import_metadata(batchId)` devuelve un único `vendor/schemaVersion/rulesVersion`.
- **Familias:**
  - F1 `stable`: solo vendorA, R1.
  - F2 `interleaved`: secuencia de lotes alternando vendorA / vendorB, R1 (A@1, B@1).
  - F3 `temporal_shift`: secuencia alternada A/B en orden temporal; los lotes con índice ≥ `shiftIndex`
    usan R2 (vendorB pasa a B@2; vendorA sigue en A@1).
  "Lotes mezclados" se interpreta como episodios intercalados, no filas de dos proveedores en el mismo lote.
  El PDF (§07) describe F2 como "contextos intercalados con reglas distintas"; aquí las reglas distintas
  son los procedimientos correctos de cada proveedor (id estable en A, hora en la descripción en B).
- **Señales observables por proveedor** (para que exista una solución aprendible):
  - vendorA (A@1): `vendor_txn_id` estable; un duplicado es reimportación con el mismo id.
    No hay compras legítimas repetidas con mismo importe y fecha (por diseño: así el oráculo ingenuo
    acierta en A).
  - vendorB (B@1/B@2): sin id estable. La descripción incluye la hora de la operación
    (`CAFE LUNA 08:12`). Un duplicado es una reimportación con descripción idéntica; dos compras
    legítimas iguales difieren en la hora.
  - Transferencias entre cuentas propias: dos filas del mismo lote, mismo día, mismo importe absoluto,
    sentidos opuestos, mismo `ref`.
  - Reembolsos: fila posterior con sentido opuesto, mismo importe absoluto y descripción `REFUND <comercio>`.
  - B@2 (R2): `amount` siempre positivo + `direction` (`debit`|`credit`).
- **Etiquetas:** original = `legitimate`; copia = `duplicate_of(original)` (en cadena, todas apuntan
  al original más antiguo); reembolso = `refund_of(compra)`; cada pata de transferencia =
  `transfer_pair(otra pata)`.
- **Splits:** semillas disjuntas por rango (adaptation 1e6+, validation 2e6+, test 3e6+). El split `test`
  usa un perfil `heldout`: otros comercios, otra distribución de importes, lotes más largos y
  combinaciones no vistas (reembolso de una compra duplicada, transferencia y duplicado el mismo día).
- **rowId/batchId:** hash de (split, familia, semilla, índice) → no filtran la etiqueta ni el split.
- **Alternativas:** lotes con filas de ambos proveedores; detección de duplicados por `ref` en vendorB.
- **Consecuencias:** el conflicto A/B se diseña explícitamente; las pruebas del generador verifican que
  existe y es medible.

## ADR-008 — Scoring en E1 vs evaluador externo
- **Contexto:** el criterio de salida de E1 pide demostrar el conflicto con un oráculo ingenuo, pero el
  evaluador externo aislado es de E4.
- **Decisión:** `env-recon/src/baselines` incluye oráculos de referencia y una función de scoring
  mínima (accuracy por fila y éxito por lote) usada solo para validar el entorno. En E4 el evaluador
  externo reemplaza esa medida y la prueba de conflicto se re-ejecuta contra él.
- **Consecuencias:** dos implementaciones de scoring temporalmente; E4 añade un test que exige que coincidan.

## ADR-009 — Inmutabilidad y sellado a nivel de base de datos
- **Decisión:** I1 se refuerza en Postgres con un trigger que rechaza `UPDATE`/`DELETE` sobre
  `skill_versions`, `skill_events`, `decisions`, `evidence`, `episodes` y `test_access_log`
  (tablas append-only). El ground truth y los casos de test viven en el esquema Postgres `sealed`,
  para que en E3 los roles (`proposer_ro`, `runner`, `evaluator`) se definan con `GRANT` por esquema.
- **Alternativas:** inmutabilidad solo en la capa de repositorio.
- **Consecuencias:** las correcciones se hacen con nuevas filas (versiones/eventos), nunca editando.

## ADR-010 — Postgres en el entorno de desarrollo de esta sesión
- **Contexto:** el contenedor de la sesión no tiene el daemon de Docker garantizado; sí tiene PostgreSQL 16.
- **Decisión:** `docker-compose.yml` es el camino oficial; los tests de DB usan `DATABASE_URL` y se
  marcan como *skipped* (visiblemente) si no está definida. En esta sesión se usa el Postgres 16 local.

## ADR-011 — Revisión humana de la verdad de referencia antes de ejecutar agentes
- **Contexto:** PDF §07: "La verdad de referencia se genera programáticamente y se revisa antes de
  ejecutar agentes."
- **Decisión:** `pnpm datasets:review` genera `docs/GROUND_TRUTH_REVIEW.md` con un lote de adaptation por
  proveedor × versión de reglas, sus etiquetas y conteos por split (solo adaptation y validation; el test
  sellado no se lee). Ninguna corrida con modelo real (calibración incluida) empieza sin que Alan apruebe
  esa revisión. La aprobación se anota aquí con fecha y hash del manifest.
- **Estado:** pendiente. Manifest a revisar: `7615ab2bffd5d92ab3dffb40d09139d18f19d5e71860857c9d348d54141f3b69` (ds-v2, 5 escenarios; reemplaza al de ds-v1).
- **Consecuencias:** cualquier cambio del generador invalida la aprobación y exige una nueva revisión.

## ADR-012 — Condición de paquetes para H3 **[pendiente de confirmar por Alan]**
- **Contexto:** H3 (§03) compara evaluar cambios individuales frente a paquetes de cambios simultáneos.
  El prompt solo impone "un cambio por candidata" y no tenía forma de medir H3.
- **Decisión:** análisis secundario en E8, después de las ablaciones y solo si el presupuesto alcanza:
  se toman k candidatas ya generadas (k = 3 por defecto, al menos una conocida como perjudicial en otra
  familia) y se evalúan (a) una a una y (b) como paquete, con los mismos casos de validation. Métrica:
  ¿la evaluación identifica la candidata perjudicial? y coste de llegar a esa identificación.
  No requiere llamadas extra al proponente.
- **Consecuencias:** si no hay presupuesto, H3 se declara no evaluada en el reporte, sin inferirla.

## ADR-013 — Transformaciones semánticamente válidas en el conjunto final
- **Contexto:** PDF §10 propone casos finales reservados y transformaciones semánticamente válidas [10]
  contra sobreajuste y atajos.
- **Decisión:** en E4 el evaluador añade al split test variantes de cada caso que no cambian la respuesta
  correcta: reordenar filas del mismo día, desplazar todas las fechas, renombrar comercios de forma
  consistente, escalar importes por un factor común. La métrica de invariancia (¿la etiqueta cambia bajo
  la transformación?) se reporta aparte. Los oráculos de referencia deben ser invariantes (test).
- **Consecuencias:** el split test crece; el coste de evaluación final se recalcula en la calibración.

## ADR-014 — Las trazas son datos, no instrucciones
- **Contexto:** PDF §10 riesgo "experiencias contaminadas".
- **Decisión:** el proponente recibe las trazas dentro de un bloque delimitado y marcado como datos no
  confiables; su prompt indica que el contenido de filas y descripciones nunca son instrucciones. La
  validación estructural rechaza candidatas cuyo texto copie cadenas literales del dataset (ya prevista
  como anti-memorización) y cada candidata guarda la lista de trazas de origen (procedencia).
- **Consecuencias:** se añade en E3 un test con una descripción que intenta inyectar instrucciones.

## ADR-015 — Flujo 100% en la nube (sin máquina local)
- **Contexto:** Alan trabaja solo desde servicios en la nube, sin editor ni terminal locales. El contenedor
  de las sesiones de Claude Code no alcanza hosts de Postgres externos (red restringida a HTTPS vía proxy).
- **Decisión:**
  - Código: sesiones de Claude Code en la nube → commits a la rama de trabajo en GitHub.
  - Verificación: GitHub Actions `ci` (Postgres 16 efímero) en cada push.
  - Base de datos alojada: Supabase. Migraciones con el workflow manual `db-migrate`
    (GitHub → Actions → Run workflow, escribiendo `migrate`), con secretos `DATABASE_URL` (Session pooler)
    y `DATABASE_SSL_CA` en el environment `production` de GitHub.
  - TLS verificado contra el CA del proyecto Supabase (`DATABASE_SSL_CA`); nunca `rejectUnauthorized: false`.
  - Supabase usará Postgres 17 o más nuevo; el esquema no depende de funciones exclusivas de 16. El CI sigue en 16.
  - Seguridad: quitar `public` de los esquemas expuestos por la Data API de Supabase (o RLS sin políticas),
    porque las tablas viven en `public`. `sealed` no se expone.
  - Panel (E7): Vercel, con `DATABASE_URL` del Transaction pooler como variable de entorno.
- **Alternativas:** abrir la red del entorno de Claude a Supabase (Postgres va por TCP, no por el proxy
  HTTPS, así que no está garantizado); pegar SQL a mano en el editor de Supabase (propenso a errores y sin
  registro del journal de Drizzle).
- **Consecuencias:** la conexión real a Supabase solo se prueba cuando corre `db-migrate`; el código de
  TLS tiene test unitario, pero no se ha probado contra Supabase desde esta sesión.

## ADR-016 — Varios escenarios de negocio (cambia un "fuera de alcance" del prompt) **[pendiente de confirmar por Alan: tamaño del piloto]**
- **Contexto:** Alan pidió medir el mecanismo en escenarios reales de distintos negocios. El prompt ponía
  "múltiples dominios" fuera del alcance del MVP y el PDF (§09) recomendaba un solo dominio si faltaba tiempo.
  Es decisión del dueño del proyecto; se registra aquí.
- **Decisión:** paquete `@skillab/scenarios` con un marco común y 5 escenarios sintéticos:
  conciliación bancaria (el original, sin cambios en su generador), inspección de calidad en manufactura,
  devoluciones en comercio, clasificación de mensajes de clientes y tarifas de paquetería.
  Todos comparten la estructura de la pregunta de investigación, y las pruebas lo exigen a cada uno:
  1. una regla global correcta en el contexto A y que falla en **todos** los lotes del contexto B;
  2. un cambio R1 → R2 que solo afecta al contexto B (lo aprendido para A y para R1 sigue siendo válido);
  3. una política de referencia perfecta, que prueba que el problema se resuelve con datos observables;
  4. un perfil `heldout` para el examen sellado (otros productos, montos, redacciones, lotes más largos).
  Tipos de cambio cubiertos: formato de campo (conciliación, manufactura), política (devoluciones, mensajes)
  y parámetro de cálculo (paquetería).
- **Lo que esto NO es:** no son datos reales ni casos de clientes; son recreaciones sintéticas de problemas
  comunes. Mejorar en ellos no demuestra que el sistema funcione en un negocio real.
- **Impacto en el piloto:** 5 escenarios × 3 familias × 10 casos × 4 variantes × 3 repeticiones = 1,800
  episodios (5 veces el piloto del PDF). Propuesta por defecto: la corrida confirmatoria usa 2 escenarios
  (conciliación + uno de cambio de política) y los otros 3 se reportan como exploratorios, claramente
  separados. Se decide con la calibración de E2.
- **Consecuencias:** dataset `ds-v2` (45 conjuntos, manifest `7615ab2bffd5d92ab3dffb40d09139d18f19d5e71860857c9d348d54141f3b69`); la revisión humana de ADR-011 cubre los
  5 escenarios.

## ADR-017 — Contratos genéricos de escenario
- **Decisión:** `Item`/`ScenarioLabel`/`ScenarioBatch`/`ScenarioCase` en `@skillab/contracts`. El alcance de una
  habilidad pasa de `vendors` a `scenario` + `contexts`; `Evidence` y `FamilyResult` igual. Herramientas del
  agente genéricas: `list_items`, `get_item`, `get_context_metadata`, `submit_labels`. En DB, migraciones
  `0003`/`0004` reemplazan `vendor` por `scenario` + `context` (tablas vacías; no hay datos que migrar).
- **Alternativas:** un esquema por escenario (más tipado, pero el selector y el evaluador tendrían que conocer
  cada dominio).
- **Consecuencias:** `env-recon` conserva sus tipos propios y se expone como escenario mediante un adaptador.

## ADR-018 — Dirección: agente de investigación de frontera medido en benchmarks públicos **[propuesta; pendiente de plan técnico]**
- **Contexto:** Alan pidió (2 nov 2026) que el proyecto no se centre en problemas de negocio, sino en ser un
  agente de investigación de IA de frontera que se mejora solo y se mide en benchmarks públicos.
  Investigación y fuentes en [`FRONTERA.md`](FRONTERA.md).
- **Decisión:** la pregunta de investigación no cambia (alcance + vigencia contra acumular habilidades o
  reescribir instrucciones globales). Cambia dónde se mide: capacidades de código, terminal, razonamiento,
  web e investigación de IA, con benchmarks como SWE-bench Pro, Terminal-Bench, ARC-AGI-3, BrowseComp,
  MLE-bench/PaperBench y el horizonte de tiempo de METR. La landing ya presenta esta dirección.
- **Lo que NO cambia todavía:** los 5 escenarios sintéticos (ADR-016) siguen como banco de pruebas rápido y
  determinista del mecanismo; el panel aún los muestra. No hay resultados en ningún benchmark.
- **Pendiente:** elegir el primer benchmark para E2 (terminal o código), el subconjunto y el presupuesto, y
  el par de dominios en tensión para la corrida confirmatoria.

## ADR-019 — Cuentas con Google, API key propia y radar de investigación
- **Contexto:** Alan pidió (2 nov 2026) pasar de la landing a un producto con login de Google donde cada
  usuario conecte su propia API key (los pagos y créditos de IA quedan para una fase 2), y que el agente
  también investigue lo nuevo (monitoreando Hacker News), no solo aprenda de sus errores.
- **Decisión:**
  - Login con **Supabase Auth (Google, PKCE)**: el proyecto ya usa Supabase. La app (`apps/app`, en `/app/`)
    lee la URL y la llave pública de `/api/config`, así que solo hay que configurar variables en Vercel.
  - **Funciones de Vercel en `/api`** (JavaScript ESM sin compilación para evitar sorpresas de empaquetado):
    verifican el token con `GET /auth/v1/user` de Supabase y guardan en el esquema `app` (no expuesto por la
    Data API). Tablas mutables a propósito, separadas de las de investigación (append-only, ADR-009).
  - **Llaves cifradas** con AES-256-GCM (llave derivada de `KEYS_ENCRYPTION_SECRET`, datos adicionales =
    usuario + proveedor). El navegador solo ve los últimos 4 caracteres. Claude va por el SDK oficial con
    `baseURL` fijo; los demás por sus endpoints compatibles con OpenAI.
  - **Radar:** lee las historias de IA más comentadas de la semana (API pública de Algolia para HN), el modelo
    del usuario decide `experiment` / `watch` / `skip` con ganancia, costo y por qué, juzgando solo titular y
    fuente. Las historias van como datos no confiables; la respuesta se valida (ids y enums) antes de guardar.
    "Experimentar" no adopta nada: produce una candidata que debe pasar el mismo laboratorio.
- **Marca:** el logo "Y" de Hacker News se usa para indicar la fuente, con aviso de no afiliación a
  Y Combinator; no se dice ni sugiere respaldo de YC.
- **Pendiente:** fase 2 (créditos), que el radar corra solo a diario (cron) y conectar sus candidatas al ciclo E2–E5.

## ADR-020 — Solo modelos de Meta, login con correo y ciclo de cinco fases
- **Contexto:** Alan pidió (2 nov 2026) que Agentztein trabaje solo con modelos de Meta, que haya login con
  correo y contraseña con código de verificación, y que investigar no pese más que las otras fases.
- **Decisión:**
  - **Meta Model API** (`https://api.meta.ai/v1`, compatible con OpenAI) como único proveedor: la Llama API se
    retiró el 6 jul 2026. Modelo por defecto: el `muse-spark-X.Y` estándar más nuevo que liste la llave
    (respaldo `muse-spark-1.1`); nunca un `-contributor` por defecto. Se quitó el SDK de Anthropic y los demás
    proveedores. Limitación conocida: la vista previa de Meta está abierta a desarrolladores en EE. UU.
  - **Correo + contraseña** con Supabase Auth: el código de 6 dígitos viene de las plantillas
    (`supabase/templates/`, `{{ .Token }}`); `verifyOtp` tipo `email` (con respaldo `signup`) para confirmar y
    tipo `recovery` para cambiar la contraseña.
  - **Landing:** "Así se desarrolla sola" es un ciclo de 5 fases con el mismo peso (Investiga es la primera),
    cada una con su imagen 3D de Agentztein y su animación; el feed en vivo de Hacker News vive en el detalle
    de "Investiga". Cada benchmark abre un laboratorio 3D interactivo (three.js) con sus tres pasos; en
    ARC-AGI-3 se puede jugar el nivel. Son ilustraciones, no resultados.

## ADR-021 — El laboratorio como edificio, vista en primera persona y "el cerebro lo pone Meta"
- **Contexto:** Alan pidió (2 nov 2026) ver el laboratorio en primera persona, un cuarto temático y educativo
  por benchmark alrededor de la cuna, y presentar a Meta como "el cerebro" (no "solo modelos de Meta"),
  mencionando los niveles de esfuerzo.
- **Decisión:**
  - `room.js` es ahora un edificio: la cuna al centro y seis cuartos (dos por lado) con puertas de color.
    Cada cuarto tiene un mural y tres exhibiciones numeradas con texto en lenguaje cotidiano y analogías
    (`museum.js`); en la sala de ARC-AGI-3 el tablero del piso se juega caminando. Rutas por las puertas,
    colisiones con muros y exhibiciones, minimapa, y la tarjeta bajo el laboratorio funciona como guía.
  - Tercera persona con muros recortados (vista de casa de muñecas); primera persona (V) con muros completos:
    arrastrar para mirar, WASD/flechas para caminar, E para interactuar con lo que apunta la mira.
  - Sección de Meta: "El cerebro lo pone Meta", con los niveles de esfuerzo de Muse Spark
    (minimal, low, medium, high, xhigh). El radar pide `reasoning_effort: "low"` y reintenta sin él si el
    modelo no lo acepta.
  - "Así se desarrolla sola" pasa a ser un diagrama circular: Agentztein al centro (su imagen cambia por fase)
    y las cinco fases alrededor como un ciclo; una sola línea por fase y "Ver detalle" para lo demás.

## ADR-022 — La familia Muse completa, sujetos de prueba en criogenia y controles más fáciles
- **Contexto (3 nov 2026):** Alan pidió poder elegir entre todos los modelos de Meta (no solo Muse Spark),
  investigar qué más ofrecen (visión, voz), un Agentztein congelado por cuarto que despierte para hacer la
  prueba, controles menos confusos y que el laboratorio quepa en la pantalla.
- **Lo que hay hoy en la Meta Model API (verificado con fuentes, ver `packages/research/src/meta.js`):**
  Muse Wonder 1.0 (el más capaz, siempre razona, $4/$20), Muse Spark 1.1–1.3 ($1.25/$4.25, ve imágenes,
  video y PDF, esfuerzo minimal–xhigh), tiers `-contributor` (más baratos; Meta puede entrenar con los datos),
  Muse Glimmer y Muse Spark Open (pesos abiertos), Muse Voice Transcribe 1.0 (voz a texto). No hay texto a voz.
  Muse Image y SAM 3.1 aparecen en la página de Meta, sin id confirmado para la API.
- **Decisión:** catálogo compartido `META_MODELS` (app, API y landing). En la app se elige la familia y se usa
  el id más nuevo que la llave tenga; el radar acepta `effort` y no lo manda a modelos sin niveles (Wonder).
  Cada cuarto del edificio tiene una cápsula con una copia dormida que despierta, actúa el ejercicio en la
  exhibición principal y vuelve a dormir (también por inactividad). Primera persona: A/D ya no están
  invertidas, arrastrar funciona como Street View y un clic camina hasta lo que se toca. El laboratorio se
  ajusta al alto de la pantalla y tiene botón de pantalla completa.

## ADR-023 — El arnés (guardarraíles) y la familia completa de Meta en la landing
- **Contexto (3 nov 2026):** Alan pidió una sección de arnés: validar las pruebas, que el agente no se salga
  del camino, no gaste de más, no tome decisiones riesgosas y que lo crítico pase por una persona. También
  corrigió que la Meta Model API ofrece cinco familias (Muse Wonder, Muse Spark, Muse Image, Muse Voice
  Transcribe, SAM 3.1) más modelos de pesos abiertos (Muse Glimmer, Muse Spark Open); el hackathon cierra el
  4 nov 2026 a las 9:00 p. m. ET.
- **Decisión:**
  - Landing: sección "El arnés" con cinco controles y una demo ("Intenta saltarte el arnés"). Se marca qué
    ya funciona en la app (presupuesto, aprobación humana, registro) y qué es diseño del protocolo.
  - App y API (migración `0006`): presupuesto mensual por usuario (`app.user_limits`, $5 por defecto);
    antes de cada corrida se calcula el peor caso con los precios del catálogo y, si se pasa, no se llama a
    Meta. Cada llamada queda en `app.harness_runs` (append-only por trigger) con tokens reales y costo.
    Las ideas "experimentar" del radar esperan la decisión de la persona (`decision`, `decided_at`).
  - Landing de Meta: las siete piezas con su papel (planifica, ejecuta, crea imágenes, escucha, ubica
    objetos, corre en tu equipo), iconos SVG (sin emojis) y la imagen fija que sigue el scroll.

## ADR-024 — El agente se mejora a sí mismo de verdad, dentro de la app
- **Contexto (3 nov 2026):** Alan pidió que, con la sesión iniciada, el agente haga de verdad lo que promete
  la landing: investigar, evaluar, modificar su propio código e integrar otras familias de Meta. Hay $150 USD
  de créditos de Meta para pruebas.
- **Decisión:**
  - **Banco real y autocalificado:** `scripts/evalset.ts` genera `api/_data/evalset.js` a partir de cuatro
    escenarios sintéticos (manufactura, devoluciones, mensajes, envíos), con sets de práctica, validación y
    examen sellado (perfil reservado). Las respuestas viven solo en el servidor; `pnpm datasets:verify`
    comprueba que el archivo esté al día.
  - **Ciclo de mejora** (`/api/agent`, un paso = una llamada al modelo, para caber en una función serverless):
    examen inicial con las skills activas → el planificador (Muse Wonder por defecto) lee los errores de
    práctica con la respuesta correcta y escribe una skill con alcance de un contexto → examen de validación
    con la candidata → el arnés compara: debe mejorar su contexto (≥ 2 casos) sin empeorar otro (> 1 caso de
    ruido). Si no pasa, se rechaza sola; si pasa, espera la aprobación de la persona.
  - **"Modificar su propio código"** significa reescribir sus skills: versiones congeladas por trigger
    (`app.agent_skills`, migración `0007`), solo se agregan versiones nuevas y se mueve su estado
    (candidata → activa/rechazada, activa → retirada). No toca el código de la app ni los pesos del modelo.
  - **Investigar:** las ideas del radar que la persona aprobó llegan al planificador como pistas.
  - **Otras familias:** Wonder planifica, Spark ejecuta (cualquier id que tenga la llave, con esfuerzo),
    Muse Voice Transcribe convierte tu voz en guía para el planificador y Muse Image dibuja un emblema por
    skill (`/api/media`). Voz e imagen son experimentales: si la llave no tiene acceso, el error lo dice.
  - Todo pasa por el arnés existente: peor caso contra el presupuesto antes de llamar y registro append-only.
  - Costo estimado por ciclo con Spark + Wonder: unos centavos de dólar; los $150 alcanzan para miles.

## ADR-025 — Acceso y registro con el botón oficial de Google, verificado por Supabase
- **Contexto (3 nov 2026):** Alan pidió dejar listo el login (y el registro) con Google, validado por
  Supabase Auth y la API de Google.
- **Decisión:**
  - La app carga Google Identity Services y dibuja el botón oficial de Google ("Continuar con Google" o
    "Registrarse con Google"). Google devuelve un ID token firmado; la app lo entrega a Supabase con
    `signInWithIdToken` y un nonce (Google recibe su SHA-256). Supabase verifica la firma con las llaves de
    Google, que la audiencia sea nuestro Client ID y el nonce, y crea la cuenta la primera vez.
  - En los previews de Vercel (hosts que cambian y no se pueden registrar como orígenes en Google Cloud) y si
    falta `GOOGLE_CLIENT_ID` o el script de Google no carga, se usa el flujo con redirección de Supabase.
  - `/api/config` y `pnpm auth:check` comprueban contra los servicios reales, sin secretos, que Google esté
    activado en Supabase y que su Client ID sea el mismo que usa el botón (si no, Supabase rechazaría el
    token con "Unacceptable audience").
  - El servidor sigue validando cada petición con Supabase (`/auth/v1/user`); nada cambia en la API.

## ADR-026 — Cada agente reescribe su propio código, con la llave de Meta de su usuario
- **Contexto (3 nov 2026):** Alan pidió que el agente no se limite a skills de texto: que modifique su código,
  investigue y se adopte solo lo que mejora, con modelos de Meta en cada paso (objetivo del hackathon, que cierra el
  4 nov). Y que **cualquier persona** pueda configurar su agente con la llave de Meta que ya guarda en la app.
- **Decisión:**
  - **El cuerpo:** `packages/agent-core` (`solve(task, tools)`) es el ejecutor de la app. Cada usuario tiene su
    propia línea de versiones de ese paquete en `app.agent_cores` (migración `0008`; el código de una versión no se
    puede reescribir); quien no tiene ninguna corre el de la plataforma (v0). El núcleo no tiene red, archivos ni
    secretos: llega al modelo solo por `tools.model`, con function calling de Meta y límite de llamadas. El
    calificador y las respuestas se quedan en el anfitrión.
  - **Aislamiento en la app:** el núcleo propio de un usuario corre en un proceso hijo de Node con el permission
    model (`api/_lib/sandbox.js`): solo puede leer su carpeta, sin variables de entorno, sin procesos hijos; su única
    salida es pedirle al padre una llamada al modelo. Así un núcleo no puede tocar las llaves de otros usuarios.
  - **Quién hace qué:** Muse Wonder propone la hipótesis (`/api/evolve`, con la llave y el arnés del usuario); el
    workflow `evolve.yml` la construye con Muse Code (`muse exec`), o con Forja (Muse + function calling) como
    respaldo; Muse Spark presenta los exámenes. CI pide la llave del usuario una sola vez a `/api/evolve-ci` con el
    token de un solo uso de esa corrida y `EVOLVE_CI_SECRET`; el gasto se registra en el arnés del usuario.
  - **El juez:** en la misma corrida, un examen nuevo (semilla aleatoria, perfil held-out) para el núcleo actual del
    usuario y el nuevo, cada uno en el sandbox. El servidor vuelve a revisar el código y el veredicto: si sube al
    menos 2 aciertos o el 2% y ningún escenario baja, la versión nueva queda activa para ese usuario. Puede regresar
    a cualquier versión que haya pasado, o al núcleo de la plataforma.
  - **El núcleo de la plataforma** (v0) cambia por PR; `agent-gate.yml` lo examina igual y lo fusiona una persona.
  - El constructor trabaja en un taller con solo el núcleo y la práctica, como un usuario del runner sin permisos.
  - Se descartó: una llave del proyecto para todos (cada quien paga y controla lo suyo), un PR por cada cambio de
    cada usuario (no escala y mezclaría agentes), y Vercel Sandbox + Workflow para construir (Actions ya trae
    terminal y deja al juez fuera del alcance del agente).
  - Detalle, configuración y riesgos: `docs/EVOLVE.md`.

## ADR-027 — Agentztein acompaña, decide su ciclo con tope de gasto, se ve trabajar y se le puede hablar
- **Contexto (4 nov 2026):** Alan notó que la app abrumaba (muchos recuadros y texto) y pidió que Agentztein esté más
  presente y sea didáctico para gente no técnica; que pueda elegir solo qué modelos y herramientas de Muse usar
  (y proponer otras, como visión); ver su "cerebro" como grafo conectándose, con las herramientas que usa; topes de
  gasto por corrida; ver en 3D cómo va al cuarto donde trabaja; entrar al laboratorio de la landing con sesión; y
  hablarle en vivo.
- **Decisión:**
  - **Compañero:** Agentztein vive en una esquina de todas las pestañas: explica cada pantalla una vez por visita,
    narra cada paso de un ciclo y se abre para platicar. `/api/talk` contesta en primera persona, corto y sencillo,
    con el estado del laboratorio como contexto y el modelo diario de la llave (Spark), por el mismo arnés. Puede
    sugerir una acción (iniciar un ciclo autónomo o abrir una pestaña) que solo corre si la persona la confirma.
  - **En vivo:** voz de manos libres: escucha hasta el silencio, Muse Voice Transcribe pasa la voz a texto, contesta
    y el navegador lo lee en voz alta (`speechSynthesis`). Meta no ofrece hoy un modelo de voz de salida en esta API;
    ElevenLabs se descartó para texto libre porque lo pagaría quien despliega, no el usuario.
  - **Decide solo:** `op: "start", auto: true` añade una fase `plan`: Muse Wonder ve dónde falla más, qué familias
    tiene la llave, el costo aproximado de un ciclo con cada una y el tope, y elige escenario, ejecutor y esfuerzo.
    Puede proponer capacidades (visión, dibujo, voz, código, web, memoria): quedan como propuestas, no se encienden.
    El servidor revisa el plan (escenario real, familia de la llave, nunca la *contributor*, nunca sobre el tope).
  - **Tope por ciclo:** `maxCost` (0.05–20 USD, 0.50 por defecto); el arnés rechaza antes de llamar a Meta cualquier
    paso cuyo peor caso no quepa en lo que queda. El ciclo termina con `run-budget` y ninguna candidata queda esperando.
  - **Rastro:** cada ciclo guarda `state.trace` (herramienta o modelo, costo, tiempo, tokens). De ahí salen la
    narración, el grafo y el recorrido 3D.
  - **Corredor compartido:** el ciclo avanza desde un proveedor por encima de las pestañas, así sigue mientras la
    persona ve el grafo o el 3D.
  - **Cerebro:** grafo SVG que se construye en el orden real (escenarios, situaciones, cadenas de versiones, ideas del
    radar que las inspiraron, herramientas con su uso); se repite el último ciclo con la herramienta encendida.
  - **Lab 3D:** la landing acepta `?embed=lab` (solo el edificio) y mensajes `agz:goto`/`agz:say` del mismo origen.
    La app lo muestra y, con "Seguir a Agentztein", lo manda al cuarto de cada paso (exámenes en los cuartos,
    radar en el laboratorio científico, planificador en el taller central, arnés y decisión en la cuna). Con sesión,
    la landing cambia "Entrar" por "Mi laboratorio".
  - **Vista sencilla** por defecto en Inicio (su historia en sus palabras, tres números, tres puertas); "Todo el
    detalle" conserva el tablero completo. La pestaña de la llave pasa a llamarse "Ajustes"; el taller 2D se
    reemplazó por el Lab 3D.

## ADR-028 — Exámenes al estilo de los benchmarks, radar con cuatro fuentes y textos alineados
- **Contexto (4 nov 2026):** Alan pidió que las pruebas se relacionen con los benchmarks de evaluación de modelos
  (los mismos cuartos del laboratorio 3D), que el radar no dependa solo de Hacker News, que el logo se vea en todos
  lados y que la landing, el acceso y la app digan lo mismo y estén al día.
- **Decisión:**
  - **Cinco exámenes nuevos** en `packages/scenarios` (índices 5–9, el máximo del rango de semillas), uno por
    benchmark, calificados como él: `codigo` (SWE-bench Pro: FAIL_TO_PASS y PASS_TO_PASS), `terminal`
    (Terminal-Bench: las pruebas de la tarea, no el código de salida), `razonamiento` (ARC-AGI: cuadrícula exacta y
    dos intentos en concurso), `web` (BrowseComp: todas las pistas y fuente) e `investigacion` (MLE-bench: medallas
    de Kaggle según el tamaño de la competencia). Conservan el diseño de la pregunta de investigación: una regla
    oculta distinta por contexto (trampa) y un cambio R1→R2 que solo afecta a un contexto. Son sintéticos: se dice
    "al estilo de", nunca que son el benchmark.
  - `AGENT_SCENARIOS` (app, director, exámenes de `evolve`) pasa a esos cinco. Los cuatro escenarios de negocio
    siguen en el banco marcados `legacy` para que sus habilidades y ciclos se lean, pero no aceptan ciclos nuevos.
    Cada examen trae su `benchmark` y su `room`: el Lab 3D lleva al agente al cuarto de su benchmark.
  - **Radar:** `fetchResearch` lee Hacker News, arXiv (cs.AI/CL/LG, filtrado a agentes, benchmarks y
    razonamiento), Hugging Face Daily Papers y repositorios de GitHub con tema `llm` que suben; cada fuente puede
    fallar sola. Las notas guardan su `source`; los ids de las fuentes nuevas llevan prefijo (`arxiv:`, `hf:`,
    `gh:`) para no chocar con los de Hacker News. `/api/radar?live=1` sirve el feed público con caché de CDN.
  - **Marca:** el logo más grande en barras, en el hero, en el acceso, en la pantalla de carga y en el compañero;
    favicon e ícono a partir de la "a" del logotipo.
  - **Textos:** la landing deja de decir que solo lee Hacker News, actualiza "¿En qué vamos?" (cerebro conectado;
    ahora practica y se mejora en exámenes al estilo de los benchmarks; después, los benchmarks reales), marca como
    "Ya en la app" los controles que ya existen y cambia los ejemplos de conciliación bancaria por los nuevos
    exámenes. En español la app dice "habilidad", nunca "skill".

## ADR-029 — La voz que sí transcribe, voz elegible, un grafo por corrida y un camino guiado
- **Contexto (4 nov 2026):** al hablarle en voz alta, el compañero mostraba "Meta answered with an error (400)".
  Alan pidió además que el inicio no dé nada por hecho (se perdía entre botones y no sabía cuál era el siguiente
  paso), que las respuestas puedan leerse con la voz del navegador o con una API de voz que el cliente conecte, y
  un grafo por cada corrida al estilo del de `control` ("Lo que decidió el agente"), además del grafo del cerebro.
- **Causa del 400:** Muse Voice Transcribe recibe audio en `POST /v1/asr/transcribe`, solo WAV (PCM 16 bits, mono,
  16 o 24 kHz), en multipart con una parte JSON `request` (`model`, `audioEncoding: "WAV"`, `mode`,
  `languageBias`) y una parte `audio`; responde `transcript`. Enviábamos el WebM/Opus (o MP4) del navegador a la
  ruta estilo OpenAI `/audio/transcriptions`, que Meta no tiene.
- **Decisión:**
  - **Oído:** la app convierte toda grabación a WAV 16 kHz mono antes de subirla (`apps/app/src/wav.ts`, Web Audio
    + OfflineAudioContext). `api/_lib/voice.js` arma el multipart a mano, rechaza lo que no sea WAV (415) y, si Meta
    rechaza la forma (400), reintenta sin `languageBias` y luego sin `mode`; los errores dicen la razón de Meta y
    llevan un `reason` que la app traduce. Alternativa gratis: el reconocimiento de voz del navegador.
  - **Voz:** Meta no tiene modelo de voz (Muse escucha, no habla). La respuesta se lee con la voz del navegador
    (se elige cuál y la velocidad), con ElevenLabs y la llave del propio cliente (`provider = 'elevenlabs'` en
    `app.provider_keys`, cifrada como las demás; `POST /api/media?kind=speak`; se cobra en su cuenta de ElevenLabs,
    no en el presupuesto de Meta) o en silencio. Se pueden leer también las respuestas escritas y cada respuesta
    tiene "Escuchar". Las preferencias viven en el dispositivo.
  - **Grafo por corrida** (`RunGraph.tsx`, pestaña Agente, `#corrida`): red 3D en canvas armada solo con la traza y
    el estado del ciclo — inicio, una neurona por llamada al modelo (columna), las herramientas que pidió cada una
    (calificador, radar, biblioteca, arnés, tú) y lo que devolvió cada herramienta (calificación por situación,
    errores de práctica, la habilidad candidata), hasta el final. Crece en vivo; un ciclo terminado se repite en
    bucle. Medidor de costo contra el tope de la corrida, ámbar al 80% y rojo al pasarlo, con "Tope agotado · el
    código detuvo al agente". Vista Lista como alternativa accesible. Un selector de corridas permite ver cualquiera.
    El grafo del cerebro (pestaña Cerebro) se queda como la vista de todo lo aprendido.
  - **Camino guiado** (`Path.tsx`): una barra bajo el encabezado en todas las pestañas con el paso actual (qué es,
    para qué sirve y un solo botón para hacerlo) y la lista de pasos: conectar la llave, el presupuesto, la primera
    corrida, verla trabajar, decidir y platicar. Al terminar lo básico se puede ocultar y se recupera con "Guía".
    El menú pone primero lo esencial (Inicio, Agente, Ajustes) y separa lo de "Explorar"; los controles del Agente
    van numerados (quién elige, cuánto gastar, guía opcional).

## ADR-030 — Las fases en su orden real, un tablero con color, un lab a escala y la landing para el hackathon
- **Contexto (4 nov 2026):** Alan pidió acomodar las fases con todo lo que Agentztein ya hace, remarcar con color lo
  importante en el tablero, corregir el tamaño de los robots del laboratorio 3D (atravesaban las puertas), que
  camine más rápido, que el locutor no hable en cada cuarto y una auditoría del acomodo para el hackathon.
- **Decisión:**
  - **Fases (landing y tablero, mismos nombres y colores):** Decide (director, #6d5ce8) → Se mide (#0081fb) →
    Investiga (#ff6600) → Aprende (#f0533c) → Prueba con arnés (#16a394) → Tú decides (#22b864). Es el orden de la
    traza real. "Se mantiene al día" sale del anillo porque no corre todavía y pasa a "Y además", junto con
    "Cambia su propio código" y "Te escucha y te contesta" (ambos ya en la app). Nueva imagen `stepD.webp` y nueva
    escena del escritorio del director. El tablero marca el tope alcanzado ("llegó al tope"), la fase de decidir
    cuando la eligió la persona y el radar como opcional.
  - **Tablero:** bloque "Importante ahora" por urgencia (rojo: atorada, tope o presupuesto agotado; ámbar: una
    habilidad espera, presupuesto ≥ 80%; azul: corrida en curso; verde: habilidad nueva activa) con un botón para
    resolverlo. Cada tarjeta de números tiene su color; las que necesitan algo se pintan de ámbar o rojo.
  - **Lab 3D:** una sola escala para todos los robots (0.6: ~2.36 de alto, bajo los 2.6 de cada puerta; antes 0.85,
    0.7 y 0.62), ojos en primera persona a esa altura, piloto automático a 2.5 (antes 1.75) y correr a 3.8. El
    locutor narra un cuarto una sola vez y solo cuando una persona interactúa (toca una pieza o la puerta), nunca
    en el recorrido automático; las frases cortas siempre salen en la burbuja pero solo suenan si alguien está
    usando el lab.
  - **Landing:** Hero → Cómo funciona → Con Meta → Ya funciona, en la app (capturas reales con datos de ejemplo) →
    Laboratorio → Arnés → Avance. Detalle y recomendaciones pendientes en `docs/AUDITORIA-HACKATHON.md`.

## ADR-031 — Memoria en cuatro capas y sueños que consolidan lo aprendido
- **Contexto (4 nov 2026):** Alan preguntó cómo se controla la memoria y pidió que Agentztein pueda "soñar" para
  ahorrar contexto y razonamiento. Hasta ahora lo único que se recordaba entre ciclos eran las habilidades; la traza,
  los errores y los veredictos de cada ciclo se guardaban pero nadie los releía, así que el planificador podía
  repetir una hipótesis que el arnés ya había descartado, y el director veía solo el último resultado por examen.
- **Decisión:**
  - **Cuatro capas** (`api/_lib/memory.js`): *de trabajo* (lo que entra en un prompt), *episódica* (cada ciclo en
    `app.agent_jobs`, larga y nunca enviada completa), *lecciones* (`app.agent_memories`, nueva) y *procedimental*
    (habilidades y núcleo, que solo cambian con el arnés).
  - **Soñar** (`POST /api/agent { op: "dream" }`, o la fase `dream` al inicio de un ciclo autónomo cuando hay
    `DREAM_AFTER` = 3 ciclos terminados sin digerir): Muse Wonder, con esfuerzo medio, relee hasta 10 ciclos sin
    digerir, cada uno comprimido de forma determinista en una línea (`episodeLine`: examen, modelo, resultado,
    validación antes/después solo como conteos, la candidata recortada y hasta tres errores de práctica), y sus
    lecciones activas bajo alias cortos (`m1`, `c1` en vez de uuids). Contesta qué conservar, reescribir, agregar u
    olvidar. Es el patrón de *sleep-time compute*: el razonamiento caro se hace una vez fuera del ciclo y los ciclos
    siguientes leen el resultado.
  - **Reglas fijas al aplicar un sueño** (`consolidate`, pura y probada): conservar o reescribir sube la fuerza
    (0–5, empieza en 2); la que no se menciona ni se usó desde el último sueño baja un punto y a 0 se desvanece; se
    mantienen como máximo 40 activas (se desvanecen primero las más débiles); una lección repetida no se duplica.
    Reescribir no edita: la fila vieja queda `superseded` y nace otra con `parent_id`. Texto, alcance, tipo y
    evidencia quedan congelados por trigger y nada se borra (migración `0009`), igual que habilidades y núcleos.
  - **Lecciones con alcance y tipo:** alcance `global`, `<examen>` o `<examen>:<situación>`; tipo `rule` (patrón en
    los datos), `dead-end` (lo que no funcionó y por qué), `strategy` (modelo/esfuerzo que rinde) o `fact`. Máximo 240
    caracteres; se descarta la que nombra un registro concreto del banco (mismo patrón que las reglas del núcleo).
  - **Recordar con presupuesto** (`recall`): cada lector recibe un bloque cortado a su propio límite de caracteres:
    planificador 1200 (primero la situación con más errores, luego su examen, luego lo global; nunca otro examen),
    director 900 y charla 500. Cada uso marca `last_used_at`, así lo que se usa no se desvanece. La traza del ciclo
    registra la herramienta `memory` con cuántas lecciones entraron, para poder medir el efecto.
  - **El examen nunca ve la memoria:** el ejecutor solo recibe habilidades que pasaron el arnés. Las lecciones salen
    de errores de práctica (que el planificador ya veía) y de conteos de validación; nunca de respuestas de
    validación o del examen sellado. Así recordar no puede filtrar una respuesta a una calificación.
  - **Control humano:** en la pestaña Agente, "Memoria y sueños" muestra las lecciones por tipo, su alcance y fuerza,
    y los últimos sueños (qué cambió y cuánto costó). La persona puede soñar ahora (tope 0.25 USD por sueño), fijar
    una lección (ningún sueño la reescribe ni la desvanece) u olvidarla (`op: "memory"`, estado `forgotten`). La
    charla sabe lo que recuerda y puede sugerir soñar; solo corre si la persona confirma.
- **Alternativas descartadas:** búsqueda por embeddings (otra infraestructura y otro proveedor; con ≤40 lecciones
  cortas el orden por alcance y fuerza alcanza); resumir toda la traza en cada llamada (paga el mismo razonamiento
  cada vez); dejar que el sueño edite habilidades (saltaría el arnés).
- **Pendiente de medir:** si con memoria bajan los ciclos rechazados por el arnés y los tokens del planificador por
  habilidad aprobada. No hay números todavía; el registro está listo (`memory` en la traza, `app.agent_dreams`).

## ADR-032 — El proceso del agente como vista principal: TL;DR, decisiones resaltadas, qué apruebas y tipo de cambio
- **Contexto (4 nov 2026):** Alan corrió un ciclo autónomo y dijo que el proceso era confuso: la app le pedía aprobar
  sin decir *qué* aprobaba, lo que el agente decidió quedaba escondido entre barras y tarjetas, y no se veía cómo
  pensaba ni qué memoria usaba. Pidió una interfaz propia para el proceso, con un TL;DR y su aprobación, el
  pensamiento y las decisiones resaltados, sus neuronas y su memoria a la vista, y el Lab 3D como vista alternativa.
  También pidió una etiqueta que diga si un cambio es de código, una habilidad nueva o una herramienta nueva.
- **Decisión:**
  - **Pestaña "Proceso"** (antes "Lab 3D", mismo id `lab`, ahora entre las esenciales junto a Agente): vista por
    defecto *Proceso*, alternativa *Lab 3D* (`#lab3d` la abre directo). Iniciar un ciclo desde Agente, Inicio, la
    guía o la charla lleva aquí.
  - **TL;DR** (`summarize` en `apps/app/src/Process.tsx`): una frase de estado y una línea por lo que hizo, armadas
    solo con el estado del ciclo (sin llamadas extra al modelo, sin costo). Las líneas que son decisiones suyas
    (qué practicar y con qué modelo, qué habilidad escribir, el veredicto del arnés) llevan la marca "Decidió".
  - **"Lo que estás aprobando":** la tarjeta dice en palabras dónde se aplicará la habilidad (examen y situación), si
    reemplaza una versión anterior (que queda guardada) o es la primera, que no toca su código ni los modelos, la
    evidencia por situación antes/después con la regla del arnés, el texto palabra por palabra y por qué la escribió.
  - **Pensamiento paso a paso:** la traza agrupada (un examen en lotes es un paso), cada paso abrible con lo que usó:
    razonamiento y plan del director, lecciones que recordó, errores que estudió, calificaciones por situación y
    deltas del arnés. Las decisiones se resaltan y se abren solas; mientras corre, el paso siguiente aparece como
    "pensando ahora". Al lado, "Su mente en este ciclo": gasto contra el tope, modelos que llamó (sus neuronas),
    memoria y habilidades en juego; debajo, la red 3D de la corrida (`RunGraph`).
  - **Tipo de cambio** (`ChangeTag`): *Nueva habilidad* / *Mejora de habilidad* (texto que lee; la v1 de una situación
    o una versión nueva), *Cambio de código* (reescribe su núcleo, con juez; pestaña Su código) y *Nueva herramienta*
    (capacidad que pide el director; solo propuesta). Aparece en el TL;DR, la aprobación, la traza, la lista de
    habilidades, las corridas de Su código y en "Todos los cambios que ha propuesto".
  - **La traza guarda qué lecciones recordó** (`ids` en el paso `memory`, máx. 12), también cuando las recuerda el
    director, para poder mostrarlas; antes solo guardaba cuántas.
  - La pestaña Agente queda para configurar e iniciar: muestra el TL;DR compacto (solo decisiones y cambios) y la
    misma tarjeta de aprobación, con un enlace al proceso completo.
- **Alternativas descartadas:** pedir al modelo un resumen del ciclo (cuesta y puede inventar; el estado ya tiene
  todo); dejar el Lab 3D como vista principal (es bonito pero no dice qué decidió ni qué apruebas).

## ADR-033 — Lo que escribe el modelo en tu idioma, un radar que no truena y un Hero que dice qué es
- **Contexto (4 nov 2026):** Alan vio la app en inglés con el razonamiento del director, la habilidad y su porqué en
  español (el ciclo corrió en español). También pidió que el radar no falle, que sus cuatro fuentes se distingan por
  su logo en el Hero y un lema más fuerte que diga que es un *agente* de IA, no "una IA".
- **Decisión:**
  - **Traducción bajo demanda** (`POST /api/agent { op: "translate" }`, `api/_lib/translate.js`): lotes de hasta 24
    textos, con el modelo ligero de la llave de la persona y dentro del arnés (presupuesto y registro, `kind =
    'translate'`). El prompt conserva identificadores, valores de etiqueta, números y nombres de modelos. En la app,
    `mt(text)` (`apps/app/src/translate.tsx`) adivina el idioma del texto y solo pide lo que está claramente en el
    otro; guarda las traducciones en el navegador. La tarjeta de aprobación avisa que el agente usa la habilidad con
    sus palabras originales y muestra el original.
  - **Radar resistente, con sus cuatro fuentes** (`fetchResearch`): cada fuente tiene su propio tiempo (6.5 s), así una
    lenta no tumba a las demás; un error transitorio (429, 5xx, red) se reintenta una vez; si sigue fallando se usa su
    última respuesta buena de las últimas 6 h (`stale`); las búsquedas de Hacker News ya no caen todas si falla una;
    GitHub usa `GITHUB_TOKEN` o `AGENT_GH_TOKEN` si el servidor tiene uno. La evaluación con el modelo reintenta una
    vez si la respuesta no es JSON legible (solo si cabe en el presupuesto); `api/radar.js` sube a 120 s.
  - **Logos de las fuentes** (`packages/research/src/logos.js`, trazos de Simple Icons): Y Combinator (Hacker News),
    arXiv, Hugging Face y GitHub, iguales en el Hero, la landing y la app.
  - **Lema:** «El agente de IA que se mejora solo. Y lo demuestra.» / «The AI agent that improves itself. And proves
    it.»; el lead abre con «No es un modelo ni un chatbot». El glosario suma *Cambio de código* y *Nueva herramienta*.

## ADR-034 — Contar visitas en nuestra propia base de datos y ver hasta dónde llegan
- **Contexto (4 nov 2026):** Alan preguntó si se puede registrar a los visitantes para saber si el sitio tiene
  tráfico, guardarlo en la base de datos y ver hasta dónde llegan. No había ninguna medición: ni de la landing ni
  de la app.
- **Decisión:**
  - **Una tabla, un evento por fila** (`app.visit_events`, migración `0010`): `view`, `section` (sección de la
    landing alcanzada), `lab` (primer toque al laboratorio 3D), `cta` (clic a la app, con dónde estaba el botón),
    `leave` (milisegundos con la página en pantalla), `tab` (pestaña de la app), `signin` (vio la pantalla de
    entrada) y `signed_in`. Vive en el esquema `app`, que la Data API de Supabase no expone.
  - **Privacidad por diseño:** sin cookies, sin IP, sin huella. El navegador guarda un id aleatorio
    (`localStorage`) y una sesión que termina tras 30 minutos sin actividad. Del *referrer* solo se guarda el host;
    el país viene de `x-vercel-ip-country`; el dispositivo se reduce a celular/tablet/computadora. No se manda nada
    con Global Privacy Control, Do Not Track o `?notrack=1`.
  - **Ligar visita y cuenta sin confiar en el navegador:** solo `signed_in` lleva el token de Supabase y el
    servidor lo verifica antes de guardar `user_id`. Con eso, "guardó su llave" y "corrió el agente" salen de
    `app.provider_keys` y `app.agent_jobs`, no de lo que diga la página.
  - **Envío:** `navigator.sendBeacon` en lotes (cada 1.5 s o al ocultar la página), como `text/plain` para evitar
    *preflight*. La landing lo carga como script aparte (`visits.js`, ~3 KB) para que la visita cuente antes de que
    baje el laboratorio 3D. `/api/track` siempre responde 204 y nunca bloquea la página.
  - **Defensas:** se descartan user agents de bots, *crawlers*, vistas previas de enlaces y navegadores
    *headless*; un lote trae máximo 25 eventos y un visitante máximo 600 por día.
  - **Quién lo ve:** `GET /api/visits` solo para los correos de `ADMIN_EMAILS`. La pestaña **Tráfico** muestra
    visitantes, visitas, tiempo mediano en la landing, el embudo (de abrir la landing a correr el agente), visitantes
    por día, de dónde vienen, países, dispositivos, botones, pestañas, campañas utm y las últimas 30 visitas con
    "hasta dónde llegó". El navegador de un dueño deja de contarse al abrir la app.
- **Alternativas descartadas:** Vercel Analytics o Google Analytics (los datos no quedan en nuestra base y no se
  pueden cruzar con cuentas, llaves y ciclos; GA además pide aviso de cookies); guardar la IP (dato personal que no
  hace falta para contar).
- **Pendiente:** no hay retención automática; si la tabla crece, borrar lo viejo con
  `DELETE FROM app.visit_events WHERE created_at < now() - interval '13 months'`.
