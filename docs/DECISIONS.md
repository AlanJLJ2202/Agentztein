# Decisiones (ADR)

Formato: contexto → opción elegida → alternativas → consecuencias.
Las marcadas **[pendiente de confirmar por Alan]** son defaults para las "decisiones abiertas" del anteproyecto.

---

## ADR-000 — Fuente de verdad sin el PDF del anteproyecto
- **Contexto:** el prompt maestro indica adjuntar `Anteproyecto_Evolucion_Verificable_de_Agentes.pdf`
  como especificación. En esta sesión solo se recibió el prompt (`PROMPT_agente_evolucion_verificable.md`);
  el PDF no está disponible.
- **Decisión:** el prompt maestro es la especificación provisional. Todo punto metodológico se toma de él.
  Cuando se reciba el PDF se revisará este archivo punto por punto y cualquier contradicción se anotará
  aquí (gana el PDF).
- **Consecuencias:** riesgo de divergencia en separación de conjuntos, reglas de promoción y
  definición de familias. E1 no depende de umbrales, así que el riesgo se concentra en E4–E8.
  **[pendiente de confirmar por Alan: enviar el PDF]**

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

## ADR-003 — Umbrales de promoción por defecto **[pendiente de confirmar por Alan]**
Se congelan en el pre-registro tras la calibración (E8). Defaults provisionales:
- Métrica primaria: éxito por lote completo (todas las filas correctas) dentro del scope, en validation.
- Mejora mínima: +10 puntos porcentuales y límite inferior del IC 95% bootstrap por casos > 0.
- Tolerancia de regresión por familia vigente: caída ≤ 5 pp en el punto estimado **y** límite inferior
  del IC 95% de la diferencia ≥ −10 pp. Se ajusta con la calibración antes de congelar; cualquier cambio
  posterior crea una versión nueva del pre-registro.
- Restricciones duras (booleanas): 0 violaciones de invariantes, validación estructural OK, permisos ⊆ herramientas.

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
