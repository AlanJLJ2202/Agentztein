# Revisión de la verdad de referencia

> Generado por `pnpm datasets:review` (scenarios@1). No editar a mano.
> Muestra lotes del split **adaptation**; el split de prueba sellado no se lee.

**¿Qué es esto?** Las "respuestas correctas" de cada escenario las calcula un programa, no una persona ni
una IA. Antes de poner a trabajar a un agente, una persona debe revisar que esas respuestas tienen sentido
(anteproyecto §07). Si una respuesta se ve mal, el error está en el generador y hay que corregirlo antes de
medir nada.

**Estado:** pendiente de revisión por Alan (ADR-011). Al aprobar, anotar fecha y hash del manifest en
`docs/DECISIONS.md`.

**Cómo revisar:** en cada tabla, la última columna es la respuesta que el sistema considera correcta.
Compárala con la regla del contexto escrita arriba de la tabla. Los ids se muestran abreviados.

## 1. Conciliación de movimientos bancarios (Finanzas y contabilidad)

- **Tarea:** Etiquetar cada movimiento como legítimo, duplicado de otro, reembolso de otro o parte de una transferencia entre cuentas propias.
- **Banco A:** Trae un folio único por operación: dos filas con el mismo folio son la misma operación.
- **Banco B:** No trae folio. Dos cafés iguales el mismo día son compras distintas; solo la hora en la descripción distingue un duplicado real.
- **Cambio R1 → R2:** El Banco B cambia su formato: los importes llegan siempre en positivo y un campo nuevo indica si es cargo o abono. Las reglas que leían el signo dejan de servir solo ahí.

#### Banco A · reglas R1 — `conciliacion/adaptation/stable/000`

| id | vendor | schemaVersion | date | amount | currency | description | vendor_txn_id | ref | respuesta correcta |
|---|---|---|---|---|---|---|---|---|---|
| a37ee4 | vendorA | A@1 | 2025-03-24 | -735.9 | MXN | CAFE LUNA | A1FA3D9224E |  | **legitimate** |
| a2484f | vendorA | A@1 | 2025-03-24 | 1000 | MXN | TRANSFER FROM OWN ACCT ****4646 | A4668B4C29D | TRF-721521 | **transfer_pair (b56ed6)** |
| cc004b | vendorA | A@1 | 2025-03-24 | -196 | MXN | SUPER LA ESTRELLA | ABD57FB9F9B |  | **legitimate** |
| db7c3b | vendorA | A@1 | 2025-03-24 | -1252.9 | MXN | OXXO CENTRO | AEAC0AB4CBE |  | **legitimate** |
| b56ed6 | vendorA | A@1 | 2025-03-24 | -1000 | MXN | TRANSFER TO OWN ACCT ****5926 | A97E757536E | TRF-721521 | **transfer_pair (a2484f)** |
| 283c03 | vendorA | A@1 | 2025-03-24 | -818.5 | MXN | TAQUERIA EL GUERO | A975436DCB7 |  | **legitimate** |
| 63abcd | vendorA | A@1 | 2025-03-25 | -1173 | MXN | GASOLINERA PEMEX NORTE | A21F4730A9C |  | **legitimate** |
| e42972 | vendorA | A@1 | 2025-03-26 | 1252.9 | MXN | REFUND OXXO CENTRO | AC7D1164DC4 |  | **refund_of (db7c3b)** |
| 580375 | vendorA | A@1 | 2025-03-27 | -740.5 | MXN | LIBRERIA CENTRAL | AF471421279 |  | **legitimate** |
| 719371 | vendorA | A@1 | 2025-03-27 | -129 | MXN | TAQUERIA EL GUERO | A8AEF766C70 |  | **legitimate** |
| 3d3470 | vendorA | A@1 | 2025-03-28 | -119.9 | MXN | LIBRERIA CENTRAL | AC823AC6FFC |  | **legitimate** |
| ead4c1 | vendorA | A@1 | 2025-03-28 | -416 | MXN | CINEPOLIS PLAZA | A0F8DCD1D93 |  | **legitimate** |

