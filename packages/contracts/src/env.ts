import { z } from "zod";

export const Vendor = z.enum(["vendorA", "vendorB"]);
export type Vendor = z.infer<typeof Vendor>;

export const SchemaVersion = z.enum(["A@1", "B@1", "B@2"]);
export type SchemaVersion = z.infer<typeof SchemaVersion>;

export const RulesVersionId = z.enum(["R1", "R2"]);
export type RulesVersionId = z.infer<typeof RulesVersionId>;

export const Family = z.enum(["stable", "interleaved", "temporal_shift"]);
export type Family = z.infer<typeof Family>;

export const Split = z.enum(["adaptation", "validation", "test"]);
export type Split = z.infer<typeof Split>;

export const Direction = z.enum(["debit", "credit"]);

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One imported movement, exactly as the agent sees it through the tools. */
export const Row = z
  .object({
    rowId: z.string().min(1),
    vendor: Vendor,
    schemaVersion: SchemaVersion,
    date: IsoDate,
    amount: z.number().finite(),
    currency: z.literal("MXN"),
    description: z.string().min(1),
    vendor_txn_id: z.string().min(1).optional(),
    direction: Direction.optional(),
    ref: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((row, ctx) => {
    const expectedVendor = row.schemaVersion.startsWith("A@") ? "vendorA" : "vendorB";
    if (row.vendor !== expectedVendor) {
      ctx.addIssue({ code: "custom", message: `schema ${row.schemaVersion} belongs to ${expectedVendor}` });
    }
    if (row.schemaVersion === "A@1" && row.vendor_txn_id === undefined) {
      ctx.addIssue({ code: "custom", message: "A@1 rows carry a stable vendor_txn_id" });
    }
    if (row.schemaVersion !== "A@1" && row.vendor_txn_id !== undefined) {
      ctx.addIssue({ code: "custom", message: "vendorB rows have no vendor_txn_id" });
    }
    if (row.schemaVersion === "B@2") {
      if (row.direction === undefined) ctx.addIssue({ code: "custom", message: "B@2 requires direction" });
      if (row.amount < 0) ctx.addIssue({ code: "custom", message: "B@2 amounts are non-negative" });
    } else if (row.direction !== undefined) {
      ctx.addIssue({ code: "custom", message: `${row.schemaVersion} has no direction field` });
    }
  });
export type Row = z.infer<typeof Row>;

export const Label = z.discriminatedUnion("kind", [
  z.object({ rowId: z.string().min(1), kind: z.literal("legitimate") }).strict(),
  z.object({ rowId: z.string().min(1), kind: z.literal("duplicate_of"), target: z.string().min(1) }).strict(),
  z.object({ rowId: z.string().min(1), kind: z.literal("refund_of"), target: z.string().min(1) }).strict(),
  z.object({ rowId: z.string().min(1), kind: z.literal("transfer_pair"), target: z.string().min(1) }).strict(),
]);
export type Label = z.infer<typeof Label>;
export type LabelKind = Label["kind"];

export const ImportMetadata = z
  .object({ batchId: z.string().min(1), vendor: Vendor, schemaVersion: SchemaVersion, rulesVersion: RulesVersionId })
  .strict();
export type ImportMetadata = z.infer<typeof ImportMetadata>;

/** What the runner may hand to the agent: metadata + rows, never labels. */
export const Batch = ImportMetadata.extend({ rows: z.array(Row) }).strict();
export type Batch = z.infer<typeof Batch>;

/** The agent's final answer, validated before scoring; invalid JSON fails the episode. */
export const SubmitLabels = z.object({ batchId: z.string().min(1), labels: z.array(Label) }).strict();
export type SubmitLabels = z.infer<typeof SubmitLabels>;

export const CaseRef = z
  .object({
    caseId: z.string().min(1),
    family: Family,
    split: Split,
    seed: z.number().int().nonnegative(),
    index: z.number().int().nonnegative(),
  })
  .strict();

export const Case = CaseRef.extend({ batch: Batch, truth: z.array(Label) }).strict();
export type Case = z.infer<typeof Case>;

export const Dataset = z
  .object({
    generatorVersion: z.string().min(1),
    configVersion: z.string().min(1),
    family: Family,
    split: Split,
    profile: z.enum(["train", "heldout"]),
    shiftIndex: z.number().int().nonnegative().nullable(),
    cases: z.array(Case),
  })
  .strict();
export type Dataset = z.infer<typeof Dataset>;

export const DatasetManifestEntry = z
  .object({
    family: Family,
    split: Split,
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    caseCount: z.number().int().nonnegative(),
    rowCount: z.number().int().nonnegative(),
    seedRange: z.tuple([z.number().int(), z.number().int()]),
    path: z.string().min(1),
  })
  .strict();

export const DatasetManifest = z
  .object({
    generatorVersion: z.string().min(1),
    configVersion: z.string().min(1),
    entries: z.array(DatasetManifestEntry),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type DatasetManifest = z.infer<typeof DatasetManifest>;
