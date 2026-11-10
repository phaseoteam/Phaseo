import { RefreshCw, ZapOff } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Link } from "@/i18n/navigation";
import type { ProviderRoutingStatus } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import { cn } from "@/lib/utils";

export type LiveRoutingState = "limited" | "recovering";

// The breaker only acts on routes the gateway actually routes; on any other status it is noise.
const ROUTED_STATUSES = new Set(["active", "deranked"]);

/**
 * The live breaker state for a provider row, separate from its catalogue status: an open
 * breaker ("limited") or one being retested ("recovering"). Null when routing is normal.
 */
export function liveRoutingState(
	routingStatus: ProviderRoutingStatus | null | undefined,
	statusKey: string,
): LiveRoutingState | null {
	if (!routingStatus || !ROUTED_STATUSES.has(statusKey)) return null;
	if (routingStatus.deranked) return "limited";
	if (routingStatus.recovering) return "recovering";
	return null;
}

const LIVE_ROUTING_ICONS = {
	limited: { icon: ZapOff, className: "text-orange-600 dark:text-orange-500" },
	recovering: { icon: RefreshCw, className: "text-sky-500 dark:text-sky-400" },
} as const;

export function useLiveRouting(routingStatus: ProviderRoutingStatus | null | undefined, statusKey: string) {
	const t = useTranslations("Catalogue.modelDetail.sections");
	const state = liveRoutingState(routingStatus, statusKey);
	if (!state || !routingStatus) return null;
	return {
		state,
		...LIVE_ROUTING_ICONS[state],
		label: state === "limited" ? t("routingHealthLimited") : t("routingHealthRecovering"),
		description: state === "limited"
			? t("routingHealthLimitedDescription", { count: routingStatus.openCount })
			: t("routingHealthRecoveringDescription", { count: routingStatus.halfOpenCount }),
		automatic: t("routingHealthAutomatic"),
		ariaLabel: t("liveRoutingStatus", {
			status: state === "limited" ? t("routingHealthLimited") : t("routingHealthRecovering"),
		}),
	};
}

/** The icon after a provider's status icon, shown only while its breaker is open or retesting. */
export function ProviderLiveRoutingIndicator({
	routingStatus,
	statusKey,
	docsHref,
	docsLabel,
	size = "md",
}: {
	routingStatus: ProviderRoutingStatus | null | undefined;
	statusKey: string;
	docsHref: string;
	docsLabel: string;
	size?: "sm" | "md";
}) {
	const live = useLiveRouting(routingStatus, statusKey);
	if (!live) return null;
	const Icon = live.icon;
	return (
		<HoverCard openDelay={120} closeDelay={80}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					aria-label={live.ariaLabel}
					data-live-routing={live.state}
					className={cn(
						"inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
						size === "sm" ? "h-5 w-5" : "h-6 w-6",
					)}
				>
					<Icon className={cn("h-3 w-3", live.className)} aria-hidden />
				</button>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-72 p-2 text-xs">
				<p className="flex items-center gap-1.5 font-semibold">
					<Icon className={cn("h-3 w-3", live.className)} aria-hidden />
					{live.label}
				</p>
				<p className="mt-1">{live.description}</p>
				<p className="mt-1 text-muted-foreground">{live.automatic}</p>
				<div className="mt-2 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
					<Link
						href={docsHref}
						target="_blank"
						rel="noopener noreferrer"
						className="text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
					>
						{docsLabel}
					</Link>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
