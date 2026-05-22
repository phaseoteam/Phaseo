import Link from "next/link";
import {
	AlertTriangle,
	Ban,
	CheckCircle2,
	CircleSlash,
	Clock3,
	FlaskConical,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import ProviderInfoHoverIcons from "@/components/(data)/model/ProviderInfoHoverIcons";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import {
	groupProviders,
	type GroupedProvider,
	type ProviderStateKey,
} from "./providerAvailability";

function getStatusUi(statusKey: ProviderStateKey): {
	icon: typeof CheckCircle2;
	badgeClassName: string;
} {
	switch (statusKey) {
		case "active":
			return {
				icon: CheckCircle2,
				badgeClassName:
					"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
			};
		case "deranked_lvl1":
		case "deranked_lvl2":
		case "deranked_lvl3":
			return {
				icon: AlertTriangle,
				badgeClassName:
					"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
			};
		case "internal_testing":
			return {
				icon: FlaskConical,
				badgeClassName:
					"border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300",
			};
		case "preview_only":
		case "scheduled":
		case "coming_soon":
			return {
				icon: Clock3,
				badgeClassName:
					"border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300",
			};
		case "provider_not_ready":
			return {
				icon: AlertTriangle,
				badgeClassName:
					"border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300",
			};
		case "provider_disabled":
		case "model_disabled":
		case "capability_disabled":
			return {
				icon: Ban,
				badgeClassName:
					"border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300",
			};
		default:
			return {
				icon: CircleSlash,
				badgeClassName:
					"border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300",
			};
	}
}

function renderAvailabilitySummary(group: GroupedProvider): string {
	const parts: string[] = [];
	if (group.activeEndpointCount > 0) {
		parts.push(
			`${group.activeEndpointCount} active endpoint${group.activeEndpointCount === 1 ? "" : "s"}`,
		);
	}
	if (group.comingSoonEndpointCount > 0) {
		parts.push(
			`${group.comingSoonEndpointCount} preview endpoint${group.comingSoonEndpointCount === 1 ? "" : "s"}`,
		);
	}
	if (group.inactiveEndpointCount > 0) {
		parts.push(
			`${group.inactiveEndpointCount} unavailable endpoint${group.inactiveEndpointCount === 1 ? "" : "s"}`,
		);
	}
	return parts.join(" | ");
}

export default function Providers({ metadata }: { metadata: ModelGatewayMetadata }) {
	const providers = groupProviders(metadata);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">Provider Availability</CardTitle>
			</CardHeader>
			<CardContent>
				{providers.length > 0 ? (
					<div className="grid gap-3 md:grid-cols-2">
						{providers.map((provider) => {
							return (
								<div
									key={provider.providerId}
									className="rounded-lg border border-slate-200/80 p-3 dark:border-slate-800/90"
								>
									<div className="flex items-center justify-between gap-3">
										<div className="flex min-w-0 items-center gap-2.5">
											<Link
												href={`/api-providers/${provider.providerId}`}
												className="group"
											>
												<div className="relative flex h-8 w-8 items-center justify-center rounded-lg border">
													<div className="relative h-5 w-5">
														<Logo
															id={provider.logoProviderId}
															alt={`${provider.providerName} logo`}
															fill
															className="object-contain transition group-hover:opacity-80"
														/>
													</div>
												</div>
											</Link>
										<div className="min-w-0">
											<Link
												href={`/api-providers/${provider.providerId}`}
												className="truncate text-sm font-medium transition-colors hover:text-primary"
											>
													{provider.providerName}
												</Link>
											<p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
												{provider.providerId}
											</p>
										</div>
									</div>

										<Badge
											variant="outline"
											className={getStatusUi(provider.state.key).badgeClassName}
										>
											<span className="inline-flex items-center gap-1">
												{(() => {
													const StatusIcon = getStatusUi(provider.state.key).icon;
													return <StatusIcon className="h-3 w-3" />;
												})()}
												{provider.state.label}
											</span>
										</Badge>
									</div>

									<div className="mt-3 space-y-2">
										<p className="text-[11px] text-muted-foreground">
											{provider.state.description}
										</p>
										<div className="flex items-center justify-between gap-2">
											<p className="text-[11px] text-muted-foreground">
												{renderAvailabilitySummary(provider) ||
													`${provider.endpoints.size} endpoint${provider.endpoints.size === 1 ? "" : "s"}`}
											</p>
											<ProviderInfoHoverIcons
												providerId={provider.providerId}
												providerModelSlugs={Array.from(provider.modelSlugs)}
												quantizationScheme={provider.quantizationScheme}
												promptTraining={provider.promptTraining}
												residency={provider.residency}
												pricingPolicy={{
													regionalPricingMode: provider.regionalPricingMode,
													regionalPricingUpliftPercent:
														provider.regionalPricingUpliftPercent,
													notes: provider.regionalPricingNotes,
													sourceUrl: provider.pricingSourceUrl,
												}}
											/>
										</div>
										<p className="text-[11px] text-muted-foreground">
											{provider.endpoints.size} endpoint
											{provider.endpoints.size === 1 ? "" : "s"} in catalog
										</p>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						No provider mappings are listed for this model yet.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
