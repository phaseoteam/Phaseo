"use client";

import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
type CatalogTranslator = ReturnType<typeof useTranslations<"SettingsUI">>;
import type { ReactNode } from "react";
import { AlertTriangle, Info, Route, Server } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { AuthenticatedProviderCatalogPreview } from "@/lib/query/providerCatalogPreviews";
import { formatModelLifecycleDate } from "@/lib/dates/modelLifecycleDates";
import ModelPageToc from "./ModelPageToc";
import UnreleasedBadge from "./UnreleasedBadge";

function usePreviewCopy() {
	const t = useTranslations("SettingsUI");
	const tModel = useTranslations("Common.ui.modelCreation");
	const locale = useLocale();
	const formatDate = (value: string | null | undefined) => value ? formatModelLifecycleDate(value, locale) : t("providerCatalogCopy.notListed");
	const formatLabel = (value: string | null | undefined) => {
		const labels: Record<string, string> = {
			pending: t("identity.decision.pending"), approved: t("identity.decision.approved"), rejected: t("identity.decision.rejected"), needs_changes: t("identity.decision.needs_changes"),
			not_projected: t("identity.routeStatus.not_projected"), staged: t("identity.routeStatus.staged"), probe_passed: t("identity.routeStatus.probe_passed"), enabled: t("identity.routeStatus.enabled"), failed: t("identity.routeStatus.failed"),
			retired: t("identity.availability.retired"), deprecated: t("identity.availability.deprecated"), scheduled: t("providerCatalogCopy.scheduled"), provider_not_ready: t("identity.availability.not_ready"), provider_degraded: t("identity.availability.degraded"), endpoint_checks_failed: t("providerCatalogCopy.checksFailedLabel"), pending_endpoint_checks: t("providerCatalogCopy.checksPendingLabel"), preview_only: t("providerCatalogCopy.preview"), coming_soon: t("providerCatalogCopy.comingSoon"),
			input: t("providerCatalogCopy.input"), output: t("providerCatalogCopy.output"),
		};
		return value ? labels[value] ?? value : t("providerCatalogCopy.notListed");
	};
	const modalities = (values: string[]) => new Intl.ListFormat(locale, {type: "unit", style: "short"}).format(values.map((value) => {
		const key = value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
		return tModel.has(("modalities." + key) as never) ? tModel(("modalities." + key) as never) : value;
	}));
	const formatPrice = (priceNanos: number, unitQuantity: number) => {
		if (!Number.isFinite(priceNanos) || !Number.isFinite(unitQuantity) || unitQuantity <= 0) return t("providerCatalogCopy.notListed");
		const price = (priceNanos / 1_000_000_000) * (1_000_000 / unitQuantity);
		if (!Number.isFinite(price)) return t("providerCatalogCopy.notListed");
		return t("providerCatalogCopy.pricePerMillion", {price: new Intl.NumberFormat(locale, {style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: price >= 1 ? 2 : 4}).format(price)});
	};
	return {t, locale, formatDate, formatLabel, formatPrice, modalities};
}

function availabilityCopy(preview: AuthenticatedProviderCatalogPreview, t: CatalogTranslator, locale: string): string {
	if (preview.availability_reason === "retired") {
		return t("providerCatalogCopy.archiveDescription");
	}
	if (preview.availability_reason === "deprecated") {
		return t("providerCatalogCopy.deprecatedDescription");
	}
	if (preview.availability_reason === "scheduled") {
		return preview.available_from
			? t("providerCatalogCopy.scheduledDescription", {date: formatModelLifecycleDate(preview.available_from, locale)})
			: t("providerCatalogCopy.futureRelease");
	}
	if (preview.availability_reason === "provider_not_ready") {
		return t("providerCatalogCopy.providerNotReady");
	}
	if (preview.availability_reason === "provider_degraded") {
		return t("providerCatalogCopy.providerDegraded");
	}
	if (preview.availability_reason === "needs_changes") {
		return t("providerCatalogCopy.changesDescription");
	}
	if (preview.availability_reason === "endpoint_checks_failed") {
		return t("providerCatalogCopy.checksFailed");
	}
	if (preview.availability_reason === "pending_endpoint_checks") {
		return t("providerCatalogCopy.checksPending");
	}
	return t("providerCatalogCopy.reviewPending");
}

