# Revisión de la verdad de referencia

> Generado por `pnpm datasets:review` (env-recon@1, ds-v1). No editar a mano.
> Muestra lotes del split **adaptation** y conteos de adaptation/validation. El split test sellado no se lee.

**Estado:** pendiente de revisión por Alan. Al aprobar, anotar fecha y hash del manifest en
`docs/DECISIONS.md` (ADR-011).

## Qué revisar
1. Cada `duplicate_of` apunta a una fila idéntica (salvo `rowId`) que aparece antes.
2. En vendorB, dos compras con mismo importe y fecha pero **distinta hora** son `legitimate`.
3. Cada `refund_of` apunta a una compra anterior del mismo comercio e importe absoluto.
4. Las dos patas de una transferencia comparten `ref`, fecha e importe, con sentidos opuestos.
5. En B@2 (R2) los importes son positivos y el sentido está en `direction`.

Los ids se muestran abreviados (6 caracteres).

## Conteo de etiquetas por split

| split | legitimate | duplicate_of | refund_of | transfer_pair |
|---|---:|---:|---:|---:|
| adaptation | 618 | 68 | 46 | 64 |
| validation | 314 | 32 | 15 | 42 |

## Lotes de ejemplo

### vendorA/R1 — `adaptation/stable/000` (schema A@1, batch `b_1cd71ae32bd0`)

| # | row | date | amount | direction | description | vendor_txn_id | ref | label |
|---|---|---|---:|---|---|---|---|---|
| 0 | a37ee4 | 2025-03-24 | -735.90 |  | CAFE LUNA | A1FA3D9224E |  | legitimate |
| 1 | a2484f | 2025-03-24 | 1000.00 |  | TRANSFER FROM OWN ACCT ****4646 | A4668B4C29D | TRF-721521 | transfer_pair(b56ed6) |
| 2 | cc004b | 2025-03-24 | -196.00 |  | SUPER LA ESTRELLA | ABD57FB9F9B |  | legitimate |
| 3 | db7c3b | 2025-03-24 | -1252.90 |  | OXXO CENTRO | AEAC0AB4CBE |  | legitimate |
| 4 | b56ed6 | 2025-03-24 | -1000.00 |  | TRANSFER TO OWN ACCT ****5926 | A97E757536E | TRF-721521 | transfer_pair(a2484f) |
| 5 | 283c03 | 2025-03-24 | -818.50 |  | TAQUERIA EL GUERO | A975436DCB7 |  | legitimate |
| 6 | 63abcd | 2025-03-25 | -1173.00 |  | GASOLINERA PEMEX NORTE | A21F4730A9C |  | legitimate |
| 7 | e42972 | 2025-03-26 | 1252.90 |  | REFUND OXXO CENTRO | AC7D1164DC4 |  | refund_of(db7c3b) |
| 8 | 580375 | 2025-03-27 | -740.50 |  | LIBRERIA CENTRAL | AF471421279 |  | legitimate |
| 9 | 719371 | 2025-03-27 | -129.00 |  | TAQUERIA EL GUERO | A8AEF766C70 |  | legitimate |
| 10 | 3d3470 | 2025-03-28 | -119.90 |  | LIBRERIA CENTRAL | AC823AC6FFC |  | legitimate |
| 11 | ead4c1 | 2025-03-28 | -416.00 |  | CINEPOLIS PLAZA | A0F8DCD1D93 |  | legitimate |
| 12 | 7e75c4 | 2025-03-28 | -734.00 |  | CINEPOLIS PLAZA | A27FCD9995C |  | legitimate |
| 13 | 494c87 | 2025-03-29 | -1054.90 |  | FARMACIA SOL | A3C26C36833 |  | legitimate |
| 14 | 951853 | 2025-03-29 | -833.50 |  | CINEPOLIS PLAZA | AA417051214 |  | legitimate |

### vendorB/R1 — `adaptation/interleaved/001` (schema B@1, batch `b_271cf1db3c2a`)

| # | row | date | amount | direction | description | vendor_txn_id | ref | label |
|---|---|---|---:|---|---|---|---|---|
| 0 | 8ad555 | 2025-01-04 | -1103.90 |  | OXXO CENTRO 21:46 |  |  | legitimate |
| 1 | 6217d4 | 2025-01-05 | -1135.90 |  | CAFE LUNA 14:43 |  |  | legitimate |
| 2 | e1d557 | 2025-01-05 | -23.50 |  | CINEPOLIS PLAZA 18:15 |  |  | legitimate |
| 3 | 536493 | 2025-01-06 | -656.90 |  | GASOLINERA PEMEX NORTE 08:59 |  |  | legitimate |
| 4 | 1e511e | 2025-01-06 | -475.50 |  | CINEPOLIS PLAZA 14:58 |  |  | legitimate |
| 5 | 5d7d7d | 2025-01-07 | -1401.00 |  | FARMACIA SOL 08:15 |  |  | legitimate |
| 6 | 815e0c | 2025-01-07 | -1401.00 |  | FARMACIA SOL 21:52 |  |  | legitimate |
| 7 | f29515 | 2025-01-08 | -4500.00 |  | TRANSFER TO OWN ACCT ****7442 10:03 |  | TRF-306307 | transfer_pair(9a609b) |
| 8 | 9a609b | 2025-01-08 | 4500.00 |  | TRANSFER FROM OWN ACCT ****6577 10:03 |  | TRF-306307 | transfer_pair(f29515) |
| 9 | 1e279c | 2025-01-09 | -248.00 |  | CAFE LUNA 19:41 |  |  | legitimate |
| 10 | 686b5e | 2025-01-09 | -1494.00 |  | SUPER LA ESTRELLA 09:56 |  |  | legitimate |
| 11 | 01309b | 2025-01-10 | -85.00 |  | GASOLINERA PEMEX NORTE 16:34 |  |  | legitimate |
| 12 | cadd34 | 2025-01-10 | -85.00 |  | GASOLINERA PEMEX NORTE 16:34 |  |  | duplicate_of(01309b) |
| 13 | 876ef6 | 2025-01-10 | -1390.00 |  | OXXO CENTRO 22:08 |  |  | legitimate |
| 14 | 370b45 | 2025-01-10 | -1390.00 |  | OXXO CENTRO 22:08 |  |  | duplicate_of(876ef6) |

