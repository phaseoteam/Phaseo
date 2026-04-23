// Single-tier pricing model: Standard (5%).
// All workspaces use the same fee and feature set.

export type GatewayTier = {
	key: string;
	name: string;
	threshold: number; // Monthly spend threshold in dollars
	feePct: number;
	description: string;
};

export const GATEWAY_TIERS: readonly GatewayTier[] = [
	{
		key: "standard",
		name: "Standard",
		threshold: 0,
		feePct: 5.0,
		description: "Single-plan pricing for every workspace.",
	},
] as const;

export type ComputeArgs = {
	lastMonth: number; // previous month total (currency units)
	mtd: number; // month-to-date total (currency units)
	currentTierKey?: string | null; // optional source-of-truth tier from backend
	tiers?: readonly GatewayTier[]; // optional override
};

export type TierComputation = {
	currentIndex: number;
	current: GatewayTier;
	next: GatewayTier | null;
	topTier: boolean;
	remainingToNext: number; // based on MTD
	savingVsBase: number;
	projectedSavings: number;
	nextDiscountDelta: number;
	projectedIndex: number;
	projected: GatewayTier;
	// Legacy compatibility fields (always false in single-tier mode)
	isEnterprise: boolean;
	willUpgradeNextMonth: boolean;
	willDowngradeRisk: boolean;
};

export function computeTierInfo({
	lastMonth: _lastMonth,
	mtd: _mtd,
	currentTierKey: _currentTierKey,
	tiers = GATEWAY_TIERS,
}: ComputeArgs): TierComputation {
	const current = tiers[0];
	if (!current) throw new Error("No tiers configured");

	return {
		currentIndex: 0,
		current,
		next: null,
		topTier: true,
		remainingToNext: 0,
		savingVsBase: 0,
		projectedSavings: 0,
		nextDiscountDelta: 0,
		projectedIndex: 0,
		projected: current,
		isEnterprise: false,
		willUpgradeNextMonth: false,
		willDowngradeRisk: false,
	};
}