_…y 3 filas más en el lote._

#### Banco B · reglas R1 — `conciliacion/adaptation/interleaved/001`

| id | vendor | schemaVersion | date | amount | currency | description | ref | respuesta correcta |
|---|---|---|---|---|---|---|---|---|
| 8ad555 | vendorB | B@1 | 2025-01-04 | -1103.9 | MXN | OXXO CENTRO 21:46 |  | **legitimate** |
| 6217d4 | vendorB | B@1 | 2025-01-05 | -1135.9 | MXN | CAFE LUNA 14:43 |  | **legitimate** |
| e1d557 | vendorB | B@1 | 2025-01-05 | -23.5 | MXN | CINEPOLIS PLAZA 18:15 |  | **legitimate** |
| 536493 | vendorB | B@1 | 2025-01-06 | -656.9 | MXN | GASOLINERA PEMEX NORTE 08:59 |  | **legitimate** |
| 1e511e | vendorB | B@1 | 2025-01-06 | -475.5 | MXN | CINEPOLIS PLAZA 14:58 |  | **legitimate** |
| 5d7d7d | vendorB | B@1 | 2025-01-07 | -1401 | MXN | FARMACIA SOL 08:15 |  | **legitimate** |
| 815e0c | vendorB | B@1 | 2025-01-07 | -1401 | MXN | FARMACIA SOL 21:52 |  | **legitimate** |
| f29515 | vendorB | B@1 | 2025-01-08 | -4500 | MXN | TRANSFER TO OWN ACCT ****7442 10:03 | TRF-306307 | **transfer_pair (9a609b)** |
| 9a609b | vendorB | B@1 | 2025-01-08 | 4500 | MXN | TRANSFER FROM OWN ACCT ****6577 10:03 | TRF-306307 | **transfer_pair (f29515)** |
| 1e279c | vendorB | B@1 | 2025-01-09 | -248 | MXN | CAFE LUNA 19:41 |  | **legitimate** |
| 686b5e | vendorB | B@1 | 2025-01-09 | -1494 | MXN | SUPER LA ESTRELLA 09:56 |  | **legitimate** |
| 01309b | vendorB | B@1 | 2025-01-10 | -85 | MXN | GASOLINERA PEMEX NORTE 16:34 |  | **legitimate** |

_…y 3 filas más en el lote._

#### Banco B · reglas R2 — `conciliacion/adaptation/temporal_shift/011`

| id | vendor | schemaVersion | date | amount | currency | description | direction | respuesta correcta |
|---|---|---|---|---|---|---|---|---|
| 5f417f | vendorB | B@2 | 2025-06-08 | 897 | MXN | CAFE LUNA 13:27 | debit | **legitimate** |
| 66a71f | vendorB | B@2 | 2025-06-08 | 450.5 | MXN | CINEPOLIS PLAZA 11:25 | debit | **legitimate** |
| 4de05d | vendorB | B@2 | 2025-06-08 | 450.5 | MXN | CINEPOLIS PLAZA 11:25 | debit | **duplicate_of (66a71f)** |
| 5de45a | vendorB | B@2 | 2025-06-08 | 897 | MXN | CAFE LUNA 19:48 | debit | **legitimate** |
| ef7cda | vendorB | B@2 | 2025-06-09 | 1430 | MXN | CAFE LUNA 18:18 | debit | **legitimate** |
| eed6b3 | vendorB | B@2 | 2025-06-09 | 1430 | MXN | CAFE LUNA 18:18 | debit | **duplicate_of (ef7cda)** |
| a91d06 | vendorB | B@2 | 2025-06-09 | 1216 | MXN | GASOLINERA PEMEX NORTE 20:04 | debit | **legitimate** |
| 071f4f | vendorB | B@2 | 2025-06-12 | 1006.9 | MXN | TAQUERIA EL GUERO 14:44 | debit | **legitimate** |
| d6426a | vendorB | B@2 | 2025-06-12 | 1216 | MXN | REFUND GASOLINERA PEMEX NORTE 19:00 | credit | **refund_of (a91d06)** |
| 889875 | vendorB | B@2 | 2025-06-12 | 455.9 | MXN | GASOLINERA PEMEX NORTE 08:28 | debit | **legitimate** |
| 4bf6fc | vendorB | B@2 | 2025-06-12 | 455.9 | MXN | GASOLINERA PEMEX NORTE 16:54 | debit | **legitimate** |
| cb1f80 | vendorB | B@2 | 2025-06-13 | 1118 | MXN | CINEPOLIS PLAZA 09:33 | debit | **legitimate** |

