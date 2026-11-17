import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
import { cn } from "@/lib/utils";
import { isSelectableServiceTier } from "./providerRoutePresentation";

const tierBadgeBackgrounds: Record<string, string> = {
	priority: "bg-violet-100 dark:bg-violet-950",
	ultrafast: "bg-fuchsia-100 dark:bg-fuchsia-950",
	flex: "bg-sky-100 dark:bg-sky-950",
	batch: "bg-orange-100 dark:bg-orange-950",
	free: "bg-emerald-100 dark:bg-emerald-950",
};

const SERVICE_TIER_LABELS: Record<string, string> = {
	standard: "Standard",
	fast: "Fast",
	priority: "Fast",
	ultrafast: "Ultrafast",
	flex: "Flex",
	batch: "Batch",
	free: "Free",
};

/** The badge text and its tooltip. When the provider uses its own name, the tooltip says which of our tiers it is. */
export function getServiceTierBadgeText(plan: string, providerLabel?: string | null): { label: string; tooltip: string } {
	const normalizedPlan = String(plan ?? "").trim().toLowerCase() || "standard";
	const visualPlan = normalizedPlan === "fast" ? "priority" : normalizedPlan;
	const genericLabel =
		SERVICE_TIER_LABELS[normalizedPlan] ??
		normalizedPlan.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
	const ownLabel = providerLabel?.trim() || null;
	const label = ownLabel || genericLabel;
	const note =
		ownLabel && ownLabel.toLowerCase() !== genericLabel.toLowerCase()
			? `${ownLabel} is this provider's name for its ${genericLabel} tier${visualPlan === "priority" ? ", a faster endpoint for this model" : ""}. `
			: "";
	const tooltip = normalizedPlan === "batch"
		? `${note}Batch is not used for ordinary requests. Submit requests through the Batch API to use this tier.`
		: `${note}${note ? "It" : label} requires explicit selection in your request or a route dedicated to this tier. It is not selected automatically.`;
	return { label, tooltip };
}

export function ServiceTierBadge({
	plan,
	label: labelOverride,
	className,
	showTooltip = true,
}: {
	plan: string;
	/** Provider-specific tier name, e.g. "Highspeed"; falls back to the generic name. */
	label?: string | null;
	className?: string;
	showTooltip?: boolean;
}) {
	const normalizedPlan = String(plan ?? "").trim().toLowerCase() || "standard";
	if (normalizedPlan === "standard") return null;

	const visualPlan = normalizedPlan === "fast" ? "priority" : normalizedPlan;
	const tier = getTierFilterMeta(visualPlan);
	const { label, tooltip } = getServiceTierBadgeText(normalizedPlan, labelOverride);
	const badge = (
		<Badge
			variant="secondary"
			className={cn(
				"h-4 rounded-sm border-0 px-1.5 py-0 text-[10px] leading-none",
				tierBadgeBackgrounds[visualPlan] ?? "bg-muted",
				tier.iconClassName,
				className,
			)}
		>
			{label}
		</Badge>
	);

	if (!showTooltip || !isSelectableServiceTier(visualPlan)) return badge;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					tabIndex={0}
					aria-label={`${label} service tier information`}
					className="inline-flex cursor-help rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") event.stopPropagation();
					}}
				>
					{badge}
				</span>
			</TooltipTrigger>
			<TooltipContent className="max-w-64 whitespace-normal leading-relaxed">
				{tooltip}
			</TooltipContent>
		</Tooltip>
	);
}
