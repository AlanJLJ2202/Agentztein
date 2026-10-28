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
- **Estado:** pendiente. Manifest a revisar: `dfff584334683dc5f34c80bbd1c7cc067711446b30c8fdfa45102a5531c9f3ff`.
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