_…y 2 filas más en el lote._

## 2. Inspección de calidad de piezas (Manufactura automotriz y aeroespacial)

- **Tarea:** Aceptar o rechazar cada pieza comparando la medida contra la medida nominal y la tolerancia del cliente.
- **Línea 1 · cliente automotriz nacional:** Tolerancia de ±0.50 mm.
- **Línea 2 · cliente aeroespacial de exportación:** Tolerancia de ±0.10 mm.
- **Cambio R1 → R2:** El cliente de exportación pide los reportes en micras en vez de milímetros. Una regla que asume milímetros rechaza piezas buenas, solo en la Línea 2.

#### Línea 1 · cliente automotriz nacional · reglas R1 — `manufactura/adaptation/stable/000`

| id | pieza | especificacion | turno | nominal | medida | unidad | respuesta correcta |
|---|---|---|---|---|---|---|---|
| 379322 | BSH-0330 | AUTO-NAC-07 | vespertino | 40 | 41.043 | mm | **rechazar** |
| 84f94a | PIN-0772 | AUTO-NAC-07 | nocturno | 8.5 | 7.571 | mm | **rechazar** |
| b21114 | SHF-1180 | AUTO-NAC-07 | nocturno | 25.4 | 25.538 | mm | **aceptar** |
| 221384 | BRK-2041 | AUTO-NAC-07 | vespertino | 12 | 11.943 | mm | **aceptar** |
| e76d64 | PIN-0772 | AUTO-NAC-07 | nocturno | 8.5 | 7.723 | mm | **rechazar** |
| 444180 | PIN-0772 | AUTO-NAC-07 | vespertino | 8.5 | 8.934 | mm | **aceptar** |
| f8ad4d | PIN-0772 | AUTO-NAC-07 | vespertino | 8.5 | 8.162 | mm | **aceptar** |
| fc629c | BSH-0330 | AUTO-NAC-07 | vespertino | 40 | 39.701 | mm | **aceptar** |
| a32fee | BRK-2041 | AUTO-NAC-07 | nocturno | 12 | 12.167 | mm | **aceptar** |
| 3797ec | PIN-0772 | AUTO-NAC-07 | vespertino | 8.5 | 8.687 | mm | **aceptar** |
| e3300b | BRK-2041 | AUTO-NAC-07 | nocturno | 12 | 11.895 | mm | **aceptar** |
| 4e2826 | SHF-1180 | AUTO-NAC-07 | vespertino | 25.4 | 25.496 | mm | **aceptar** |

_…y 1 filas más en el lote._

#### Línea 2 · cliente aeroespacial de exportación · reglas R1 — `manufactura/adaptation/interleaved/001`

