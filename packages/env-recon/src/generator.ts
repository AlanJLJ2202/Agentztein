import {
  hashCanonical,
  sha256,
  type Batch,
  type Case,
  type Dataset,
  type Family,
  type Label,
  type Row,
  type RulesVersionId,
  type SchemaVersion,
  type Split,
  type Vendor,
} from "@skillab/contracts";
import { Rng } from "./prng.js";
import { schemaFor } from "./rules.js";

/** Bump whenever generation logic changes: it is part of every dataset hash. */
export const GENERATOR_VERSION = "env-recon@1";

export type Profile = "train" | "heldout";

interface ProfileParams {
  merchants: readonly string[];
  year: number;
  purchases: [number, number];
  /** Legitimate same-day, same-amount repeats (vendorB only). */
  repeats: [number, number];
  duplicates: [number, number];
  /** Probability that a duplicated purchase is imported three times (duplicate chain). */
  chainProb: number;
  refunds: [number, number];
  transfers: [number, number];
  cents: (rng: Rng) => number;
  /** Unseen combinations: refund of a duplicated purchase, transfer on the same day as a duplicate. */
  novelCombos: boolean;
}

export const TRAIN_MERCHANTS = [
  "CAFE LUNA",
  "OXXO CENTRO",
  "FARMACIA SOL",
  "GASOLINERA PEMEX NORTE",
  "SUPER LA ESTRELLA",
  "TAQUERIA EL GUERO",
  "LIBRERIA CENTRAL",
  "CINEPOLIS PLAZA",
] as const;

export const HELDOUT_MERCHANTS = [
  "PANADERIA ROSA",
  "FERRETERIA EL CLAVO",
  "PAPELERIA ARCOIRIS",
  "VETERINARIA HUELLITAS",
  "LAVANDERIA BURBUJA",
  "REFACCIONARIA RUEDA",
  "MERCADO SAN JUAN",
  "OPTICA VISTA CLARA",
  "ZAPATERIA PASO FIRME",
] as const;

const PROFILES: Record<Profile, ProfileParams> = {
  train: {
    merchants: TRAIN_MERCHANTS,
    year: 2025,
    purchases: [8, 12],
    repeats: [1, 2],
    duplicates: [0, 2],
    chainProb: 0,
    refunds: [0, 1],
    transfers: [0, 1],
    cents: (rng) => rng.int(20, 1500) * 100 + rng.pick([0, 0, 50, 90]),
    novelCombos: false,
  },
  heldout: {
    merchants: HELDOUT_MERCHANTS,
    year: 2026,
    purchases: [12, 18],
    repeats: [1, 3],
    duplicates: [1, 3],
    chainProb: 0.4,
    refunds: [1, 2],
    transfers: [1, 1],
    cents: (rng) => rng.int(500, 9000) * 100 + rng.int(0, 99),
    novelCombos: true,
  },
};

type EventKind = "purchase" | "refund" | "transfer_out" | "transfer_in";

/** A logical movement before it is materialized into one or more imported rows. */
interface MovementEvent {
  key: number;
  kind: EventKind;
  merchant: string;
  date: string;
  time: string;
  cents: number;
  credit: boolean;
  copies: number;
  txnId?: string;
  ref?: string;
  account?: string;
  refundOf?: number;
  pairOf?: number;
  /** Part of a designed legitimate repeat (same merchant, date and amount, different time). */
  twin?: boolean;
}

