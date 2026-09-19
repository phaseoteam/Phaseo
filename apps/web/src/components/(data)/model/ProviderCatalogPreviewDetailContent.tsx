"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Info, Route, Server } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { AuthenticatedProviderCatalogPreview } from "@/lib/query/providerCatalogPreviews";
import { formatModelLifecycleDate } from "@/lib/dates/modelLifecycleDates";
import ModelPageToc from "./ModelPageToc";
import UnreleasedBadge from "./UnreleasedBadge";

function formatLabel(value: string | null | undefined): string {
	return String(value ?? "")
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase())
		.trim() || "Not listed";
}

function formatDate(value: string | null | undefined): string {
	if (!value) return "Not listed";
	return formatModelLifecycleDate(value);
}

function availabilityCopy(preview: AuthenticatedProviderCatalogPreview): string {
	if (preview.availability_reason === "retired") {
		return "The provider has marked this model as end of life. It remains visible here as an authorized catalogue archive, but it is not routable through the gateway.";
	}
	if (preview.availability_reason === "deprecated") {
		return "The provider has marked this model as deprecated. It remains visible here for provider and admin review, but it is not routable through the gateway.";
	}
	if (preview.availability_reason === "scheduled") {
		return preview.available_from
			? `The provider has scheduled this model for ${formatDate(preview.available_from)}. It is not routable until then.`
			: "The provider has scheduled this model for a future release. It is not routable yet.";
	}
	if (preview.availability_reason === "provider_not_ready") {
		return "The provider has imported this model but has not marked it ready for gateway routing yet.";
	}
	if (preview.availability_reason === "provider_degraded") {
		return "The provider has imported this model but currently reports degraded availability.";
	}
	if (preview.availability_reason === "needs_changes") {
		return "This catalogue entry is awaiting provider changes before it can proceed to endpoint checks.";
	}
	if (preview.availability_reason === "endpoint_checks_failed") {
		return "The catalogue entry is present, but endpoint checks have not passed yet.";
	}
	if (preview.availability_reason === "pending_endpoint_checks") {
		return "The catalogue entry has passed review and is awaiting endpoint checks before it can become routable.";
	}
	return "This catalogue entry is awaiting review before it can become routable.";
}

function testabilityCopy(preview: AuthenticatedProviderCatalogPreview): string {
	if (preview.can_test) return "Authorized provider and admin users can test this model through the internal chat route.";
	switch (preview.test_blocked_reason) {
		case "model_not_testable":
			return "Testing is disabled because this catalogue entry is deprecated or retired.";
		case "provider_endpoint_missing":
			return "Testing is unavailable until the provider configures an inference endpoint.";
		case "provider_adapter_missing":
			return "Testing is unavailable until a gateway adapter is configured for this provider.";
		case "provider_credentials_missing":
			return "Testing is unavailable until the provider credentials are configured.";
		case "route_not_staged":
			return "Testing is unavailable until this model has an internal gateway route staged.";
		default:
			return "Testing is unavailable until the provider route is configured.";
	}
}