| id | pieza | especificacion | turno | nominal | medida | unidad | respuesta correcta |
|---|---|---|---|---|---|---|---|
| 4a3be6 | BRK-2041 | AERO-EXP-12 | vespertino | 12 | 12.075 | mm | **aceptar** |
| 54f046 | BSH-0330 | AERO-EXP-12 | vespertino | 40 | 39.944 | mm | **aceptar** |
| f0de7a | SHF-1180 | AERO-EXP-12 | nocturno | 25.4 | 25.478 | mm | **aceptar** |
| ca6ef1 | BRK-2041 | AERO-EXP-12 | nocturno | 12 | 11.963 | mm | **aceptar** |
| e97f92 | PIN-0772 | AERO-EXP-12 | vespertino | 8.5 | 8.357 | mm | **rechazar** |
| d3a814 | PIN-0772 | AERO-EXP-12 | vespertino | 8.5 | 8.49 | mm | **aceptar** |
| fec511 | SHF-1180 | AERO-EXP-12 | matutino | 25.4 | 25.621 | mm | **rechazar** |
| ce1026 | SHF-1180 | AERO-EXP-12 | vespertino | 25.4 | 25.349 | mm | **aceptar** |
| ab6bbf | BSH-0330 | AERO-EXP-12 | matutino | 40 | 39.951 | mm | **aceptar** |
| 56a01a | BRK-2041 | AERO-EXP-12 | matutino | 12 | 11.343 | mm | **rechazar** |
| a415c6 | PIN-0772 | AERO-EXP-12 | vespertino | 8.5 | 8.466 | mm | **aceptar** |
| 843a57 | PIN-0772 | AERO-EXP-12 | vespertino | 8.5 | 8.445 | mm | **aceptar** |

_…y 1 filas más en el lote._

#### Línea 2 · cliente aeroespacial de exportación · reglas R2 — `manufactura/adaptation/temporal_shift/011`

| id | pieza | especificacion | turno | nominal | medida | unidad | respuesta correcta |
|---|---|---|---|---|---|---|---|
| 92692a | BSH-0330 | AERO-EXP-12 | matutino | 40000 | 40945 | um | **rechazar** |
| 00ec0c | PIN-0772 | AERO-EXP-12 | nocturno | 8500 | 9131 | um | **rechazar** |
| 0d40fb | SHF-1180 | AERO-EXP-12 | vespertino | 25400 | 24703 | um | **rechazar** |
| 24b428 | BRK-2041 | AERO-EXP-12 | vespertino | 12000 | 11951 | um | **aceptar** |
| 6d4c55 | BSH-0330 | AERO-EXP-12 | matutino | 40000 | 39433 | um | **rechazar** |
| 366752 | BRK-2041 | AERO-EXP-12 | nocturno | 12000 | 11986 | um | **aceptar** |
| 39e0b2 | SHF-1180 | AERO-EXP-12 | matutino | 25400 | 25344 | um | **aceptar** |
| 9d02d7 | BRK-2041 | AERO-EXP-12 | nocturno | 12000 | 11967 | um | **aceptar** |
| 593883 | BRK-2041 | AERO-EXP-12 | vespertino | 12000 | 12036 | um | **aceptar** |
| cc56c0 | SHF-1180 | AERO-EXP-12 | nocturno | 25400 | 25359 | um | **aceptar** |
| 62c6c2 | PIN-0772 | AERO-EXP-12 | vespertino | 8500 | 8325 | um | **rechazar** |
| 9ee7fb | SHF-1180 | AERO-EXP-12 | vespertino | 25400 | 25473 | um | **aceptar** |

_…y 2 filas más en el lote._

## 3. Solicitudes de devolución (Comercio minorista y e-commerce)

- **Tarea:** Aprobar o rechazar cada solicitud según la política del canal por el que se vendió.
- **Tienda en línea propia:** 30 días contados desde la fecha de compra.
- **Marketplace:** 30 días contados desde la fecha de entrega.
- **Cambio R1 → R2:** El marketplace reduce a 15 días (desde la entrega) la ventana para electrónica. Lo aprendido para la tienda propia sigue siendo válido.

#### Tienda en línea propia · reglas R1 — `devoluciones/adaptation/stable/000`

