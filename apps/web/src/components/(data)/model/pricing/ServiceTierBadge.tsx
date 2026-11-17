import { Badge } from "@/components/ui/badge";
import { useTranslations } from "@/i18n/react";
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
type TierCopy = (key: "serviceTierProviderName" | "serviceTierProviderNameFaster" | "serviceTierExplicit" | "serviceTierExplicitFollowUp" | "serviceTierBatch", values?: Record<string, string>) => string;

export function getServiceTierBadgeText(plan: string, providerLabel: string | null | undefined, t: TierCopy): { label: string; tooltip: string } {
	const normalizedPlan = String(plan ?? "").trim().toLowerCase() || "standard";
	const visualPlan = normalizedPlan === "fast" ? "priority" : normalizedPlan;
	const genericLabel =
		SERVICE_TIER_LABELS[normalizedPlan] ??
		normalizedPlan.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
	const ownLabel = providerLabel?.trim() || null;
	const label = ownLabel || genericLabel;
	const note =
		ownLabel && ownLabel.toLowerCase() !== genericLabel.toLowerCase()
			? t(visualPlan === "priority" ? "serviceTierProviderNameFaster" : "serviceTierProviderName", { name: ownLabel, tier: genericLabel })
			: null;
	const rest = normalizedPlan === "batch"
		? t("serviceTierBatch")
		: note
			? t("serviceTierExplicitFollowUp")
			: t("serviceTierExplicit", { tier: label });
	return { label, tooltip: note ? `${note} ${rest}` : rest };
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
	const tCard = useTranslations("Catalogue.hoverCards");
	const normalizedPlan = String(plan ?? "").trim().toLowerCase() || "standard";
	if (normalizedPlan === "standard") return null;

	const visualPlan = normalizedPlan === "fast" ? "priority" : normalizedPlan;
	const tier = getTierFilterMeta(visualPlan);
	const { label, tooltip } = getServiceTierBadgeText(normalizedPlan, labelOverride, (key, values) => tCard(key as never, values as never));
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
					aria-label={tCard("serviceTierInfo" as never, { tier: label } as never)}
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
