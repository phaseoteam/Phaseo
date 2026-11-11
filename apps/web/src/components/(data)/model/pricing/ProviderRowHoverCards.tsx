import React from "react";
import {
	AlertTriangle,
	ArrowUpRight,
	Ban,
	CheckCircle2,
	Clock3,
	FlaskConical,
	KeyRound,
	ShieldBan,
	XCircle,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "@/i18n/react";
import { getLocalizedDocsHref } from "@/lib/docs";
import { TAP_TARGET_20, TAP_TARGET_24 } from "@/lib/tapTargets";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	HoverCard,
	HoverCardContent,
	HoverCardHeader,
	HoverCardLinks,
	HoverCardNote,
	HoverCardRows,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { CanonicalGatewayStatus } from "@/components/(data)/model/pricing/providerGatewayStatus";
import {
	summarizeProviderLifecycle,
	type ProviderLifecycleStatusInput,
} from "@/components/(data)/model/pricing/providerLifecycleStatus";

export const PROVIDER_STATUSES_DOCS_HREF = "https://phaseo.app/docs/v1/guides/provider-statuses";

export const PROVIDER_STATUS_META: Record<
	CanonicalGatewayStatus,
	{
		label: string;
		icon: React.ElementType;
		iconClass: string;
		description: string;
	}
> = {
	active: {
		label: "Active",
		icon: CheckCircle2,
		iconClass: "text-green-600",
		description: "Available.",
	},
	coming_soon: {
		label: "Coming Soon",
		icon: Clock3,
		iconClass: "text-blue-600",
		description: "Not active yet.",
	},
	external: {
		label: "External",
		icon: ArrowUpRight,
		iconClass: "text-violet-600",
		description: "Listed from an external catalogue; routing requires an explicit provider-level override.",
	},
	internal_testing: {
		label: "Internal Testing",
		icon: FlaskConical,
		iconClass: "text-sky-600",
		description: "Visible to admins only while this provider/model capability is being tested.",
	},
	deranked: {
		label: "Lower priority",
		icon: AlertTriangle,
		iconClass: "text-amber-600",
		description: "Set by Phaseo. Used only as a backup when the other providers fail.",
	},
	inactive: {
		label: "Not Active",
		icon: XCircle,
		iconClass: "text-zinc-500",
		description: "Not available.",
	},
	disabled: {
		label: "Disabled",
		icon: Ban,
		iconClass: "text-red-600",
		description: "Explicitly disabled and not routable.",
	},
	not_listed: {
		label: "Not Active",
		icon: XCircle,
		iconClass: "text-zinc-500",
		description: "Not available.",
	},
};

/** Message keys (in Catalogue.modelDetail.providerTable) for each status. */
export const PROVIDER_STATUS_TRANSLATION_KEYS: Record<
	CanonicalGatewayStatus,
	{ label: string; description: string }
> = {
	active: { label: "statuses.active", description: "statusDescriptions.active" },
	coming_soon: { label: "statuses.comingSoon", description: "statusDescriptions.comingSoon" },
	external: { label: "statuses.external", description: "statusDescriptions.external" },
	internal_testing: { label: "statuses.internalTesting", description: "statusDescriptions.internalTesting" },
	deranked: { label: "statuses.rateLimited", description: "statusDescriptions.rateLimited" },
	inactive: { label: "statuses.inactive", description: "statusDescriptions.inactive" },
	disabled: { label: "statuses.disabled", description: "statusDescriptions.disabled" },
	not_listed: { label: "statuses.inactive", description: "statusDescriptions.inactive" },
};

const ICON_TRIGGER_CLASS =
	"inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/** The earliest future end date among the routes, if any. */
export function getEarliestEffectiveTo(
	providerModels: ReadonlyArray<{ effective_to?: string | null }>,
	nowMs: number,
): string | null {
	return (
		providerModels
			.map((providerModel) => providerModel.effective_to)
			.filter((value): value is string => Boolean(value) && new Date(value!).getTime() > nowMs)
			.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null
	);
}

export function useProviderStatusLabels(statusKey: CanonicalGatewayStatus) {
	const tProvider = useTranslations("Catalogue.modelDetail.providerTable");
	const keys = PROVIDER_STATUS_TRANSLATION_KEYS[statusKey] ?? PROVIDER_STATUS_TRANSLATION_KEYS.not_listed;
	return {
		label: tProvider(keys.label as never),
		description: tProvider(keys.description as never),
	};
}

/**
 * A provider route's status icon and its card: the status as the header, the
 * service tier and end date as the meta line, then the provider's availability,
 * Phaseo's integration and the access scope as rows.
 */
export function ProviderStatusHoverCard({
	statusKey,
	providerModels,
	planLabel,
	endsOn,
	size = "md",
	side,
	align = "start",
}: {
	statusKey: CanonicalGatewayStatus;
	providerModels: ProviderLifecycleStatusInput[];
	/** The service tier's display name, such as "Standard". */
	planLabel?: string | null;
	/** The formatted date the route stops being offered. */
	endsOn?: string | null;
	size?: "sm" | "md";
	side?: "top" | "bottom";
	align?: "start" | "center" | "end";
}) {
	const tProvider = useTranslations("Catalogue.modelDetail.providerTable");
	const tSections = useTranslations("Catalogue.modelDetail.sections");
	const tCard = useTranslations("Catalogue.hoverCards");
	const locale = useLocale();
	const meta = PROVIDER_STATUS_META[statusKey] ?? PROVIDER_STATUS_META.not_listed;
	const { label, description } = useProviderStatusLabels(statusKey);
	const lifecycle = summarizeProviderLifecycle(providerModels);
	const Icon = meta.icon;
	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				<button
					type="button"
					aria-label={tProvider("providerStatus", { status: label })}
					className={cn(ICON_TRIGGER_CLASS, size === "sm" ? cn("h-5 w-5", TAP_TARGET_20) : cn("h-6 w-6", TAP_TARGET_24))}
				>
					<Icon className={cn("h-3 w-3", meta.iconClass)} />
				</button>
			</HoverCardTrigger>
			<HoverCardContent side={side} align={align} className="w-64 space-y-2.5">
				<HoverCardHeader
					icon={<Icon className={meta.iconClass} />}
					title={label}
					meta={[
						planLabel ? tCard("tierLabel", { tier: planLabel }) : null,
						endsOn ? tCard("endsOn", { date: endsOn }) : null,
					]}
				/>
				<HoverCardNote>{description}</HoverCardNote>
				<HoverCardRows
					rows={[
						lifecycle.providerAvailability
							? {
									label: tProvider("provider"),
									value: tSections(`providerLifecycle.availability.${lifecycle.providerAvailability.key}.label` as never),
								}
							: null,
						lifecycle.phaseo
							? {
									label: "Phaseo",
									value: tSections(`providerLifecycle.phaseo.${lifecycle.phaseo.key}.label` as never),
								}
							: null,
						{
							label: tSections("access"),
							value: lifecycle.accessScope === "internal" ? tSections("internalOnly") : tSections("public"),
						},
					]}
				/>
				<HoverCardLinks>
					<Link href={getLocalizedDocsHref(locale, PROVIDER_STATUSES_DOCS_HREF)} target="_blank" rel="noopener noreferrer">
						{tCard("providerStatuses")}
					</Link>
				</HoverCardLinks>
			</HoverCardContent>
		</HoverCard>
	);
}

