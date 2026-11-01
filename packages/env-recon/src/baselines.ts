import type { Batch, Label, Row } from "@skillab/contracts";

/**
 * Hand-written reference policies used ONLY to validate the environment (ADR-008):
 * they prove the traps exist and that the task is solvable from observable fields.
 * They are not agents and never see ground truth.
 */
export type Oracle = (batch: Batch) => Label[];

const TIME_SUFFIX = / \d{2}:\d{2}$/;

function merchantOf(row: Row): string {
  return row.description.replace(TIME_SUFFIX, "").replace(/^REFUND /, "");
}

function isTransfer(row: Row): boolean {
  return row.description.startsWith("TRANSFER ");
}

function isRefund(row: Row): boolean {
  return row.description.startsWith("REFUND ");
}

type Polarity = (row: Row) => "credit" | "debit";

/** Correct for every schema: B@2 carries direction, A@1/B@1 use the sign of amount. */
const schemaAwarePolarity: Polarity = (row) =>
  row.schemaVersion === "B@2" ? (row.direction ?? "debit") : row.amount > 0 ? "credit" : "debit";

/** The pre-R2 habit: credit iff amount > 0. Breaks on B@2, where every amount is positive. */
const signPolarity: Polarity = (row) => (row.amount > 0 ? "credit" : "debit");

type DedupeKey = (row: Row) => string;

/** vendorA: stable id. vendorB: full description includes the operation time. */
const referenceDedupeKey: DedupeKey = (row) =>
  row.vendor_txn_id ?? `${row.date}|${row.amount}|${row.direction ?? ""}|${row.description}`;

/** The naive rule from the brief: duplicate = same amount + same date. */
const naiveDedupeKey: DedupeKey = (row) => `${row.date}|${row.amount}`;

function labelWith(batch: Batch, dedupeKey: DedupeKey, polarity: Polarity | null): Label[] {
  const firstByKey = new Map<string, string>();
  const labels = new Map<string, Label>();
  const originals: Row[] = [];

  for (const row of batch.rows) {
    const key = dedupeKey(row);
    const first = firstByKey.get(key);
    if (first !== undefined) {
      labels.set(row.rowId, { rowId: row.rowId, kind: "duplicate_of", target: first });
    } else {
      firstByKey.set(key, row.rowId);
      labels.set(row.rowId, { rowId: row.rowId, kind: "legitimate" });
      originals.push(row);
    }
  }

  if (polarity !== null) {
    const transfersByRef = new Map<string, Row[]>();
    for (const row of originals) {
      if (isTransfer(row) && row.ref !== undefined) {
        transfersByRef.set(row.ref, [...(transfersByRef.get(row.ref) ?? []), row]);
      }
    }
    for (const legs of transfersByRef.values()) {
      const [a, b] = legs;
      if (legs.length === 2 && a && b && polarity(a) !== polarity(b) && Math.abs(a.amount) === Math.abs(b.amount)) {
        labels.set(a.rowId, { rowId: a.rowId, kind: "transfer_pair", target: b.rowId });
        labels.set(b.rowId, { rowId: b.rowId, kind: "transfer_pair", target: a.rowId });
      }
    }

    const absAmount = (r: Row) => Math.abs(r.amount);
    originals.forEach((row, i) => {
      if (!isRefund(row) || polarity(row) !== "credit") return;
      const target = originals
        .slice(0, i)
        .find(
          (p) =>
            !isRefund(p) &&
            !isTransfer(p) &&
            polarity(p) === "debit" &&
            merchantOf(p) === merchantOf(row) &&
            absAmount(p) === absAmount(row),
        );
      if (target) labels.set(row.rowId, { rowId: row.rowId, kind: "refund_of", target: target.rowId });
    });
  }

  return batch.rows.map((r) => labels.get(r.rowId) as Label);
}

export const referenceOracle: Oracle = (batch) => labelWith(batch, referenceDedupeKey, schemaAwarePolarity);
export const naiveDedupeOracle: Oracle = (batch) => labelWith(batch, naiveDedupeKey, null);
/** Correct everywhere except for one global habit: amount + date dedupe. Used for cross-scenario comparison. */
export const naiveRuleOracle: Oracle = (batch) => labelWith(batch, naiveDedupeKey, schemaAwarePolarity);
export const signRuleOracle: Oracle = (batch) => labelWith(batch, referenceDedupeKey, signPolarity);
