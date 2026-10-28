import type { RuleVersion, RulesVersionId, SchemaVersion, Vendor } from "@skillab/contracts";

export const RULE_VERSIONS: Record<RulesVersionId, RuleVersion> = {
  R1: {
    id: "R1",
    supersedes: null,
    schemas: { vendorA: "A@1", vendorB: "B@1" },
    changes: [],
    description: "Signed amount (negative = charge) for both vendors.",
  },
  R2: {
    id: "R2",
    supersedes: "R1",
    schemas: { vendorA: "A@1", vendorB: "B@2" },
    changes: [
      {
        vendor: "vendorB",
        fromSchema: "B@1",
        toSchema: "B@2",
        fields: ["amount", "direction"],
        description: "vendorB amounts become always positive; new field direction = debit | credit.",
      },
    ],
    description: "vendorB moves to schema B@2; vendorA unchanged.",
  },
};

export function schemaFor(vendor: Vendor, rules: RulesVersionId): SchemaVersion {
  return RULE_VERSIONS[rules].schemas[vendor];
}
