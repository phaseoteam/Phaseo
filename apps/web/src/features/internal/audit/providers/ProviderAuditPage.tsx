import Link from "@/components/link";
import { useSearch } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslations } from "@/i18n/react";
import { getTranslations } from "@/i18n/server";
import { providerAuditQuery } from "../../internalAdmin.functions";

export async function getProviderAuditMetadata() {
	const t = await getTranslations("Product.internalTools.dataAudit");
	return { title: t("providerTitle") };
}

type SearchParams = {
	q?: string;
	provider?: string;
	gaps?: string;
	state?: string;
};

function normalizeBool(value: string | undefined): boolean {
	if (!value) return false;
	const normalized = value.toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeStateFilter(value: string | undefined): "" | "active" | "preview" | "not_routable" {
	if (!value) return "";
	if (value === "active" || value === "preview" || value === "not_routable") return value;
	return "";
}

function badgeClassNameForAvailability(
	availability: "active" | "coming_soon" | "inactive"
): string {
	if (availability === "active") {
		return "border-green-200 bg-green-50 text-green-700";
	}
	if (availability === "coming_soon") {
		return "border-blue-200 bg-blue-50 text-blue-700";
	}
	return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function formatStatus(value: string | null, notSetLabel: string): string {
	if (!value) return notSetLabel;
	return value
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

// Base UI Select does not handle "" as an item value, so "All" options use a sentinel.
const ALL_SELECT_VALUE = "__all__";

// The admin gate (requireInternalAdmin("/internal")) runs in the route's
// beforeLoad; the server function re-checks it before returning audit data.
export default function ProviderAuditPage() {
	const t = useTranslations("Product.internalTools.dataAudit");
	const tStates = useTranslations("Catalogue.models.detail.quickstart.providerStates");
	const params = useSearch({ from: "/{-$locale}/_dashboard/internal/audit/providers/" }) as SearchParams;

	const { data: audit } = useSuspenseQuery(providerAuditQuery());

	const query = (params.q ?? "").trim().toLowerCase();
	const selectedProvider = (params.provider ?? "").trim();
	const onlyGaps = normalizeBool(params.gaps);
	const selectedState = normalizeStateFilter(params.state);
	const [providerFilter, setProviderFilter] = useState(selectedProvider);
	const [stateFilter, setStateFilter] = useState<string>(selectedState);
	const [gapsFilter, setGapsFilter] = useState(onlyGaps);

	const providerOptions = audit.providers.map((provider) => ({
		providerId: provider.providerId,
		providerName: provider.providerName,
	}));

	const filteredProviders = audit.providers
		.map((provider) => {
			if (selectedProvider && provider.providerId !== selectedProvider) {
				return null;
			}

			const providerMatchesQuery = query.length > 0 &&
				(`${provider.providerName} ${provider.providerId}`).toLowerCase().includes(query);

			let rows = provider.rows;
			if (query && !providerMatchesQuery) {
				rows = rows.filter((row) => {
					const haystack = [
						row.apiModelId,
						row.internalModelId ?? "",
						row.providerModelSlug ?? "",
						row.capabilities.join(" "),
						row.gapReason ?? "",
						row.routability.label,
						row.routability.detail,
						row.routability.key,
						row.providerAvailabilityStatus ?? "",
						row.phaseoStatus ?? "",
						row.accessScope ?? "",
					]
						.join(" ")
						.toLowerCase();
					return haystack.includes(query);
				});
			}

			if (selectedState === "active") {
				rows = rows.filter((row) => row.isGatewayActiveNow);
			} else if (selectedState === "preview") {
				rows = rows.filter((row) => row.routability.availability === "coming_soon");
			} else if (selectedState === "not_routable") {
				rows = rows.filter(
					(row) =>
						!row.isGatewayActiveNow &&
						row.routability.availability !== "coming_soon"
				);
			}

			if (onlyGaps) {
				rows = rows.filter((row) => row.isGatewayActiveNow && !row.hasPricing);
			}

			if (rows.length === 0) return null;

			const activeGatewayModels = rows.filter((row) => row.isGatewayActiveNow).length;
			const previewGatewayModels = rows.filter(
				(row) => row.routability.availability === "coming_soon"
			).length;
			const inactiveGatewayModels = rows.filter(
				(row) => row.routability.availability === "inactive"
			).length;
			const modelsWithPricing = rows.filter((row) => row.hasPricing).length;
			const activeWithoutPricing = rows.filter((row) => row.isGatewayActiveNow && !row.hasPricing).length;

			return {
				...provider,
				rows,
				totalModels: rows.length,
				activeGatewayModels,
				previewGatewayModels,
				inactiveGatewayModels,
				modelsWithPricing,
				activeWithoutPricing,
			};
		})
		.filter((provider): provider is NonNullable<typeof provider> => Boolean(provider));

	const filteredSummary = {
		totalProviders: filteredProviders.length,
		totalModels: filteredProviders.reduce((sum, provider) => sum + provider.totalModels, 0),
		activeGatewayModels: filteredProviders.reduce((sum, provider) => sum + provider.activeGatewayModels, 0),
		previewGatewayModels: filteredProviders.reduce((sum, provider) => sum + provider.previewGatewayModels, 0),
		inactiveGatewayModels: filteredProviders.reduce((sum, provider) => sum + provider.inactiveGatewayModels, 0),
		activeWithoutPricing: filteredProviders.reduce((sum, provider) => sum + provider.activeWithoutPricing, 0),
	};

	const filteredAlerts = filteredProviders
		.filter((provider) => provider.activeWithoutPricing > 0)
		.map((provider) => ({
			providerId: provider.providerId,
			providerName: provider.providerName,
			count: provider.activeWithoutPricing,
			models: provider.rows
				.filter((row) => row.isGatewayActiveNow && !row.hasPricing)
				.map((row) => row.apiModelId),
		}))
		.sort((a, b) => b.count - a.count);
	const translateGapReason = (reason: string) => {
		if (reason === "No pricing rules found") return t("gapReasons.noPricingRules");
		if (reason === "Pricing rules missing effective_from") return t("gapReasons.missingEffectiveFrom");
		if (reason === "Pricing rules are future dated") return t("gapReasons.futureDated");
		if (reason === "All pricing rules expired") return t("gapReasons.allExpired");
		if (reason === "Some pricing rules are missing effective_from") return t("gapReasons.someMissingEffectiveFrom");
		if (reason === "No active pricing window (rules expired)") return t("gapReasons.expiredWindow");
		if (reason === "No active pricing window") return t("gapReasons.noActiveWindow");

		const pricingStart = reason.match(/^Pricing starts on (.+)$/);
		if (pricingStart) return t("gapReasons.pricingStartsOn", { date: pricingStart[1] });
		const nextPricingStart = reason.match(/^No active pricing yet \(next start (.+)\)$/);
		if (nextPricingStart) return t("gapReasons.noActivePricingYet", { date: nextPricingStart[1] });
		return t("gapReasons.noActiveWindow");
	};

	return (
		<div className="mx-8 py-8 space-y-6">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<h1 className="text-2xl font-semibold">{t("providerTitle")}</h1>
					<p className="text-sm text-muted-foreground">
						{t("providerDescription")}
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row">
					<Link
						href="/internal/audit"
						className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
					>
						{t("openModelAudit")}
					</Link>
					<Link
						href="/internal/data"
						className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
					>
						{t("openDataEditor")}
					</Link>
				</div>
			</div>

			<form action="/internal/audit/providers" method="get" className="rounded-lg border p-4">
				<div className="grid gap-3 lg:grid-cols-4">
					<Input
						name="q"
						defaultValue={params.q ?? ""}
						placeholder={t("searchPlaceholder")}
						className="h-9 lg:col-span-2"
					/>
					<div>
						<Select
							value={providerFilter || ALL_SELECT_VALUE}
							onValueChange={(value) => setProviderFilter(value === ALL_SELECT_VALUE ? "" : value)}
						>
							<SelectTrigger className="h-9 w-full" aria-label={t("allProviders")}>
								<SelectValue>
									{providerOptions.find((option) => option.providerId === providerFilter)?.providerName ??
										(providerFilter || t("allProviders"))}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_SELECT_VALUE}>{t("allProviders")}</SelectItem>
								{providerOptions.map((option) => (
									<SelectItem key={option.providerId} value={option.providerId}>
										{option.providerName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<input type="hidden" name="provider" value={providerFilter} />
					</div>
					<div>
						<Select
							value={stateFilter || ALL_SELECT_VALUE}
							onValueChange={(value) => setStateFilter(value === ALL_SELECT_VALUE ? "" : value)}
						>
							<SelectTrigger className="h-9 w-full" aria-label={t("allRoutabilityStates")}>
								<SelectValue>
									{stateFilter === "active"
										? t("routableNow")
										: stateFilter === "preview"
											? t("previewScheduled")
											: stateFilter === "not_routable"
												? t("notRoutable")
												: t("allRoutabilityStates")}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_SELECT_VALUE}>{t("allRoutabilityStates")}</SelectItem>
								<SelectItem value="active">{t("routableNow")}</SelectItem>
								<SelectItem value="preview">{t("previewScheduled")}</SelectItem>
								<SelectItem value="not_routable">{t("notRoutable")}</SelectItem>
							</SelectContent>
						</Select>
						<input type="hidden" name="state" value={stateFilter} />
					</div>
					<label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
						<Checkbox checked={gapsFilter} onCheckedChange={(checked) => setGapsFilter(checked === true)} />
						{gapsFilter ? <input type="hidden" name="gaps" value="1" /> : null}
						{t("onlyActiveGaps")}
					</label>
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
					<Button type="submit" className="h-9">
						{t("apply")}
					</Button>
					<Link href="/internal/audit/providers" className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
						{t("clear")}
					</Link>
				</div>
			</form>

			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<div className="rounded-md border px-4 py-3">
					<div className="text-xs text-muted-foreground">{t("providers")}</div>
					<div className="text-2xl font-semibold">{filteredSummary.totalProviders}</div>
				</div>
				<div className="rounded-md border px-4 py-3">
					<div className="text-xs text-muted-foreground">{t("providerModels")}</div>
					<div className="text-2xl font-semibold">{filteredSummary.totalModels}</div>
				</div>
				<div className="rounded-md border px-4 py-3">
					<div className="text-xs text-muted-foreground">{t("gatewayActiveNow")}</div>
					<div className="text-2xl font-semibold">{filteredSummary.activeGatewayModels}</div>
				</div>
				<div className="rounded-md border border-blue-200 px-4 py-3">
					<div className="text-xs text-muted-foreground">{t("previewScheduledCount")}</div>
					<div className="text-2xl font-semibold text-blue-700">{filteredSummary.previewGatewayModels}</div>
				</div>
				<div className="rounded-md border px-4 py-3">
					<div className="text-xs text-muted-foreground">{t("notRoutableCount")}</div>
					<div className="text-2xl font-semibold">{filteredSummary.inactiveGatewayModels}</div>
				</div>
				<div className="rounded-md border border-red-200 px-4 py-3">
					<div className="text-xs text-muted-foreground">{t("activeWithoutPricing")}</div>
					<div className="text-2xl font-semibold text-red-700">{filteredSummary.activeWithoutPricing}</div>
				</div>
			</div>

			{filteredAlerts.length > 0 ? (
				<div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
					<div className="text-sm font-medium text-red-700">
						{t("pricingGapsAlert", { count: filteredAlerts.reduce((sum, alert) => sum + alert.count, 0) })}
					</div>
					<div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
						{filteredAlerts.map((alert) => (
							<Link
								key={alert.providerId}
								href={`/internal/audit/providers?provider=${encodeURIComponent(alert.providerId)}&gaps=1`}
								className="rounded border border-red-200 bg-white px-3 py-2 text-sm hover:bg-red-50"
							>
								<div className="font-medium">{alert.providerName}</div>
								<div className="text-xs text-muted-foreground">
									{t(alert.count === 1 ? "gapCountOne" : "gapCountMany", { count: alert.count })}
								</div>
							</Link>
						))}
					</div>
				</div>
			) : (
				<div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
					{t("noPricingGaps")}
				</div>
			)}

			{filteredProviders.length === 0 ? (
				<div className="rounded-md border px-4 py-6 text-sm text-muted-foreground">
					{t("noProviderMatches")}
				</div>
			) : (
				filteredProviders.map((provider) => (
					<section key={provider.providerId} className="rounded-lg border">
						<div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
							<div>
								<h2 className="text-lg font-semibold">{provider.providerName}</h2>
								<div className="font-mono text-xs text-muted-foreground">{provider.providerId}</div>
							</div>
							<div className="flex flex-wrap gap-2 text-xs">
								<span className="rounded border px-2 py-1">{t("modelsCount", { count: provider.totalModels })}</span>
								<span className="rounded border px-2 py-1">{t("activeNowCount", { count: provider.activeGatewayModels })}</span>
								<span className="rounded border border-blue-200 px-2 py-1 text-blue-700">
									{t("previewCount", { count: provider.previewGatewayModels })}
								</span>
								<span className="rounded border px-2 py-1">
									{t("notRoutableWithCount", { count: provider.inactiveGatewayModels })}
								</span>
								<span className="rounded border px-2 py-1">{t("withPricingCount", { count: provider.modelsWithPricing })}</span>
								<span className="rounded border border-red-200 px-2 py-1 text-red-700">
									{t("activeGapsCount", { count: provider.activeWithoutPricing })}
								</span>
							</div>
						</div>
						<div className="overflow-x-auto">
							<Table wrapInContainer={false} className="min-w-[1120px]">
								<TableHeader className="bg-muted/40 text-left [&_tr]:border-b-0">
									<TableRow className="hover:bg-transparent dark:hover:bg-transparent">
										<TableHead className="h-auto px-3 py-2 font-semibold text-foreground dark:text-foreground">{t("apiModelId")}</TableHead>
										<TableHead className="h-auto px-3 py-2 font-semibold text-foreground dark:text-foreground">{t("internalModelId")}</TableHead>
										<TableHead className="h-auto px-3 py-2 font-semibold text-foreground dark:text-foreground">{t("providerSlug")}</TableHead>
										<TableHead className="h-auto px-3 py-2 font-semibold text-foreground dark:text-foreground">{t("lifecycle")}</TableHead>
										<TableHead className="h-auto px-3 py-2 font-semibold text-foreground dark:text-foreground">{t("routability")}</TableHead>
										<TableHead className="h-auto px-3 py-2 font-semibold text-foreground dark:text-foreground">{t("pricingRules")}</TableHead>
										<TableHead className="h-auto px-3 py-2 font-semibold text-foreground dark:text-foreground">{t("capabilities")}</TableHead>
										<TableHead className="h-auto px-3 py-2 font-semibold text-foreground dark:text-foreground">{t("actions")}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{provider.rows.map((row) => {
										const isGap = row.isGatewayActiveNow && !row.hasPricing;
										return (
											<TableRow key={`${provider.providerId}:${row.apiModelId}`} className={isGap ? "border-b-0 bg-red-50" : "border-b-0"}>
												<TableCell className="border-t px-3 py-2 font-mono text-xs">{row.apiModelId}</TableCell>
												<TableCell className="border-t px-3 py-2 font-mono text-xs">
													{row.internalModelId ?? "-"}
												</TableCell>
												<TableCell className="border-t px-3 py-2 font-mono text-xs">
													{row.providerModelSlug ?? "-"}
												</TableCell>
												<TableCell className="border-t px-3 py-2 text-xs">
										<div><span className="text-muted-foreground">{t("providerField")}:</span> {formatStatus(row.providerAvailabilityStatus, t("notSet"))}</div>
										<div><span className="text-muted-foreground">{t("phaseoField")}:</span> {formatStatus(row.phaseoStatus, t("notSet"))}</div>
										<div><span className="text-muted-foreground">{t("accessField")}:</span> {formatStatus(row.accessScope, t("notSet"))}</div>
												</TableCell>
												<TableCell className="border-t px-3 py-2">
													<div className="space-y-1">
														<span
															className={`inline-flex rounded border px-2 py-1 text-xs ${badgeClassNameForAvailability(
																row.routability.availability
															)}`}
														>
											{tStates(`${row.routability.key}.label` as never)}
														</span>
														<div className="text-xs text-muted-foreground">
											{tStates(`${row.routability.key}.description` as never)}
														</div>
													</div>
												</TableCell>
												<TableCell className="border-t px-3 py-2">
													<div className="flex items-center gap-2">
														<span className={row.hasPricing ? "text-green-700" : "text-red-700"}>
															{row.pricingRulesCount}/{row.totalPricingRulesCount}
														</span>
														{isGap ? (
															<span className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
											{t("gap")}
															</span>
														) : null}
													</div>
								{isGap && row.gapReason ? (
									<div className="mt-1 text-xs text-red-700">{translateGapReason(row.gapReason)}</div>
													) : null}
												</TableCell>
												<TableCell className="border-t px-3 py-2">
													<div className="max-w-[340px] text-xs text-muted-foreground">
														{row.capabilities.length > 0 ? row.capabilities.join(", ") : "-"}
													</div>
												</TableCell>
												<TableCell className="border-t px-3 py-2">
													<div className="flex flex-wrap gap-2">
														<Link
															href={`/internal/data/api-providers/${provider.providerId}/edit`}
															className="rounded border px-2 py-1 text-xs hover:bg-muted/40"
														>
										{t("providerAction")}
														</Link>
														{row.internalModelId ? (
															<Link
																href={`/internal/data/models/edit/${row.internalModelId}?tab=providers&provider=${encodeURIComponent(provider.providerId)}`}
																className="rounded border px-2 py-1 text-xs hover:bg-muted/40"
															>
										{t("modelProviderAction")}
															</Link>
														) : null}
													</div>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
					</section>
				))
			)}
		</div>
	);
}