export interface BatchSpec {
  split: Split;
  family: Family;
  seed: number;
  vendor: Vendor;
  rulesVersion: RulesVersionId;
  profile: Profile;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function randomTime(rng: Rng): string {
  return `${String(rng.int(7, 22)).padStart(2, "0")}:${String(rng.int(0, 59)).padStart(2, "0")}`;
}

export function batchIdFor(spec: Pick<BatchSpec, "split" | "family" | "seed">): string {
  return `b_${sha256(`${GENERATOR_VERSION}|${spec.split}|${spec.family}|${spec.seed}`).slice(0, 12)}`;
}

/**
 * Generates one import batch plus its ground truth. Deterministic in `spec`.
 *
 * Designed traps (ADR-007):
 * - vendorA has stable vendor_txn_id and no legitimate same-day same-amount repeats,
 *   so "duplicate = same amount + same date" happens to be right there.
 * - vendorB has no id and does have legitimate repeats (two coffees), distinguishable only by the
 *   operation time embedded in the description; the amount+date rule over-flags them.
 * - Under R2 vendorB amounts are unsigned with an explicit direction, so sign-based rules break.
 */
export function generateBatch(spec: BatchSpec): { batch: Batch; truth: Label[] } {
  const rng = new Rng(spec.seed);
  const p = PROFILES[spec.profile];
  const schema = schemaFor(spec.vendor, spec.rulesVersion);
  const isA = spec.vendor === "vendorA";

  const start = addDays(`${p.year}-01-01`, rng.int(0, 300));
  const events: MovementEvent[] = [];
  // (date, cents) pairs already used by a movement: keeps amount+date collisions only where designed.
  const usedDateCents = new Set<string>();
  // (merchant, cents) pairs with more than one purchase: refunds of those would be ambiguous.
  const merchantCents = new Map<string, number>();
  const usedTxnIds = new Set<string>();

  const freshTxnId = (): string => {
    let id: string;
    do id = `A${rng.hex(10).toUpperCase()}`;
    while (usedTxnIds.has(id));
    usedTxnIds.add(id);
    return id;
  };
  const push = (e: Omit<MovementEvent, "key" | "copies">): MovementEvent => {
    const ev: MovementEvent = { ...e, key: events.length, copies: 1 };
    if (isA) ev.txnId = freshTxnId();
    events.push(ev);
    return ev;
  };
  const reserveCents = (date: string, gen: () => number): number => {
    for (;;) {
      const cents = gen();
      const k = `${date}|${cents}`;
      if (!usedDateCents.has(k)) {
        usedDateCents.add(k);
        return cents;
      }
    }
  };

  const nPurchases = rng.int(...p.purchases);
  for (let i = 0; i < nPurchases; i++) {
    const date = addDays(start, rng.int(0, 6));
    const merchant = rng.pick(p.merchants);
    const cents = reserveCents(date, () => p.cents(rng));
    push({ kind: "purchase", merchant, date, time: randomTime(rng), cents, credit: false });
  }
  const basePurchases = [...events];

  if (!isA) {
    const nRepeats = rng.int(...p.repeats);
    for (const original of rng.shuffle(basePurchases).slice(0, nRepeats)) {
      let time = randomTime(rng);
      while (time === original.time) time = randomTime(rng);
      original.twin = true;
      push({ ...pickMovement(original), time, twin: true });
    }
  }

  const purchases = events.filter((e) => e.kind === "purchase");
  for (const e of purchases) {
    const k = `${e.merchant}|${e.cents}`;
    merchantCents.set(k, (merchantCents.get(k) ?? 0) + 1);
  }

  const nDup = rng.int(...p.duplicates);
  const duplicated = rng.shuffle(purchases).slice(0, nDup);
  for (const e of duplicated) e.copies = rng.next() < p.chainProb ? 3 : 2;

  let nRefunds = rng.int(...p.refunds);
  let nTransfers = rng.int(...p.transfers);
  if (nRefunds + nTransfers === 0) {
    if (rng.next() < 0.5) nRefunds = 1;
    else nTransfers = 1;
  }

  const refundable = (e: MovementEvent): boolean => !e.twin && merchantCents.get(`${e.merchant}|${e.cents}`) === 1;
  const refundPool = rng
    .shuffle(purchases.filter(refundable))
    // Heldout puts duplicated purchases first (refund of a duplicated purchase is an unseen combination);
    // train never refunds a duplicated purchase.
    .filter((e) => p.novelCombos || e.copies === 1)
    .sort((a, b) => (p.novelCombos ? Number(b.copies > 1) - Number(a.copies > 1) : 0));
  for (const target of refundPool.slice(0, nRefunds)) {
    let date = addDays(target.date, rng.int(1, 4));
    while (usedDateCents.has(`${date}|${target.cents}`)) date = addDays(date, 1);
    usedDateCents.add(`${date}|${target.cents}`);
    push({
      kind: "refund",
      merchant: target.merchant,
      date,
      time: randomTime(rng),
      cents: target.cents,
      credit: true,
      refundOf: target.key,
    });
  }

  for (let i = 0; i < nTransfers; i++) {
    const sameDayAsDup = p.novelCombos ? duplicated[0] : undefined;
    const date = sameDayAsDup ? sameDayAsDup.date : addDays(start, rng.int(0, 6));
    const cents = reserveCents(date, () => rng.int(1, 10) * 50000);
    const ref = `TRF-${String(rng.int(0, 999999)).padStart(6, "0")}`;
    const time = randomTime(rng);
    const out = push({
      kind: "transfer_out",
      merchant: "OWN ACCT",
      account: String(rng.int(1000, 9999)),
      date,
      time,
      cents,
      credit: false,
      ref,
    });
    const inn = push({
      kind: "transfer_in",
      merchant: "OWN ACCT",
      account: String(rng.int(1000, 9999)),
      date,
      time,
      cents,
      credit: true,
      ref,
      pairOf: out.key,
    });
    out.pairOf = inn.key;
  }

  // Materialize copies, then order by date with random tie order (imports are date-sorted).
  const materialized = rng.shuffle(events.flatMap((e) => Array.from({ length: e.copies }, () => e)));
  materialized.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const batchId = batchIdFor(spec);
  const rows: Row[] = [];
  const firstRowOf = new Map<number, string>();
  const rowEvent: MovementEvent[] = [];
  materialized.forEach((e, position) => {
    const rowId = `r_${sha256(`${batchId}|${position}`).slice(0, 12)}`;
    if (!firstRowOf.has(e.key)) firstRowOf.set(e.key, rowId);
    rows.push(toRow(e, rowId, spec.vendor, schema));
    rowEvent.push(e);
  });

  const truth: Label[] = rows.map((row, i) => {
    const e = rowEvent[i] as MovementEvent;
    const first = firstRowOf.get(e.key) as string;
    if (first !== row.rowId) return { rowId: row.rowId, kind: "duplicate_of", target: first };
    if (e.kind === "refund") {
      return { rowId: row.rowId, kind: "refund_of", target: firstRowOf.get(e.refundOf as number) as string };
    }
    if (e.kind === "transfer_out" || e.kind === "transfer_in") {
      return { rowId: row.rowId, kind: "transfer_pair", target: firstRowOf.get(e.pairOf as number) as string };
    }
    return { rowId: row.rowId, kind: "legitimate" };
  });

  return { batch: { batchId, vendor: spec.vendor, schemaVersion: schema, rulesVersion: spec.rulesVersion, rows }, truth };
}

function pickMovement(e: MovementEvent): Omit<MovementEvent, "key" | "copies"> {
  return { kind: e.kind, merchant: e.merchant, date: e.date, time: e.time, cents: e.cents, credit: e.credit };
}

function describe(e: MovementEvent, isB: boolean): string {
  let text: string;
  switch (e.kind) {
    case "purchase":
      text = e.merchant;
      break;
    case "refund":
      text = `REFUND ${e.merchant}`;
      break;
    case "transfer_out":
      text = `TRANSFER TO OWN ACCT ****${e.account}`;
      break;
    case "transfer_in":
      text = `TRANSFER FROM OWN ACCT ****${e.account}`;
      break;
  }
  // vendorB embeds the operation time: the only signal separating a re-import from a real repeat.
  return isB ? `${text} ${e.time}` : text;
}

function toRow(e: MovementEvent, rowId: string, vendor: Vendor, schema: SchemaVersion): Row {
  const abs = e.cents / 100;
  const row: Row = {
    rowId,
    vendor,
    schemaVersion: schema,
    date: e.date,
    amount: schema === "B@2" ? abs : e.credit ? abs : -abs,
    currency: "MXN",
    description: describe(e, vendor === "vendorB"),
  };
  if (e.txnId !== undefined) row.vendor_txn_id = e.txnId;
  if (schema === "B@2") row.direction = e.credit ? "credit" : "debit";
  if (e.ref !== undefined) row.ref = e.ref;
  return row;
}

// ---------------------------------------------------------------------------------------------
// Families and splits
// ---------------------------------------------------------------------------------------------

export const CONFIG_VERSION = "ds-v1";

/** Disjoint seed ranges per split; each family gets its own sub-range. */
export const SPLIT_SEED_BASE: Record<Split, number> = { adaptation: 1_000_000, validation: 2_000_000, test: 3_000_000 };
export const FAMILY_SEED_OFFSET: Record<Family, number> = { stable: 0, interleaved: 100_000, temporal_shift: 200_000 };
export const MAX_CASES_PER_FAMILY = 100_000;

export const DEFAULT_COUNTS: Record<Split, number> = { adaptation: 20, validation: 10, test: 10 };

export interface DatasetSpec {
  family: Family;
  split: Split;
  count: number;
}

export function shiftIndexFor(family: Family, count: number): number | null {
  return family === "temporal_shift" ? Math.floor(count / 2) : null;
}

export function caseSpec(family: Family, split: Split, index: number, count: number): BatchSpec {
  if (index >= MAX_CASES_PER_FAMILY) throw new Error("case index exceeds seed sub-range");
  const seed = SPLIT_SEED_BASE[split] + FAMILY_SEED_OFFSET[family] + index;
  const vendor: Vendor = family === "stable" || index % 2 === 0 ? "vendorA" : "vendorB";
  const shift = shiftIndexFor(family, count);
  const rulesVersion: RulesVersionId = shift !== null && index >= shift ? "R2" : "R1";
  return { split, family, seed, vendor, rulesVersion, profile: split === "test" ? "heldout" : "train" };
}

export function generateDataset({ family, split, count }: DatasetSpec): Dataset {
  const cases: Case[] = [];
  for (let index = 0; index < count; index++) {
    const spec = caseSpec(family, split, index, count);
    const { batch, truth } = generateBatch(spec);
    cases.push({
      caseId: `${split}/${family}/${String(index).padStart(3, "0")}`,
      family,
      split,
      seed: spec.seed,
      index,
      batch,
      truth,
    });
  }
  return {
    generatorVersion: GENERATOR_VERSION,
    configVersion: CONFIG_VERSION,
    family,
    split,
    profile: split === "test" ? "heldout" : "train",
    shiftIndex: shiftIndexFor(family, count),
    cases,
  };
}

export function datasetHash(ds: Dataset): string {
  return hashCanonical(ds);
}