export function PreviewStatusBanner({ preview }: { preview: AuthenticatedProviderCatalogPreview }) {
	const isInactive = preview.availability_status === "not_active";
	return (
		<Alert
			className={isInactive
				? "mb-6 border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-50"
				: "mb-6 border-cyan-200 bg-cyan-50 text-cyan-950 dark:border-cyan-900/60 dark:bg-cyan-950/20"}
		>
			{isInactive ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
			<AlertTitle>{isInactive ? "Provider catalogue archive" : "Provider catalogue preview"}</AlertTitle>
			<AlertDescription className={isInactive ? "text-amber-900/90 dark:text-amber-100/90" : "text-cyan-900/90 dark:text-cyan-100/90"}>
				<span className="block">{availabilityCopy(preview)}</span>
				<span className="mt-1 block">{testabilityCopy(preview)}</span>
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

function matchLabel(preview: AuthenticatedProviderCatalogPreview): string {
	if (preview.canonical_model_slug) {
		return preview.match_type === "alias" ? "Matched by alias" : "Matched existing model";
	}
	return "New model proposal";
}

function ProviderOfferRow({ preview }: { preview: AuthenticatedProviderCatalogPreview }) {
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
						<Badge variant="outline">{matchLabel(preview)}</Badge>
						{preview.can_test ? (
							<Link
								href={`/chat?model=${encodeURIComponent(`${preview.provider_slug}:${preview.model_id}`)}`}
								className="text-sm font-semibold text-cyan-700 underline-offset-4 hover:underline dark:text-cyan-300"
							>
								Test model
							</Link>
						) : (
							<span className="text-sm text-muted-foreground" title={testabilityCopy(preview)}>
								Testing unavailable
							</span>
						)}
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						{preview.model_name} · <code className="font-mono text-xs">{preview.provider_model_slug}</code>
					</p>
				</div>
				<Badge variant="secondary" className="w-fit capitalize">
					{preview.availability_status === "not_active" ? "Not active" : "Coming soon"}
				</Badge>
			</div>

			<div className="grid gap-x-6 gap-y-3 border-t border-border/60 pt-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
				<div>
					<p className="text-xs text-muted-foreground">Provider model ID</p>
					<code className="mt-1 block break-all font-mono text-xs">{preview.api_model_id}</code>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Review</p>
					<p className="mt-1 font-medium">{formatLabel(preview.decision)}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Route</p>
					<p className="mt-1 font-medium">{formatLabel(preview.route_projection_status)}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Canonical model</p>
					{canonicalModel ? (
						<Link href={`/models/${canonicalModel}`} className="mt-1 block break-all font-mono text-xs underline underline-offset-2">
							{canonicalModel}
						</Link>
					) : <p className="mt-1 text-muted-foreground">Not matched yet</p>}
				</div>
			</div>
		</div>
	);
}

export function ProviderCatalogOffersSection({
	previews,
	title = "Providers",
	description = "Provider listings and known route availability for this model.",
	id = "providers",
}: {
	previews: AuthenticatedProviderCatalogPreview[];
	title?: string;
	description?: string;
	id?: string;
}) {
	return (
		<section id={id} className="scroll-mt-28 space-y-4">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">{title}</h2>
				<p className="text-sm text-muted-foreground">{description}</p>
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
	return (
		<section id="about" className="scroll-mt-28 space-y-4 border-t border-border/60 pt-6">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">About</h2>
				<p className="text-sm text-muted-foreground">Key dates, provider identity, and model identifiers from the submitted catalogue.</p>
			</div>
			<dl className="grid gap-x-6 md:grid-cols-2">
				<DetailValue label="Provider">
					<Link href={`/api-providers/${encodeURIComponent(preview.provider_slug)}`} className="underline underline-offset-2">{preview.provider_name}</Link>
				</DetailValue>
				<DetailValue label="Availability">{preview.availability_status === "not_active" ? "Not active" : "Coming soon"}</DetailValue>
				<DetailValue label="Provider status">{formatLabel(preview.availability_reason)}</DetailValue>
				<DetailValue label="Announcement">{formatDate(preview.announcement_date ?? preview.created_at)}</DetailValue>
				<DetailValue label="Release date">{formatDate(preview.release_date ?? preview.available_from)}</DetailValue>
				<DetailValue label="Provider model slug"><code className="font-mono text-xs">{preview.provider_model_slug}</code></DetailValue>
			</dl>
		</section>
	);
}

function PreviewCapabilitiesSection({ preview }: { preview: AuthenticatedProviderCatalogPreview }) {
	const inputModalities = preview.input_modalities ?? [];
	const outputModalities = preview.output_modalities ?? [];
	const endpoints = preview.endpoints ?? [];
	const supportedParams = preview.supported_params ?? [];
	return (
		<section id="capabilities" className="scroll-mt-28 space-y-4 border-t border-border/60 pt-6">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">Capabilities</h2>
				<p className="text-sm text-muted-foreground">Capabilities parsed from the provider catalogue.</p>
			</div>
			<dl className="grid gap-x-6 md:grid-cols-2">
				<DetailValue label="Input modalities">{inputModalities.length ? inputModalities.join(", ") : "Not listed"}</DetailValue>
				<DetailValue label="Output modalities">{outputModalities.length ? outputModalities.join(", ") : "Not listed"}</DetailValue>
				<DetailValue label="Context length">{preview.context_length ? `${preview.context_length.toLocaleString()} tokens` : "Not listed"}</DetailValue>
				<DetailValue label="Maximum output">{preview.max_output_tokens ? `${preview.max_output_tokens.toLocaleString()} tokens` : "Not listed"}</DetailValue>
				<DetailValue label="Endpoints">{endpoints.length ? endpoints.join(", ") : "Not listed"}</DetailValue>
				<DetailValue label="Supported parameters">{supportedParams.length ? supportedParams.join(", ") : "Not listed"}</DetailValue>
			</dl>
		</section>
	);
}

function formatPrice(priceNanos: number, unitQuantity: number): string {
	if (!Number.isFinite(priceNanos) || !Number.isFinite(unitQuantity) || unitQuantity <= 0) return "Not listed";
	const pricePerMillion = (priceNanos / 1_000_000_000) * (1_000_000 / unitQuantity);
	if (!Number.isFinite(pricePerMillion)) return "Not listed";
	return `$${pricePerMillion.toFixed(pricePerMillion >= 1 ? 2 : 4).replace(/0+$/, "").replace(/\.$/, "")} / 1M`;
}

export function ProviderCatalogPreviewDetailsSection({
	previews,
}: {
	previews: AuthenticatedProviderCatalogPreview[];
}) {
	return (
		<div className="space-y-6">
			{previews.map((preview) => (
				<div key={`${preview.provider_slug}:${preview.model_id}`} className="space-y-4 rounded-xl border border-border/70 bg-card p-4 sm:p-5">
					<div className="space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="text-base font-semibold">{preview.provider_name} submission</h3>
							<UnreleasedBadge compact />
						</div>
						{preview.description ? <p className="text-sm text-muted-foreground">{preview.description}</p> : null}
					</div>
					<dl className="grid gap-x-6 md:grid-cols-2">
						<DetailValue label="Provider">
							<Link href={`/api-providers/${encodeURIComponent(preview.provider_slug)}`} className="underline underline-offset-2">{preview.provider_name}</Link>
						</DetailValue>
						<DetailValue label="Match">{matchLabel(preview)}</DetailValue>
						<DetailValue label="Availability">{preview.availability_status === "not_active" ? "Not active" : "Coming soon"}</DetailValue>
						<DetailValue label="Provider status">{formatLabel(preview.availability_reason)}</DetailValue>
						<DetailValue label="Review">{formatLabel(preview.decision)}</DetailValue>
						<DetailValue label="Route projection">{formatLabel(preview.route_projection_status)}</DetailValue>
						<DetailValue label="Announcement">{formatDate(preview.announcement_date ?? preview.created_at)}</DetailValue>
						<DetailValue label="Release date">{formatDate(preview.release_date ?? preview.available_from)}</DetailValue>
						<DetailValue label="Deprecated">{formatDate(preview.deprecated_at)}</DetailValue>
						<DetailValue label="Shutdown">{formatDate(preview.shutdown_at)}</DetailValue>
						<DetailValue label="Canonical model">
							{preview.canonical_model_slug ? <Link href={`/models/${preview.canonical_model_slug}`} className="font-mono text-xs underline underline-offset-2">{preview.canonical_model_slug}</Link> : "Not matched yet"}
						</DetailValue>
						<DetailValue label="Provider model slug"><code className="font-mono text-xs">{preview.provider_model_slug}</code></DetailValue>
						<DetailValue label="Provider API model ID"><code className="font-mono text-xs">{preview.api_model_id}</code></DetailValue>
					</dl>
					<div className="grid gap-x-6 gap-y-4 border-t border-border/60 pt-4 md:grid-cols-2">
						<DetailValue label="Input modalities">{preview.input_modalities?.length ? preview.input_modalities.join(", ") : "Not listed"}</DetailValue>
						<DetailValue label="Output modalities">{preview.output_modalities?.length ? preview.output_modalities.join(", ") : "Not listed"}</DetailValue>
						<DetailValue label="Context length">{preview.context_length ? `${preview.context_length.toLocaleString()} tokens` : "Not listed"}</DetailValue>
						<DetailValue label="Maximum output">{preview.max_output_tokens ? `${preview.max_output_tokens.toLocaleString()} tokens` : "Not listed"}</DetailValue>
						<DetailValue label="Endpoints">{preview.endpoints?.length ? preview.endpoints.join(", ") : "Not listed"}</DetailValue>
						<DetailValue label="Supported parameters">{preview.supported_params?.length ? preview.supported_params.join(", ") : "Not listed"}</DetailValue>
					</div>
					{preview.pricing?.length ? (
						<div className="overflow-x-auto rounded-lg border border-border/70">
							<table className="w-full text-left text-sm">
								<thead className="border-b border-border/70 bg-muted/30 text-xs text-muted-foreground">
									<tr><th className="px-3 py-2 font-medium">Meter</th><th className="px-3 py-2 font-medium">Direction</th><th className="px-3 py-2 font-medium">Price</th></tr>
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
	return (
		<div className="space-y-10">
			<div className="flex flex-col gap-6 lg:flex-row lg:items-start">
				<ModelPageToc
					items={[
						{ id: "providers", label: "Providers" },
						{ id: "about", label: "About" },
						{ id: "capabilities", label: "Capabilities" },
					]}
					className="lg:h-full lg:w-40 lg:shrink-0 xl:w-44"
				/>
				<div className="min-w-0 flex-1 space-y-10">
					<ProviderCatalogOffersSection
						previews={[preview]}
						description="The provider has declared this model in its catalogue. It remains visible to authorized viewers while review and route checks are pending."
					/>
					<PreviewAboutSection preview={preview} />
					<PreviewCapabilitiesSection preview={preview} />
					<ProviderCatalogPreviewDetailsSection previews={[preview]} />
					<div className="flex gap-3 border-t border-border/60 pt-6 text-sm text-muted-foreground">
						<Server className="mt-0.5 size-4 shrink-0 text-cyan-600" />
						<p>Only the provider workspace that submitted this entry and Phaseo administrators can see this preview. Gateway routing remains disabled until the entry is ready.</p>
						<Route className="mt-0.5 size-4 shrink-0 text-amber-600" />
					</div>
				</div>
			</div>
		</div>
	);
}
