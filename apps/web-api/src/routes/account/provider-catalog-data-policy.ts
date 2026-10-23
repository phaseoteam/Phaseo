import { z } from "zod";
import { canonicalCatalogCapability } from "./provider-catalog-capabilities";

export const catalogPolicyEvidenceUrlSchema = z.string().url().max(2000).refine((value) => {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password;
	} catch { return false; }
}, "Use an HTTPS evidence URL without credentials.");
const evidenceUrl = catalogPolicyEvidenceUrlSchema;

const declaration = z.strictObject({
	id: z.string().regex(/^[a-z0-9][a-z0-9._/-]{1,127}$/),
	training_policy: z.enum(["unknown", "may_train", "no_train", "opt_out_available", "enterprise_no_train"]),
	retention_mode: z.enum(["unknown", "none", "transient", "fixed", "until_deleted"]),
	retention_days: z.number().finite().nonnegative().nullable(),
	zero_data_retention: z.boolean().nullable(),
	zdr_eligibility: z.enum(["unknown", "eligible", "ineligible", "conditional"]),
	requirements: z.strictObject({
		contract_mode: z.enum(["none", "customer_agreement", "enterprise_agreement"]),
		account_settings: z.array(z.strictObject({
			id: z.string().regex(/^[a-z0-9._-]{1,64}$/),
			description: z.string().min(1).max(1000),
			documentation_url: evidenceUrl,
		})).max(16),
	}),
	privacy_policy_url: evidenceUrl,
	terms_of_service_url: evidenceUrl,
	notes: z.string().max(2000).optional(),
});

export const catalogDataPolicySchema = z.strictObject({ capabilities: z.array(declaration).max(32) }).nullable();
export type CatalogDataPolicy = z.infer<typeof catalogDataPolicySchema>;
export const catalogDataPolicyJsonSchema = z.toJSONSchema(catalogDataPolicySchema, { target: "draft-2020-12" });

/** Additional semantic constraints shared by imports and managed drafts. */
export function parseCatalogDataPolicy(value: unknown, capabilityIds: string[], tier: string) {
	const parsed = catalogDataPolicySchema.safeParse(value);
	if (!parsed.success) return { policy: null, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
	const issues: Array<{ path: string; message: string }> = [];
	const seen = new Set<string>();
	for (const [index, policy] of (parsed.data?.capabilities ?? []).entries()) {
		const fail = (message: string) => issues.push({ path: `capabilities.${index}`, message });
		const canonical = canonicalCatalogCapability(policy.id);
		if (canonical) policy.id = canonical;
		if (!canonical || !capabilityIds.map(canonicalCatalogCapability).includes(canonical) || seen.has(policy.id)) fail("Use a unique canonical capability declared by this model.");
		seen.add(policy.id);
		if ((policy.retention_mode === "none" && policy.retention_days !== 0)
			|| (["fixed", "transient"].includes(policy.retention_mode) && !(policy.retention_days != null && policy.retention_days > 0))
			|| (["unknown", "until_deleted"].includes(policy.retention_mode) && policy.retention_days !== null)) fail("Retention duration does not match retention mode.");
		if (policy.zero_data_retention === true && (tier === "batch" || policy.id !== "text.generate"
			|| policy.training_policy !== "no_train" || policy.retention_mode !== "none"
			|| policy.zdr_eligibility !== "eligible" || policy.requirements.contract_mode !== "none"
			|| policy.requirements.account_settings.length > 0)) fail("Active ZDR requires unconditional no-training/no-retention text generation on a non-batch offer.");
		if (policy.zero_data_retention !== true && policy.zdr_eligibility === "eligible") fail("An active denial cannot declare eligible ZDR.");
	}
	return { policy: parsed.data, issues };
}