| id | solicitud | categoria | motivo | fecha_compra | fecha_entrega | fecha_solicitud | respuesta correcta |
|---|---|---|---|---|---|---|---|
| ff3fd8 | DEV-77865 | hogar | cambio de opinión | 2025-07-23 | 2025-07-25 | 2025-08-06 | **aprobar** |
| f2b99e | DEV-63674 | ropa | cambio de opinión | 2025-08-10 | 2025-08-12 | 2025-08-16 | **aprobar** |
| 8286da | DEV-67889 | juguetes | talla incorrecta | 2025-07-23 | 2025-07-24 | 2025-09-08 | **rechazar** |
| b118c8 | DEV-51182 | ropa | cambio de opinión | 2025-07-30 | 2025-08-03 | 2025-08-12 | **aprobar** |
| 0051e9 | DEV-95177 | juguetes | cambio de opinión | 2025-08-02 | 2025-08-05 | 2025-08-13 | **aprobar** |
| 1626d9 | DEV-46236 | hogar | talla incorrecta | 2025-08-07 | 2025-08-08 | 2025-10-04 | **rechazar** |
| 540196 | DEV-58463 | ropa | no era lo que esperaba | 2025-07-23 | 2025-07-27 | 2025-08-11 | **aprobar** |
| 50db56 | DEV-31878 | electronica | cambio de opinión | 2025-08-05 | 2025-08-09 | 2025-09-28 | **rechazar** |
| be9bce | DEV-14334 | hogar | talla incorrecta | 2025-08-01 | 2025-08-02 | 2025-08-19 | **aprobar** |
| 21a63b | DEV-21383 | hogar | talla incorrecta | 2025-07-24 | 2025-07-27 | 2025-08-31 | **rechazar** |

#### Marketplace · reglas R1 — `devoluciones/adaptation/interleaved/001`

| id | solicitud | categoria | motivo | fecha_compra | fecha_entrega | fecha_solicitud | respuesta correcta |
|---|---|---|---|---|---|---|---|
| 284899 | DEV-68389 | ropa | cambio de opinión | 2025-04-05 | 2025-04-15 | 2025-05-07 | **aprobar** |
| cdeb9e | DEV-33861 | hogar | no era lo que esperaba | 2025-04-08 | 2025-04-14 | 2025-04-27 | **aprobar** |
| 51afc8 | DEV-53038 | juguetes | talla incorrecta | 2025-03-31 | 2025-04-03 | 2025-05-16 | **rechazar** |
| e9f4a0 | DEV-95282 | ropa | talla incorrecta | 2025-04-01 | 2025-04-06 | 2025-05-28 | **rechazar** |
| b3453d | DEV-24460 | electronica | talla incorrecta | 2025-03-29 | 2025-04-05 | 2025-04-28 | **aprobar** |
| 499121 | DEV-59377 | juguetes | cambio de opinión | 2025-03-29 | 2025-04-08 | 2025-04-30 | **aprobar** |
| eea329 | DEV-36904 | juguetes | no era lo que esperaba | 2025-04-11 | 2025-04-21 | 2025-06-08 | **rechazar** |
| c6560c | DEV-69554 | electronica | cambio de opinión | 2025-04-05 | 2025-04-11 | 2025-04-13 | **aprobar** |

#### Marketplace · reglas R2 — `devoluciones/adaptation/temporal_shift/011`

| id | solicitud | categoria | motivo | fecha_compra | fecha_entrega | fecha_solicitud | respuesta correcta |
|---|---|---|---|---|---|---|---|
| e75e34 | DEV-65690 | electronica | no era lo que esperaba | 2025-04-16 | 2025-04-25 | 2025-05-30 | **rechazar** |
| 24c2fa | DEV-25671 | ropa | cambio de opinión | 2025-04-29 | 2025-05-08 | 2025-06-04 | **aprobar** |
| 1f4d9d | DEV-50552 | electronica | no era lo que esperaba | 2025-04-19 | 2025-04-26 | 2025-05-13 | **rechazar** |
| 7e4816 | DEV-37483 | ropa | no era lo que esperaba | 2025-04-28 | 2025-05-07 | 2025-05-14 | **aprobar** |
| 08f113 | DEV-15631 | electronica | cambio de opinión | 2025-04-19 | 2025-04-28 | 2025-06-05 | **rechazar** |
| 5b7eb0 | DEV-91077 | electronica | no era lo que esperaba | 2025-04-16 | 2025-04-21 | 2025-04-30 | **aprobar** |
| a54a6d | DEV-90224 | electronica | no era lo que esperaba | 2025-05-02 | 2025-05-07 | 2025-05-10 | **aprobar** |
| 972725 | DEV-56607 | ropa | cambio de opinión | 2025-04-25 | 2025-04-30 | 2025-05-02 | **aprobar** |

