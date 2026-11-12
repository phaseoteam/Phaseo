// Purpose: Settle the BYOK fee for a request that includes server-tool charges.
// Kept apart from byok-fee.ts so it calls applyByokServiceFee through that module's export.

import { applyByokServiceFee, BYOK_SERVICE_FEE_RATE } from "./byok-fee";

const NANOS_PER_CENT = 10_000_000;

function normalizeNanos(value: unknown): number {
	const numeric = typeof value === "number" ? value : Number(value);
	return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
}

type ByokFeeArgs = Parameters<typeof applyByokServiceFee>[0];
type ByokFeeResult = Awaited<ReturnType<typeof applyByokServiceFee>>;

/** A model a server tool ran inside the request, priced on its own card (see core/types ServerToolPricing). */
type ToolCharge = {
	component: string;
	model: string;
	total_nanos: number;
	key_source?: "byok" | "gateway";
	lines?: Record<string, unknown>[];
};

/**
 * The BYOK fee for a request that may include server-tool charges (Chat's image tool).
 * Each part is settled under the credential it ran on: the request's own cost under the
 * request's credential (as applyByokServiceFee), a tool model run on Phaseo's keys at its
 * full cost, and a tool model run on the customer's own key at the BYOK fee rate only.
 * calculatePricing records how much of the total came from tool charges in
 * pricing.server_tool_nanos; that part is taken out before the request's own fee applies.
 */
export async function applyByokServiceFeeWithToolCharges(
	args: ByokFeeArgs & { toolCharges?: readonly ToolCharge[] | null },
): Promise<ByokFeeResult> {
	const { toolCharges, ...feeArgs } = args;
	const charges = (toolCharges ?? []).filter((charge) => normalizeNanos(charge.total_nanos) > 0);
	if (charges.length === 0) return applyByokServiceFee(feeArgs);

	const usageIn = feeArgs.pricedUsage && typeof feeArgs.pricedUsage === "object" ? feeArgs.pricedUsage : {};
	const pricingIn = usageIn.pricing && typeof usageIn.pricing === "object" ? (usageIn.pricing as Record<string, any>) : {};
	const includedToolNanos = normalizeNanos(pricingIn.server_tool_nanos);
	const totalIn = normalizeNanos(pricingIn.total_nanos) > 0 ? normalizeNanos(pricingIn.total_nanos) : normalizeNanos(feeArgs.baseCostNanos);
	const ownNanos = Math.max(0, totalIn - includedToolNanos);
	const own = await applyByokServiceFee({
		...feeArgs,
		baseCostNanos: ownNanos,
		pricedUsage: {
			...usageIn,
			pricing: { ...pricingIn, total_nanos: ownNanos, total_cents: Math.trunc(ownNanos / NANOS_PER_CENT) },
		},
	});

	const settled = charges.map((charge) => {
		const providerReferenceNanos = normalizeNanos(charge.total_nanos);
		const chargedNanos = charge.key_source === "byok"
			? Math.max(0, Math.round(providerReferenceNanos * BYOK_SERVICE_FEE_RATE))
			: providerReferenceNanos;
		return {
			component: charge.component,
			model: charge.model,
			key_source: charge.key_source === "byok" ? "byok" : "gateway",
			provider_reference_nanos: providerReferenceNanos,
			charged_nanos: chargedNanos,
		};
	});
	const toolChargedNanos = settled.reduce((sum, charge) => sum + charge.charged_nanos, 0);
	const totalNanos = own.totalNanos + toolChargedNanos;
	const ownPricing = own.pricedUsage?.pricing && typeof own.pricedUsage.pricing === "object" ? own.pricedUsage.pricing : {};
	return {
		...own,
		totalNanos,
		totalCents: Math.trunc(totalNanos / NANOS_PER_CENT),
		pricedUsage: {
			...own.pricedUsage,
			pricing: {
				...ownPricing,
				// A BYOK request keeps its fee line plus the tool lines; otherwise the priced lines
				// already hold both the request's and the tools'.
				lines: feeArgs.isByok
					? [...(Array.isArray(ownPricing.lines) ? ownPricing.lines : []), ...charges.flatMap((charge) => charge.lines ?? [])]
					: Array.isArray(pricingIn.lines) ? pricingIn.lines : ownPricing.lines,
				total_nanos: totalNanos,
				total_cents: Math.trunc(totalNanos / NANOS_PER_CENT),
				total_usd_str: String(Number((totalNanos / 1_000_000_000).toFixed(9))),
				server_tool_nanos: toolChargedNanos,
			},
			server_tool_charges: settled,
		},
	};
}