/** The key icon on a route that only works with the customer's own provider key. */
export function ProviderByokOnlyHoverCard({ align = "start" }: { align?: "start" | "center" | "end" }) {
	const tx = useTranslations();
	const tCard = useTranslations("Catalogue.hoverCards");
	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				<button
					type="button"
					aria-label={tx("Common.ui.providerCardCopy.bYOKOnlyRequiresYourProviderKey" as never)}
					className={cn(
						ICON_TRIGGER_CLASS,
						"h-6 w-6 text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200",
						TAP_TARGET_24,
					)}
				>
					<KeyRound className="h-3.5 w-3.5" />
				</button>
			</HoverCardTrigger>
			<HoverCardContent align={align} className="w-64 space-y-2.5">
				<HoverCardHeader
					icon={<KeyRound className="text-amber-700 dark:text-amber-300" />}
					title={tx("Common.ui.providerCardCopy.bYOKOnly" as never)}
					meta={[tCard("byokMeta")]}
				/>
				<HoverCardNote>{tCard("byokAddKey")}</HoverCardNote>
				<HoverCardLinks>
					<Link href="/settings/byok">{tCard("byokSettings")}</Link>
				</HoverCardLinks>
			</HoverCardContent>
		</HoverCard>
	);
}

export type ProviderBlockedReason = {
	key: string;
	label: string;
	href?: string | null;
	linkLabel?: string | null;
};

/**
 * The red shield on a route that the workspace's data controls or an assigned
 * guardrail rule out: the summary as an alert, then one line per reason.
 */
export function ProviderPolicyBlockedHoverCard({
	workspaceBlocked,
	reasons,
}: {
	workspaceBlocked: boolean;
	reasons: ProviderBlockedReason[];
}) {
	const tSections = useTranslations("Catalogue.modelDetail.sections");
	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				<button
					type="button"
					aria-label={workspaceBlocked ? tSections("blockedByWorkspaceDataControls") : tSections("unavailableInPhaseoChat")}
					className={cn(
						ICON_TRIGGER_CLASS,
						"h-6 w-6 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300",
						TAP_TARGET_24,
					)}
				>
					{workspaceBlocked ? <Ban className="h-3.5 w-3.5" /> : <ShieldBan className="h-3.5 w-3.5" />}
				</button>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-80 space-y-2.5">
				<Alert variant="destructive" className="rounded-md px-3 py-2 text-xs">
					{workspaceBlocked ? <Ban /> : <ShieldBan />}
					<AlertTitle>{workspaceBlocked ? tSections("workspaceBlocked") : tSections("chatUnavailable")}</AlertTitle>
					<AlertDescription className="text-xs">
						{workspaceBlocked ? tSections("workspacePrivacyPreventsProvider") : tSections("assignedGuardrailPreventsProvider")}
					</AlertDescription>
				</Alert>
				{reasons.length > 0 ? (
					<ul className="space-y-1.5 text-xs">
						{reasons.map((reason) => (
							<li key={reason.key} className="flex items-baseline justify-between gap-3">
								<span className="min-w-0 text-muted-foreground">{reason.label}</span>
								{reason.href && reason.linkLabel ? (
									<Link
										href={reason.href}
										className="shrink-0 text-foreground underline decoration-border underline-offset-2 hover:decoration-current"
									>
										{reason.linkLabel}
									</Link>
								) : null}
							</li>
						))}
					</ul>
				) : null}
			</HoverCardContent>
		</HoverCard>
	);
}
