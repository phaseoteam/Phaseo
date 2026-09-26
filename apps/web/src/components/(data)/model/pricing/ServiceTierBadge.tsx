import { Badge } from "@/components/ui/badge";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
import { cn } from "@/lib/utils";

const SERVICE_TIER_LABELS: Record<string, string> = {
	standard: "Standard",
	fast: "Fast",
	priority: "Fast",
	ultrafast: "Ultrafast",
	flex: "Flex",
	batch: "Batch",
	free: "Free",
};

export function ServiceTierBadge({
	plan,
	className,
}: {
	plan: string;
	className?: string;
}) {
	const normalizedPlan = String(plan ?? "").trim().toLowerCase() || "standard";
	const visualPlan = normalizedPlan === "fast" ? "priority" : normalizedPlan;
	const tier = getTierFilterMeta(visualPlan);
	const TierIcon = tier.icon;
	const label =
		SERVICE_TIER_LABELS[normalizedPlan] ??
		normalizedPlan.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

	return (
		<Badge
			variant="outline"
			className={cn(
				"h-5 gap-1.5 rounded-full border-current/25 bg-current/[0.06] px-2 text-[10px] font-semibold",
				tier.iconClassName,
				className,
			)}
		>
			<TierIcon aria-hidden="true" />
			{label}
		</Badge>
	);
}