### vendorA/R2 — `adaptation/temporal_shift/010` (schema A@1, batch `b_3e23e9a3ac7b`)

| # | row | date | amount | direction | description | vendor_txn_id | ref | label |
|---|---|---|---:|---|---|---|---|---|
| 0 | 6a4003 | 2025-07-20 | -767.90 |  | CINEPOLIS PLAZA | A783F0EC8F4 |  | legitimate |
| 1 | 16bda0 | 2025-07-20 | -638.90 |  | SUPER LA ESTRELLA | AFA941CE654 |  | legitimate |
| 2 | 6d11a0 | 2025-07-20 | -1439.50 |  | FARMACIA SOL | A5F503635C3 |  | legitimate |
| 3 | 2ba883 | 2025-07-21 | -1195.50 |  | TAQUERIA EL GUERO | A44DC3ACA5A |  | legitimate |
| 4 | 323631 | 2025-07-21 | -1195.50 |  | TAQUERIA EL GUERO | A44DC3ACA5A |  | duplicate_of(2ba883) |
| 5 | 4c9410 | 2025-07-21 | -1300.90 |  | GASOLINERA PEMEX NORTE | A1E247C7D56 |  | legitimate |
| 6 | aabfcc | 2025-07-23 | -1453.00 |  | FARMACIA SOL | A2B567F4DBB |  | legitimate |
| 7 | ec0620 | 2025-07-24 | -722.90 |  | OXXO CENTRO | A9251B405C2 |  | legitimate |
| 8 | 35bdb2 | 2025-07-24 | -722.90 |  | OXXO CENTRO | A9251B405C2 |  | duplicate_of(ec0620) |
| 9 | 4ef676 | 2025-07-25 | -980.00 |  | LIBRERIA CENTRAL | A09EF69F7EB |  | legitimate |
| 10 | e66a87 | 2025-07-26 | 980.00 |  | REFUND LIBRERIA CENTRAL | A3AF51C7FA8 |  | refund_of(4ef676) |

### vendorB/R2 — `adaptation/temporal_shift/011` (schema B@2, batch `b_1d5e2891238f`)

| # | row | date | amount | direction | description | vendor_txn_id | ref | label |
|---|---|---|---:|---|---|---|---|---|
| 0 | 5f417f | 2025-06-08 | 897.00 | debit | CAFE LUNA 13:27 |  |  | legitimate |
| 1 | 66a71f | 2025-06-08 | 450.50 | debit | CINEPOLIS PLAZA 11:25 |  |  | legitimate |
| 2 | 4de05d | 2025-06-08 | 450.50 | debit | CINEPOLIS PLAZA 11:25 |  |  | duplicate_of(66a71f) |
| 3 | 5de45a | 2025-06-08 | 897.00 | debit | CAFE LUNA 19:48 |  |  | legitimate |
| 4 | ef7cda | 2025-06-09 | 1430.00 | debit | CAFE LUNA 18:18 |  |  | legitimate |
| 5 | eed6b3 | 2025-06-09 | 1430.00 | debit | CAFE LUNA 18:18 |  |  | duplicate_of(ef7cda) |
| 6 | a91d06 | 2025-06-09 | 1216.00 | debit | GASOLINERA PEMEX NORTE 20:04 |  |  | legitimate |
| 7 | 071f4f | 2025-06-12 | 1006.90 | debit | TAQUERIA EL GUERO 14:44 |  |  | legitimate |
| 8 | d6426a | 2025-06-12 | 1216.00 | credit | REFUND GASOLINERA PEMEX NORTE 19:00 |  |  | refund_of(a91d06) |
| 9 | 889875 | 2025-06-12 | 455.90 | debit | GASOLINERA PEMEX NORTE 08:28 |  |  | legitimate |
| 10 | 4bf6fc | 2025-06-12 | 455.90 | debit | GASOLINERA PEMEX NORTE 16:54 |  |  | legitimate |
| 11 | cb1f80 | 2025-06-13 | 1118.00 | debit | CINEPOLIS PLAZA 09:33 |  |  | legitimate |
| 12 | 967050 | 2025-06-13 | 79.90 | debit | CINEPOLIS PLAZA 22:33 |  |  | legitimate |
| 13 | 134f77 | 2025-06-14 | 74.00 | debit | FARMACIA SOL 10:57 |  |  | legitimate |