## 4. Clasificar mensajes de clientes (Atención a clientes y redes sociales)

- **Tarea:** Asignar cada mensaje a catálogo, ventas, soporte o logística según el canal y lo que pide el cliente.
- **Instagram · consumidores:** Precio → catálogo automático; garantía → soporte; pedido → logística.
- **WhatsApp · distribuidores:** Precio → asesor de ventas (cotización de mayoreo); garantía → soporte; pedido → logística.
- **Cambio R1 → R2:** La empresa decide que las garantías de distribuidores las atienda su ejecutivo de ventas. Lo de Instagram no cambia.

#### Instagram · consumidores · reglas R1 — `mensajes/adaptation/stable/000`

| id | mensaje | cliente | hora | texto | respuesta correcta |
|---|---|---|---|---|---|
| 10320e | MSG-1A414D | @usuario_529 | 13:33 | Tengo un defecto en mi llanta 90/90-18, ¿aplica la garantía? | **soporte** |
| 603868 | MSG-DCE8B8 | @usuario_819 | 12:32 | ¿Me das la guía del pedido PED-33363? | **logistica** |
| 280cd4 | MSG-35E2F0 | @usuario_671 | 12:54 | Hola, ¿cómo hago válida la garantía de la chamarra con protecciones? | **soporte** |
| 620061 | MSG-A88BF6 | @usuario_367 | 15:36 | Hola, ¿me pasas el precio del casco abatible? | **catalogo** |
| 42160f | MSG-5E0ED2 | @usuario_323 | 14:48 | Hola, ¿me pasas el precio del casco abatible? | **catalogo** |
| 33f9bf | MSG-333E7B | @usuario_820 | 13:59 | Quiero saber el precio de la chamarra con protecciones | **catalogo** |
| 57fadf | MSG-A9FF3B | @usuario_578 | 21:46 | Quiero saber el precio del casco abatible | **catalogo** |
| dc9a6b | MSG-2CF068 | @usuario_262 | 19:15 | Quiero saber el precio de los guantes de piel | **catalogo** |
| f68299 | MSG-779D17 | @usuario_539 | 10:37 | ¿Cuándo llega mi pedido PED-46042? | **logistica** |

#### WhatsApp · distribuidores · reglas R1 — `mensajes/adaptation/interleaved/001`

| id | mensaje | cliente | hora | texto | respuesta correcta |
|---|---|---|---|---|---|
| 6b3f6c | MSG-0F5EA4 | Distribuidora del Bajío | 13:49 | Quiero hacer válida la garantía de mi chamarra con protecciones | **soporte** |
| 7020ae | MSG-A9D932 | Distribuidora Norte | 19:42 | Hola, ¿cómo hago válida la garantía de los guantes de piel? | **soporte** |
| 99ecd6 | MSG-C85561 | Distribuidora del Bajío | 21:22 | Precio de los guantes de piel, porfa | **ventas** |
| 40021d | MSG-36A469 | Distribuidora Norte | 20:53 | Hola, ¿cómo hago válida la garantía de la llanta 90/90-18? | **soporte** |
| d690de | MSG-FACE3B | Distribuidora Occidente | 16:18 | Tengo un defecto en mi chamarra con protecciones, ¿aplica la garantía? | **soporte** |
| dc3d3b | MSG-6EB1E4 | Distribuidora Occidente | 10:29 | Precio de la llanta 90/90-18, porfa | **ventas** |
| 497371 | MSG-477760 | Distribuidora Occidente | 19:28 | ¿Cuándo llega mi pedido PED-80663? | **logistica** |
| 2aafce | MSG-E56BA8 | Distribuidora del Bajío | 21:30 | ¿Me das la guía del pedido PED-51012? | **logistica** |
| 0d080e | MSG-4A2C89 | Distribuidora Occidente | 18:49 | ¿Cuándo llega mi pedido PED-77405? | **logistica** |
| 18dea4 | MSG-9EB5AF | Distribuidora del Bajío | 10:28 | Hola, ¿me pasas el precio de la mica para casco? | **ventas** |
| 89866b | MSG-6C6747 | Distribuidora Centro | 17:39 | No me ha llegado el pedido PED-59544 | **logistica** |