function testabilityCopy(preview: AuthenticatedProviderCatalogPreview, t: CatalogTranslator): string {
	if (preview.can_test) return t("providerCatalogCopy.testAllowed");
	switch (preview.test_blocked_reason) {
		case "model_not_testable":
			return t("providerCatalogCopy.testInactive");
		case "provider_endpoint_missing":
			return t("providerCatalogCopy.testEndpoint");
		case "provider_adapter_missing":
			return t("providerCatalogCopy.testAdapter");
		case "provider_credentials_missing":
			return t("providerCatalogCopy.testCredentials");
		case "route_not_staged":
			return t("providerCatalogCopy.testRouteStaged");
		default:
			return t("providerCatalogCopy.testRoute");
	}
}

export function PreviewStatusBanner({ preview }: { preview: AuthenticatedProviderCatalogPreview }) {
	const {t, locale} = usePreviewCopy();
	const isInactive = preview.availability_status === "not_active";
	return (
		<Alert
			className={isInactive
				? "mb-6 border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-50"
				: "mb-6 border-cyan-200 bg-cyan-50 text-cyan-950 dark:border-cyan-900/60 dark:bg-cyan-950/20"}
		>
			{isInactive ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
			<AlertTitle>{isInactive ? t("providerCatalogCopy.archive") : t("providerCatalogCopy.preview")}</AlertTitle>
			<AlertDescription className={isInactive ? "text-amber-900/90 dark:text-amber-100/90" : "text-cyan-900/90 dark:text-cyan-100/90"}>
				<span className="block">{availabilityCopy(preview, t, locale)}</span>
				<span className="mt-1 block">{testabilityCopy(preview, t)}</span>
			</AlertDescription>
		</Alert>
	);
}

function DetailValue({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="border-b border-border/60 py-3 first:border-t">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="mt-1 break-words text-sm font-medium">{children}</dd>
		</div>
	);
}

function matchLabel(preview: AuthenticatedProviderCatalogPreview, t: CatalogTranslator): string {
	if (preview.canonical_model_slug) {
		return preview.match_type === "alias" ? t("providerCatalogCopy.aliasMatch") : t("providerCatalogCopy.existingMatch");
	}
	return t("providerCatalogCopy.newProposal");
}

function ProviderOfferRow({ preview }: { preview: AuthenticatedProviderCatalogPreview }) {
	const {t, formatLabel} = usePreviewCopy();
	const canonicalModel = preview.canonical_model_slug;
	return (
		<div className="space-y-4 px-4 py-4 first:pt-0 last:pb-0 sm:px-5">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<Link
							href={`/api-providers/${encodeURIComponent(preview.provider_slug)}`}
							className="text-base font-semibold underline decoration-transparent underline-offset-4 hover:decoration-current"
						>
							{preview.provider_name}
						</Link>
						<UnreleasedBadge compact />
						<Badge variant="outline">{matchLabel(preview, t)}</Badge>
						{preview.can_test ? (
							<Link
								href={`/chat?model=${encodeURIComponent(`${preview.provider_slug}:${preview.model_id}`)}`}
								className="text-sm font-semibold text-cyan-700 underline-offset-4 hover:underline dark:text-cyan-300"
							>
								{t("providerCatalogCopy.testModel")}
							</Link>
						) : (
							<span className="text-sm text-muted-foreground" title={testabilityCopy(preview, t)}>
								{t("providerCatalogCopy.testingUnavailable")}
							</span>
						)}
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						{preview.model_name} · <code className="font-mono text-xs">{preview.provider_model_slug}</code>
					</p>
				</div>
				<Badge variant="secondary" className="w-fit capitalize">
					{preview.availability_status === "not_active" ? t("providerCatalogCopy.notActive") : t("providerCatalogCopy.comingSoon")}
				</Badge>
			</div>

			<div className="grid gap-x-6 gap-y-3 border-t border-border/60 pt-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
				<div>
					<p className="text-xs text-muted-foreground">{t("providerCatalogCopy.providerModelID")}</p>
					<code className="mt-1 block break-all font-mono text-xs">{preview.api_model_id}</code>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">{t("providerCatalogCopy.review")}</p>
					<p className="mt-1 font-medium">{formatLabel(preview.decision)}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">{t("providerCatalogCopy.route")}</p>
					<p className="mt-1 font-medium">{formatLabel(preview.route_projection_status)}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">{t("providerCatalogCopy.canonicalModel")}</p>
					{canonicalModel ? (
						<Link href={`/models/${canonicalModel}`} className="mt-1 block break-all font-mono text-xs underline underline-offset-2">
							{canonicalModel}
						</Link>
					) : <p className="mt-1 text-muted-foreground">{t("providerCatalogCopy.unmatched")}</p>}
				</div>
			</div>
		</div>
	);
}

export function ProviderCatalogOffersSection({
	previews,
	title,
	description,
	id = "providers",
}: {
	previews: AuthenticatedProviderCatalogPreview[];
	title?: string;
	description?: string;
	id?: string;
}) {
	const {t} = usePreviewCopy();
	return (
		<section id={id} className="scroll-mt-28 space-y-4">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">{title ?? t("providerCatalogCopy.providers")}</h2>
				<p className="text-sm text-muted-foreground">{description ?? t("providerCatalogCopy.providerListingsAndKnownRouteAvailabilityForThisModel")}</p>
			</div>
			<div className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card">
				{previews.map((preview) => (
					<ProviderOfferRow key={`${preview.provider_slug}:${preview.model_id}`} preview={preview} />
				))}
			</div>
		</section>
	);
}

function PreviewAboutSection({ preview }: { preview: AuthenticatedProviderCatalogPreview }) {
	const {t, formatLabel, formatDate} = usePreviewCopy();
	return (
		<section id="about" className="scroll-mt-28 space-y-4 border-t border-border/60 pt-6">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">{t("providerCatalogCopy.about")}</h2>
				<p className="text-sm text-muted-foreground">{t("providerCatalogCopy.aboutDescription")}</p>
			</div>
			<dl className="grid gap-x-6 md:grid-cols-2">
				<DetailValue label={t("providerCatalogCopy.provider")}>
					<Link href={`/api-providers/${encodeURIComponent(preview.provider_slug)}`} className="underline underline-offset-2">{preview.provider_name}</Link>
				</DetailValue>
				<DetailValue label={t("providerCatalogCopy.availability")}>{preview.availability_status === "not_active" ? t("providerCatalogCopy.notActive") : t("providerCatalogCopy.comingSoon")}</DetailValue>
				<DetailValue label={t("providerCatalogCopy.providerStatus")}>{formatLabel(preview.availability_reason)}</DetailValue>
				<DetailValue label={t("providerCatalogCopy.announcement")}>{formatDate(preview.announcement_date ?? preview.created_at)}</DetailValue>
				<DetailValue label={t("providerCatalogCopy.releaseDate")}>{formatDate(preview.release_date ?? preview.available_from)}</DetailValue>
				<DetailValue label={t("providerCatalogCopy.providerSlug")}><code className="font-mono text-xs">{preview.provider_model_slug}</code></DetailValue>
			</dl>
		</section>
	);
}

function PreviewCapabilitiesSection({ preview }: { preview: AuthenticatedProviderCatalogPreview }) {
	const {t, modalities} = usePreviewCopy();
	const inputModalities = preview.input_modalities ?? [];
	const outputModalities = preview.output_modalities ?? [];
	const endpoints = preview.endpoints ?? [];
	const supportedParams = preview.supported_params ?? [];
	return (
		<section id="capabilities" className="scroll-mt-28 space-y-4 border-t border-border/60 pt-6">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">{t("providerCatalogCopy.capabilities")}</h2>
				<p className="text-sm text-muted-foreground">{t("providerCatalogCopy.capabilitiesDescription")}</p>
			</div>
			<dl className="grid gap-x-6 md:grid-cols-2">
				<DetailValue label={t("providerCatalogCopy.inputModalities")}>{inputModalities.length ? modalities(inputModalities) : t("providerCatalogCopy.notListed")}</DetailValue>
				<DetailValue label={t("providerCatalogCopy.outputModalities")}>{outputModalities.length ? modalities(outputModalities) : t("providerCatalogCopy.notListed")}</DetailValue>
				<DetailValue label={t("providerCatalogCopy.contextLength")}>{preview.context_length ? t("providerCatalogCopy.tokens", {count: preview.context_length}) : t("providerCatalogCopy.notListed")}</DetailValue>
				<DetailValue label={t("providerCatalogCopy.maximumOutput")}>{preview.max_output_tokens ? t("providerCatalogCopy.tokens", {count: preview.max_output_tokens}) : t("providerCatalogCopy.notListed")}</DetailValue>
				<DetailValue label={t("providerCatalogCopy.endpoints")}>{endpoints.length ? endpoints.join(", ") : t("providerCatalogCopy.notListed")}</DetailValue>
				<DetailValue label={t("providerCatalogCopy.supportedParameters")}>{supportedParams.length ? supportedParams.join(", ") : t("providerCatalogCopy.notListed")}</DetailValue>
			</dl>
		</section>
	);
}

export function ProviderCatalogPreviewDetailsSection({
	previews,
}: {
	previews: AuthenticatedProviderCatalogPreview[];
}) {
	const {t, formatLabel, formatDate, formatPrice, modalities} = usePreviewCopy();
	return (
		<div className="space-y-6">
			{previews.map((preview) => (
				<div key={`${preview.provider_slug}:${preview.model_id}`} className="space-y-4 rounded-xl border border-border/70 bg-card p-4 sm:p-5">
					<div className="space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="text-base font-semibold">{t("providerCatalogCopy.submission", {provider: preview.provider_name})}</h3>
							<UnreleasedBadge compact />
						</div>
						{preview.description ? <p className="text-sm text-muted-foreground">{preview.description}</p> : null}
					</div>
					<dl className="grid gap-x-6 md:grid-cols-2">
						<DetailValue label={t("providerCatalogCopy.provider")}>
							<Link href={`/api-providers/${encodeURIComponent(preview.provider_slug)}`} className="underline underline-offset-2">{preview.provider_name}</Link>
						</DetailValue>
						<DetailValue label={t("providerCatalogCopy.match")}>{matchLabel(preview, t)}</DetailValue>
						<DetailValue label={t("providerCatalogCopy.availability")}>{preview.availability_status === "not_active" ? t("providerCatalogCopy.notActive") : t("providerCatalogCopy.comingSoon")}</DetailValue>
						<DetailValue label={t("providerCatalogCopy.providerStatus")}>{formatLabel(preview.availability_reason)}</DetailValue>
						<DetailValue label={t("providerCatalogCopy.review")}>{formatLabel(preview.decision)}</DetailValue>
						<DetailValue label={t("providerCatalogCopy.routeProjection")}>{formatLabel(preview.route_projection_status)}</DetailValue>
						<DetailValue label={t("providerCatalogCopy.announcement")}>{formatDate(preview.announcement_date ?? preview.created_at)}</DetailValue>
						<DetailValue label={t("providerCatalogCopy.releaseDate")}>{formatDate(preview.release_date ?? preview.available_from)}</DetailValue>
						<DetailValue label={t("providerCatalogCopy.deprecated")}>{formatDate(preview.deprecated_at)}</DetailValue>
						<DetailValue label={t("providerCatalogCopy.shutdown")}>{formatDate(preview.shutdown_at)}</DetailValue>
						<DetailValue label={t("providerCatalogCopy.canonicalModel")}>
							{preview.canonical_model_slug ? <Link href={`/models/${preview.canonical_model_slug}`} className="font-mono text-xs underline underline-offset-2">{preview.canonical_model_slug}</Link> : t("providerCatalogCopy.unmatched")}
						</DetailValue>
						<DetailValue label={t("providerCatalogCopy.providerSlug")}><code className="font-mono text-xs">{preview.provider_model_slug}</code></DetailValue>
						<DetailValue label={t("providerCatalogCopy.providerApiId")}><code className="font-mono text-xs">{preview.api_model_id}</code></DetailValue>
					</dl>
					<div className="grid gap-x-6 gap-y-4 border-t border-border/60 pt-4 md:grid-cols-2">
						<DetailValue label={t("providerCatalogCopy.inputModalities")}>{preview.input_modalities?.length ? modalities(preview.input_modalities) : t("providerCatalogCopy.notListed")}</DetailValue>
						<DetailValue label={t("providerCatalogCopy.outputModalities")}>{preview.output_modalities?.length ? modalities(preview.output_modalities) : t("providerCatalogCopy.notListed")}</DetailValue>
						<DetailValue label={t("providerCatalogCopy.contextLength")}>{preview.context_length ? t("providerCatalogCopy.tokens", {count: preview.context_length}) : t("providerCatalogCopy.notListed")}</DetailValue>
						<DetailValue label={t("providerCatalogCopy.maximumOutput")}>{preview.max_output_tokens ? t("providerCatalogCopy.tokens", {count: preview.max_output_tokens}) : t("providerCatalogCopy.notListed")}</DetailValue>
						<DetailValue label={t("providerCatalogCopy.endpoints")}>{preview.endpoints?.length ? preview.endpoints.join(", ") : t("providerCatalogCopy.notListed")}</DetailValue>
						<DetailValue label={t("providerCatalogCopy.supportedParameters")}>{preview.supported_params?.length ? preview.supported_params.join(", ") : t("providerCatalogCopy.notListed")}</DetailValue>
					</div>
					{preview.pricing?.length ? (
						<div className="overflow-x-auto rounded-lg border border-border/70">
							<table className="w-full text-left text-sm">
								<thead className="border-b border-border/70 bg-muted/30 text-xs text-muted-foreground">
									<tr><th className="px-3 py-2 font-medium">{t("providerCatalogCopy.meter")}</th><th className="px-3 py-2 font-medium">{t("providerCatalogCopy.direction")}</th><th className="px-3 py-2 font-medium">{t("providerCatalogCopy.price")}</th></tr>
								</thead>
								<tbody className="divide-y divide-border/60">
									{preview.pricing.map((price) => (
										<tr key={`${price.meterKey}:${price.direction ?? ""}`}>
											<td className="px-3 py-2">{price.displayLabel || formatLabel(price.meterKey)}</td>
											<td className="px-3 py-2 text-muted-foreground">{formatLabel(price.direction)}</td>
											<td className="px-3 py-2 font-semibold">{formatPrice(price.priceNanos, price.unitQuantity)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : null}
				</div>
			))}
		</div>
	);
}

export default function ProviderCatalogPreviewContent({ preview }: { preview: AuthenticatedProviderCatalogPreview }) {
	const {t} = usePreviewCopy();
	return (
		<div className="space-y-10">
			<div className="flex flex-col gap-6 lg:flex-row lg:items-start">
				<ModelPageToc
					items={[
						{ id: "providers", label: t("providerCatalogCopy.providers") },
						{ id: "about", label: t("providerCatalogCopy.about") },
						{ id: "capabilities", label: t("providerCatalogCopy.capabilities") },
					]}
					className="lg:h-full lg:w-40 lg:shrink-0 xl:w-44"
				/>
				<div className="min-w-0 flex-1 space-y-10">
					<ProviderCatalogOffersSection
						previews={[preview]}
						description={t("providerCatalogCopy.offersDescription")}
					/>
					<PreviewAboutSection preview={preview} />
					<PreviewCapabilitiesSection preview={preview} />
					<ProviderCatalogPreviewDetailsSection previews={[preview]} />
					<div className="flex gap-3 border-t border-border/60 pt-6 text-sm text-muted-foreground">
						<Server className="mt-0.5 size-4 shrink-0 text-cyan-600" />
						<p>{t("providerCatalogCopy.privacy")}</p>
						<Route className="mt-0.5 size-4 shrink-0 text-amber-600" />
					</div>
				</div>
			</div>
		</div>
	);
}
