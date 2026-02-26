// Two-tier pricing system: Basic (7%) and Enterprise (5%)
// Backend team tier is the source-of-truth.
// Spend values are used for progress/projection in UI.

export type GatewayTier = {
	key: string;
	name: string;
	threshold: number; // Monthly spend threshold in dollars
	feePct: number;
	description: string;
};

export const GATEWAY_TIERS: readonly GatewayTier[] = [
	{
		key: "basic",
		name: "Basic",
		threshold: 0,
		feePct: 7.0,
		description:
			"Standard pricing for all teams. Automatic Enterprise qualification after $10k in a calendar month.",
	},
	{
		key: "enterprise",
		name: "Enterprise",
		threshold: 10_000, // $10k threshold
		feePct: 5.0,
		description:
			"Premium pricing for high-volume teams with calendar-month qualification and lock-window grace.",
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
	// Two-tier specific fields
	isEnterprise: boolean;
	willUpgradeNextMonth: boolean;
	willDowngradeRisk: boolean; // True if on Enterprise but MTD < threshold
};

export function computeTierInfo({
	lastMonth,
	mtd,
	currentTierKey,
	tiers = GATEWAY_TIERS,
}: ComputeArgs): TierComputation {
	const tierCount = tiers.length;
	if (tierCount === 0) throw new Error("No tiers configured");

	const [basicTier, enterpriseTier] = tiers;
	const enterpriseThreshold = enterpriseTier.threshold;

	// Current tier: prefer backend source-of-truth when present.
	const normalizedCurrentTier = String(currentTierKey ?? "").trim().toLowerCase();
	const isEnterprise =
		normalizedCurrentTier === "enterprise"
			? true
			: normalizedCurrentTier === "basic"
				? false
				: lastMonth >= enterpriseThreshold;
	const currentIndex = isEnterprise ? 1 : 0;
	const current = tiers[currentIndex];
	const topTier = currentIndex === tierCount - 1;
	const next = topTier ? null : tiers[currentIndex + 1];

	// Projected tier is based on MTD (what next month will be)
	const willUpgradeNextMonth = mtd >= enterpriseThreshold && !isEnterprise;
	const projectedIndex = mtd >= enterpriseThreshold ? 1 : 0;
	const projected = tiers[projectedIndex];

	// Downgrade risk: on Enterprise but MTD < threshold
	const willDowngradeRisk = isEnterprise && mtd < enterpriseThreshold;

	// Savings vs Basic tier
	const baseFee = basicTier.feePct;
	const savingVsBase = Math.max(0, baseFee - current.feePct);
	const projectedSavings =
		savingVsBase > 0 ? Math.max(0, (mtd * savingVsBase) / 100) : 0;
	const nextDiscountDelta =
		!topTier && next ? Math.max(0, current.feePct - next.feePct) : 0;

	// Progress toward Enterprise tier (if on Basic)
	const remainingToNext = !topTier && next ? Math.max(next.threshold - mtd, 0) : 0;

	return {
		currentIndex,
		current,
		next,
		topTier,
		remainingToNext,
		savingVsBase,
		projectedSavings,
		nextDiscountDelta,
		projectedIndex,
		projected,
		isEnterprise,
		willUpgradeNextMonth,
		willDowngradeRisk,
	};
}