#### WhatsApp · distribuidores · reglas R2 — `mensajes/adaptation/temporal_shift/011`

| id | mensaje | cliente | hora | texto | respuesta correcta |
|---|---|---|---|---|---|
| 718de7 | MSG-5C0F37 | Distribuidora del Bajío | 14:47 | Quiero hacer válida la garantía de mi casco abatible | **ventas** |
| 63b037 | MSG-756963 | Distribuidora Norte | 18:15 | ¿Cuándo llega mi pedido PED-45920? | **logistica** |
| 0d2185 | MSG-26D4C6 | Distribuidora del Bajío | 09:47 | Quiero hacer válida la garantía de mi casco abatible | **ventas** |
| 7c431b | MSG-56F875 | Distribuidora del Bajío | 19:37 | ¿Me das la guía del pedido PED-98395? | **logistica** |
| 1b5ee2 | MSG-57E7DE | Distribuidora Centro | 09:41 | Quiero hacer válida la garantía de mis guantes de piel | **ventas** |
| 9b55c1 | MSG-7DC841 | Distribuidora Centro | 11:11 | Tengo un defecto en mi llanta 90/90-18, ¿aplica la garantía? | **ventas** |
| b4f647 | MSG-3EC779 | Distribuidora Norte | 21:41 | Precio de la llanta 90/90-18, porfa | **ventas** |
| 3d87a4 | MSG-125148 | Distribuidora Norte | 16:42 | Quiero hacer válida la garantía de mi chamarra con protecciones | **ventas** |
| 776ae6 | MSG-A28E62 | Distribuidora Centro | 09:22 | Hola, ¿me pasas el precio de los guantes de piel? | **ventas** |

## 5. Cotizar envíos con dos paqueterías (Logística y paquetería)

- **Tarea:** Asignar a cada paquete su tarifa: T1 (hasta 1 kg), T2 (hasta 5 kg), T3 (hasta 20 kg) o T4 (más de 20 kg).
- **Paquetería Express Norte:** Cobra por el peso real.
- **Paquetería Ruta Sur:** Cobra por el mayor entre el peso real y el volumétrico (largo × ancho × alto ÷ 5000).
- **Cambio R1 → R2:** Ruta Sur cambia su divisor volumétrico de 5000 a 4000: los mismos paquetes pesan más para cobrarse. Express Norte no cambia.

#### Paquetería Express Norte · reglas R1 — `envios/adaptation/stable/000`

| id | guia | contenido | destino | peso_kg | largo_cm | ancho_cm | alto_cm | respuesta correcta |
|---|---|---|---|---|---|---|---|---|
| 075039 | GU-840592 | ropa | León | 8.91 | 22 | 30 | 54 | **T3** |
| 6595ed | GU-670946 | ropa | Aguascalientes | 4.08 | 42 | 66 | 12 | **T2** |
| 992635 | GU-841707 | documentos | Querétaro | 0.93 | 68 | 69 | 36 | **T1** |
| 98a139 | GU-407758 | ropa | Monterrey | 0.36 | 44 | 68 | 67 | **T1** |
| d6f623 | GU-547063 | ropa | Monterrey | 1.61 | 46 | 33 | 59 | **T2** |
| bb30e0 | GU-700339 | herramienta | Monterrey | 15.71 | 65 | 31 | 39 | **T3** |
| 2b133e | GU-798003 | documentos | León | 5.99 | 10 | 14 | 38 | **T3** |
| d74bd1 | GU-542103 | documentos | León | 1.34 | 70 | 68 | 50 | **T2** |
| 57e855 | GU-635086 | cojines | Aguascalientes | 1.12 | 63 | 42 | 60 | **T2** |
| 33c127 | GU-667830 | cojines | Querétaro | 11.41 | 66 | 29 | 31 | **T3** |
| 3e119e | GU-644643 | herramienta | CDMX | 9.01 | 10 | 33 | 20 | **T3** |

#### Paquetería Ruta Sur · reglas R1 — `envios/adaptation/interleaved/001`

| id | guia | contenido | destino | peso_kg | largo_cm | ancho_cm | alto_cm | respuesta correcta |
|---|---|---|---|---|---|---|---|---|
| 618a63 | GU-906360 | herramienta | Querétaro | 2.4 | 28 | 32 | 61 | **T3** |
| 597b28 | GU-451512 | refacciones | León | 9.27 | 60 | 36 | 13 | **T3** |
| 8ec29c | GU-285683 | refacciones | León | 0.82 | 20 | 13 | 17 | **T1** |
| 3ead50 | GU-244431 | cojines | Monterrey | 0.82 | 70 | 32 | 43 | **T3** |
| fd38b8 | GU-557987 | refacciones | Guadalajara | 10.96 | 10 | 70 | 58 | **T3** |
| 906d77 | GU-899752 | documentos | Guadalajara | 4.3 | 38 | 64 | 37 | **T3** |
| 60bbfd | GU-128984 | ropa | Querétaro | 1.41 | 26 | 61 | 29 | **T3** |
| c9cd59 | GU-652599 | herramienta | Querétaro | 0.55 | 21 | 19 | 70 | **T3** |
| 0a077f | GU-567023 | cojines | León | 1.47 | 68 | 28 | 21 | **T3** |
| 9eda35 | GU-396971 | cojines | Querétaro | 8.6 | 47 | 51 | 38 | **T3** |
| 6db4d6 | GU-254425 | cojines | Aguascalientes | 5.11 | 45 | 69 | 31 | **T3** |
| e979ea | GU-733332 | documentos | Querétaro | 20.33 | 26 | 44 | 11 | **T4** |

#### Paquetería Ruta Sur · reglas R2 — `envios/adaptation/temporal_shift/011`

| id | guia | contenido | destino | peso_kg | largo_cm | ancho_cm | alto_cm | respuesta correcta |
|---|---|---|---|---|---|---|---|---|
| 32fbcb | GU-125091 | ropa | Guadalajara | 0.78 | 20 | 36 | 29 | **T3** |
| 76db09 | GU-406963 | ropa | Monterrey | 0.77 | 26 | 67 | 45 | **T3** |
| 81888b | GU-734967 | herramienta | Guadalajara | 11.16 | 45 | 46 | 67 | **T4** |
| de078e | GU-418417 | ropa | CDMX | 2.45 | 57 | 43 | 30 | **T3** |
| b43aeb | GU-800225 | herramienta | CDMX | 4.21 | 25 | 19 | 28 | **T2** |
| 121206 | GU-151634 | cojines | Monterrey | 7.06 | 28 | 46 | 59 | **T3** |
| 61f43a | GU-967642 | refacciones | Monterrey | 3.4 | 30 | 16 | 30 | **T2** |
| e376b4 | GU-376972 | herramienta | León | 0.72 | 33 | 32 | 25 | **T3** |
| 057097 | GU-324598 | cojines | Monterrey | 1.06 | 66 | 12 | 54 | **T3** |
| c73fda | GU-840482 | documentos | CDMX | 0.74 | 10 | 32 | 25 | **T2** |
| 6dd412 | GU-569765 | documentos | León | 6.42 | 33 | 63 | 61 | **T4** |
| 27340d | GU-449146 | documentos | Aguascalientes | 20.77 | 12 | 24 | 56 | **T4** |
