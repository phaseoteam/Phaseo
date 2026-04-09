import Link from "next/link";
import type { ReactNode } from "react";
import {
	Activity,
	AlertTriangle,
	AppWindow,
	AudioLines,
	Braces,
	FileText,
	ImageIcon,
	Shield,
	Video,
} from "lucide-react";
import ModelPricing from "@/components/(data)/model/pricing/ModelPricing";
import ModelPerformanceDashboard from "@/components/(data)/models/ModelPerformanceDashboard";
import Quickstart from "@/components/(data)/model/quickstart/Quickstart";
import ModelBenchmarks from "@/components/(data)/model/benchmarks/ModelBenchmarks";
import KeyDates from "@/components/(data)/model/overview/KeyDates";
import OtherInfo from "@/components/(data)/model/overview/OtherInfo";
import ModelLinks, {
	hasModelLinks,
} from "@/components/(data)/model/overview/ModelLinks";
import { getModelOverviewCached, type ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import { getModelPerformanceMetricsCached } from "@/lib/fetchers/models/getModelPerformance";
import { getModelTokenTrajectoryCached } from "@/lib/fetchers/models/getModelTokenTrajectory";
import { getModelGatewayMetadataCached } from "@/lib/fetchers/models/getModelGatewayMetadata";
import { getModelBenchmarkHighlights } from "@/lib/fetchers/models/getModelBenchmarkData";
import { getModelSubscriptionPlansCached } from "@/lib/fetchers/models/getModelSubscriptionPlans";
import { getOrganisationModelsCached } from "@/lib/fetchers/organisations/getOrganisation";
import { Badge } from "@/components/ui/badge";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@/components/ui/carousel";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ModelOverviewSectionsProps = {
	modelId: string;
	model?: ModelOverviewPage | null;
	includeHidden: boolean;
};

export type ModelSectionSharedProps = {
	modelId: string;
	includeHidden: boolean;
};
type ModelSectionSurface = "overview" | "page";

function Section({
	id,
	children,
	showDivider = true,
}: {
	id: string;
	children: ReactNode;
	showDivider?: boolean;
}) {
	return (
		<section
			id={id}
			className={`space-y-4 ${showDivider ? "border-t border-border/60 pt-6" : ""}`}
		>
			{children}
		</section>
	);
}

function formatPrice(
	prices:
		| Array<{ price: number; currency: string; frequency: string }>
		| undefined,
): string {
	if (!prices || prices.length === 0) return "Pricing unavailable";
	const sorted = [...prices].sort((a, b) => a.price - b.price);
	const first = sorted[0];
	const currency = (first.currency || "USD").toUpperCase();
	return `${currency} ${first.price.toFixed(first.price % 1 === 0 ? 0 : 2)} / ${
		first.frequency || "period"
	}`;
}

function formatPercent(value: number | null): string {
	if (value == null || !Number.isFinite(value)) return "N/A";
	return `${value.toFixed(1)}%`;
}

function parseTypes(types: unknown): string[] {
	const normalizeType = (value: string): string => {
		const normalized = value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "");
		if (normalized === "embedding") return "embeddings";
		if (normalized === "moderation") return "moderations";
		return normalized;
	};

	if (Array.isArray(types)) {
		return Array.from(
			new Set(types.map((type) => normalizeType(String(type ?? ""))).filter(Boolean)),
		);
	}
	if (typeof types === "string") {
		return Array.from(
			new Set(types.split(",").map((type) => normalizeType(type)).filter(Boolean)),
		);
	}
	return [];
}

function formatDate(dateStr?: string | null): string {
	if (!dateStr) return "-";
	const date = new Date(dateStr);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

const KNOWN_MODALITY_META = [
	{ key: "text", label: "Text", icon: FileText },
	{ key: "image", label: "Image", icon: ImageIcon },
	{ key: "audio", label: "Audio", icon: AudioLines },
	{ key: "video", label: "Video", icon: Video },
	{ key: "embeddings", label: "Embeddings", icon: Braces },
	{ key: "moderations", label: "Moderation", icon: Shield },
];

function formatTypeLabel(value: string): string {
	return value
		.split(/[_\s-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export async function ModelProvidersSection({
	modelId,
	includeHidden,
}: ModelSectionSharedProps) {
	return (
		<Section id="providers" showDivider={false}>
			<ModelPricing
				modelId={modelId}
				includeHidden={includeHidden}
			/>
		</Section>
	);
}

export async function ModelPerformanceSection({
	modelId,
	includeHidden,
	surface = "page",
}: ModelSectionSharedProps & { surface?: ModelSectionSurface }) {
	const [performanceMetrics, tokenTrajectory] = await Promise.all([
		getModelPerformanceMetricsCached(modelId, includeHidden, 24).catch(() => null),
		surface === "page"
			? getModelTokenTrajectoryCached(modelId, includeHidden).catch(() => null)
			: Promise.resolve(null),
	]);

	return (
		<Section id="performance">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">Performance</h2>
				<p className="text-sm text-muted-foreground">
					{surface === "overview"
						? "Core latency and throughput trends from recent traffic."
						: "Latency, throughput, reliability, and cumulative token signals for recent traffic."}
				</p>
			</div>
			{performanceMetrics ? (
				<ModelPerformanceDashboard
					metrics={performanceMetrics}
					tokenTrajectory={tokenTrajectory}
					mode={surface}
				/>
			) : (
				<Empty className="rounded-lg border p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Activity className="size-5" />
						</EmptyMedia>
						<EmptyTitle>No performance telemetry yet</EmptyTitle>
						<EmptyDescription>
							Performance telemetry is not available yet.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</Section>
	);
}

export async function ModelAppsSection({
	modelId,
	includeHidden,
}: ModelSectionSharedProps) {
	const subscriptionPlans = await getModelSubscriptionPlansCached(
		modelId,
		includeHidden,
	).catch(() => []);

	return (
		<Section id="apps">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">
					Apps Using This Model
				</h2>
				<p className="text-sm text-muted-foreground">
					Products and plans where this model is currently available.
				</p>
			</div>
			{subscriptionPlans.length > 0 ? (
				<div className="grid gap-3 md:grid-cols-2">
					{subscriptionPlans.map((plan) => (
						<Link
							key={plan.plan_id}
							href={`/subscription-plans/${plan.plan_id}`}
							className="rounded-lg border border-border/70 px-4 py-3 transition-colors hover:bg-muted/40"
						>
							<p className="text-sm font-semibold">{plan.name}</p>
							<p className="text-xs text-muted-foreground">
								{plan.organisation?.name ?? "Unknown organisation"}
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{formatPrice(plan.prices)}
							</p>
						</Link>
					))}
				</div>
			) : (
				<Empty className="rounded-lg border p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<AppWindow className="size-5" />
						</EmptyMedia>
						<EmptyTitle>No app distribution yet</EmptyTitle>
						<EmptyDescription>
							No app or subscription distribution data is available for this
							model yet.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</Section>
	);
}

export async function ModelActivitySection({
	modelId,
	includeHidden,
}: ModelSectionSharedProps) {
	const performanceMetrics = await getModelPerformanceMetricsCached(
		modelId,
		includeHidden,
		24,
	).catch(() => null);

	const usageSummary = performanceMetrics?.summary ?? null;
	const providerWithTelemetry =
		performanceMetrics?.providerPerformance.filter(
			(provider) => provider.requests > 0,
		).length ?? 0;
	const totalProviders = performanceMetrics?.providerPerformance.length ?? 0;

	return (
		<Section id="activity">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">
					Recent Usage and Uptime
				</h2>
				<p className="text-sm text-muted-foreground">
					24-hour request volume and reliability across active providers.
				</p>
			</div>
			{usageSummary ? (
				<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
					<div className="rounded-lg border border-border/70 px-4 py-3">
						<p className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Requests
						</p>
						<p className="text-xl font-semibold">
							{usageSummary.totalRequests.toLocaleString()}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 px-4 py-3">
						<p className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Success Rate
						</p>
						<p className="text-xl font-semibold">
							{formatPercent(usageSummary.uptimePct)}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 px-4 py-3">
						<p className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Providers With Traffic
						</p>
						<p className="text-xl font-semibold">
							{providerWithTelemetry} / {totalProviders}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 px-4 py-3">
						<p className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Tokens (Cumulative)
						</p>
						<p className="text-xl font-semibold">
							{performanceMetrics?.cumulativeTokens != null
								? performanceMetrics.cumulativeTokens.toLocaleString()
								: "N/A"}
						</p>
					</div>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">
					Usage stats are not available yet.
				</p>
			)}
		</Section>
	);
}

export async function ModelQuickstartSection({
	modelId,
	includeHidden,
	surface = "page",
}: ModelSectionSharedProps & { surface?: ModelSectionSurface }) {
	const gatewayMetadata = await getModelGatewayMetadataCached(
		modelId,
		includeHidden,
	).catch(() => null);

	const quickstartEndpoint =
		gatewayMetadata?.activeProviders.find((p) => p.endpoint)?.endpoint ??
		gatewayMetadata?.providers.find((p) => p.endpoint)?.endpoint ??
		null;
	const supportedEndpoints = gatewayMetadata
		? Array.from(
				new Set(
					gatewayMetadata.activeProviders
						.map((provider) => provider.endpoint)
						.filter(Boolean),
				),
			)
		: [];

	return (
		<Section id="quickstart">
			{surface === "overview" ? (
				<div className="space-y-1">
					<h2 className="text-xl font-semibold tracking-tight">Quickstart</h2>
					<p className="text-sm text-muted-foreground">
						Start calling this model with endpoint-specific examples.
					</p>
				</div>
			) : null}
			{gatewayMetadata ? (
				<Quickstart
					modelId={gatewayMetadata.modelId}
					aliases={gatewayMetadata.aliases}
					apiModelIds={gatewayMetadata.apiModelIds}
					primaryModelIdentifier={gatewayMetadata.primaryModelIdentifier}
					acceptedModelIdentifiers={gatewayMetadata.acceptedModelIdentifiers}
					primaryModelIdentifierByEndpoint={
						gatewayMetadata.primaryModelIdentifierByEndpoint
					}
					acceptedModelIdentifiersByEndpoint={
						gatewayMetadata.acceptedModelIdentifiersByEndpoint
					}
					endpoint={quickstartEndpoint}
					supportedEndpoints={supportedEndpoints}
					showHeader={surface !== "overview"}
				/>
			) : (
				<p className="text-sm text-muted-foreground">
					Quickstart metadata is not available right now.
				</p>
			)}
		</Section>
	);
}

export async function ModelBenchmarksSection({
	modelId,
	includeHidden,
	hideWhenEmpty = false,
}: ModelSectionSharedProps & { hideWhenEmpty?: boolean }) {
	const benchmarkHighlights = await getModelBenchmarkHighlights(
		modelId,
		includeHidden,
	).catch(() => []);
	if (hideWhenEmpty && benchmarkHighlights.length === 0) {
		return null;
	}

	return (
		<Section id="benchmarks">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">Benchmarks</h2>
				<p className="text-sm text-muted-foreground">
					Headline benchmark standings and comparison context.
				</p>
			</div>
			{benchmarkHighlights.length > 0 ? (
				<ModelBenchmarks
					modelId={modelId}
					highlightCards={benchmarkHighlights}
					mode="summary"
				/>
			) : (
				<Empty className="rounded-lg border p-8">
					<EmptyHeader>
						<EmptyTitle>No benchmark data yet</EmptyTitle>
						<EmptyDescription>
							No benchmark data is available for this model yet.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</Section>
	);
}

export async function ModelLineageSection({
	modelId,
	includeHidden,
	model,
}: ModelSectionSharedProps & { model?: ModelOverviewPage | null }) {
	const overview = model ?? (await getModelOverviewCached(modelId, includeHidden));

	return (
		<Section id="family">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">
					Parent and Family
				</h2>
				<p className="text-sm text-muted-foreground">
					Lineage pointers for previous and related models.
				</p>
			</div>
			{overview ? (
				<div className="grid gap-3 md:grid-cols-2">
					<div className="rounded-lg border border-border/70 px-4 py-3">
						<p className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Parent Model
						</p>
						{overview.previous_model_id ? (
							<Link
								href={`/models/${overview.previous_model_id}`}
								className="text-sm font-semibold underline decoration-transparent hover:decoration-current"
							>
								{overview.previous_model_id}
							</Link>
						) : (
							<p className="text-sm text-muted-foreground">
								No parent model recorded.
							</p>
						)}
					</div>
					<div className="rounded-lg border border-border/70 px-4 py-3">
						<p className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Family
						</p>
						{overview.family_id ? (
							<Link
								href={`/models/${modelId}/family`}
								className="text-sm font-semibold underline decoration-transparent hover:decoration-current"
							>
								View family graph
							</Link>
						) : (
							<p className="text-sm text-muted-foreground">
								No family assigned.
							</p>
						)}
					</div>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">
					Lineage information is not available yet.
				</p>
			)}
		</Section>
	);
}

export async function ModelAboutSection({
	model,
}: {
	model: ModelOverviewPage;
}) {
	const inputTypes = parseTypes(model.input_types);
	const outputTypes = parseTypes(model.output_types);
	const inputTypeSet = new Set(inputTypes);
	const outputTypeSet = new Set(outputTypes);
	const extraInputTypes = inputTypes.filter(
		(type) => !KNOWN_MODALITY_META.some((m) => m.key === type),
	);
	const extraOutputTypes = outputTypes.filter(
		(type) => !KNOWN_MODALITY_META.some((m) => m.key === type),
	);

	const renderModalityRow = (kind: "Input" | "Output") => {
		const isInput = kind === "Input";
		const activeSet = isInput ? inputTypeSet : outputTypeSet;
		const extraTypes = isInput ? extraInputTypes : extraOutputTypes;
		const hasAny = activeSet.size > 0;

		return (
			<div className="rounded-md border border-border/70 bg-muted/10 px-3 py-3">
				<p className="text-xs text-muted-foreground">{kind}</p>
				<div className="mt-2 flex flex-wrap gap-2">
					{KNOWN_MODALITY_META.map((modality) => {
						const isActive = activeSet.has(modality.key);
						const Icon = modality.icon;
						return (
							<span
								key={`${kind}-${modality.key}`}
								className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${
									isActive
										? "border-primary/30 bg-primary/10 text-foreground"
										: "border-border/70 bg-background text-muted-foreground"
								}`}
							>
								<Icon className="h-3.5 w-3.5" />
								{modality.label}
							</span>
						);
					})}
					{extraTypes.map((type) => (
						<span
							key={`${kind}-extra-${type}`}
							className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium"
						>
							{formatTypeLabel(type)}
						</span>
					))}
				</div>
				{hasAny ? null : (
					<p className="mt-2 text-xs text-muted-foreground">
						No modalities listed.
					</p>
				)}
			</div>
		);
	};

	return (
		<Section id="about">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">About</h2>
				<p className="text-sm text-muted-foreground">
					Key dates, capabilities, and model metadata.
				</p>
			</div>
			<KeyDates
				announced={model.announcement_date ?? undefined}
				released={model.release_date ?? undefined}
				deprecated={model.deprecation_date ?? undefined}
				retired={model.retirement_date ?? undefined}
				formatDate={formatDate}
				showHeading={false}
			/>
			<OtherInfo details={model.model_details ?? undefined} showHeading={false} />
			<div className="space-y-2">
				<h3 className="text-base font-semibold">Modalities</h3>
				<div className="grid gap-2 sm:grid-cols-2">
					{renderModalityRow("Input")}
					{renderModalityRow("Output")}
				</div>
			</div>
			{hasModelLinks(model) ? (
				<div className="space-y-2">
					<h3 className="text-base font-semibold">Links</h3>
					<ModelLinks model={model} />
				</div>
			) : null}
		</Section>
	);
}

export async function ModelCreatorModelsSection({
	modelId,
	includeHidden,
	model,
}: ModelSectionSharedProps & { model: ModelOverviewPage }) {
	const creatorName = model.organisation?.name ?? "this creator";
	const creatorModels = await getOrganisationModelsCached(
		model.organisation_id,
		includeHidden,
	).catch(() => []);
	const otherModels = creatorModels
		.filter((creatorModel) => creatorModel.model_id !== modelId)
		.sort(
			(a, b) =>
				(b.primary_timestamp ?? 0) - (a.primary_timestamp ?? 0),
		)
		.slice(0, 9);

	return (
		<Section id="other-models">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">
					Other models from{" "}
					<Link
						href={`/organisations/${model.organisation_id}`}
						className="group inline-flex items-center no-underline"
					>
						<span className="underline decoration-transparent group-hover:decoration-current">
							{creatorName}
						</span>
					</Link>
				</h2>
			</div>
			{otherModels.length > 0 ? (
				<div className="relative">
					<Carousel opts={{ align: "start", loop: otherModels.length > 4 }}>
						<CarouselContent>
							{otherModels.map((creatorModel) => (
								<CarouselItem
									key={creatorModel.model_id}
									className="sm:basis-1/2 lg:basis-1/4"
								>
									<Link
										href={`/models/${creatorModel.model_id}`}
										className="block h-full rounded-md border border-border/70 bg-muted/10 px-3 py-3 transition-colors hover:bg-muted/30"
									>
										<div className="space-y-1">
											<p className="line-clamp-1 text-sm font-semibold">
												{creatorModel.name}
											</p>
											<p className="truncate text-xs text-muted-foreground">
												{creatorModel.model_id}
											</p>
										</div>
										<div className="mt-3 flex items-center justify-between gap-2">
											<p className="text-xs text-muted-foreground">
												{formatDate(creatorModel.primary_date)}
											</p>
											{creatorModel.status ? (
												<Badge variant="outline" className="text-[11px]">
													{creatorModel.status}
												</Badge>
											) : null}
										</div>
									</Link>
								</CarouselItem>
							))}
						</CarouselContent>
						<CarouselPrevious className="left-0 z-10 hidden -translate-x-[calc(100%+0.5rem)] bg-background shadow-sm sm:flex" />
						<CarouselNext className="right-0 z-10 hidden translate-x-[calc(100%+0.5rem)] bg-background shadow-sm sm:flex" />
					</Carousel>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">
					No additional models from this creator are available yet.
				</p>
			)}
		</Section>
	);
}

export default async function ModelOverviewSections({
	modelId,
	model,
	includeHidden,
}: ModelOverviewSectionsProps) {
	const hasInternalModelData = Boolean(model);
	const modelStatus = model?.status ?? null;
	const isWithheldModel = modelStatus === "Withheld";
	const isLimitedAvailabilityModel =
		modelStatus === "Announced" || isWithheldModel;

	return (
		<div className="space-y-10">
			{isLimitedAvailabilityModel ? (
				<Section id="announced-status" showDivider={false}>
					<Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-50">
						<AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
						<AlertTitle>
							{isWithheldModel ? "Withheld Model" : "Announced Model"}
						</AlertTitle>
						<AlertDescription className="text-amber-900/90 dark:text-amber-100/90">
							{isWithheldModel
								? "This model was announced with preliminary details but is currently withheld and may never become publicly accessible. Information on this page is provisional and can change at any moment."
								: "This model has been announced and may never become generally accessible. Information on this page can change at any moment as the provider updates release plans, routing availability, and technical details."}
						</AlertDescription>
					</Alert>
				</Section>
			) : null}
			<ModelProvidersSection modelId={modelId} includeHidden={includeHidden} />
			{isLimitedAvailabilityModel ? null : (
				<>
					<ModelPerformanceSection
						modelId={modelId}
						includeHidden={includeHidden}
						surface="overview"
					/>
					<ModelAppsSection modelId={modelId} includeHidden={includeHidden} />
					<ModelQuickstartSection
						modelId={modelId}
						includeHidden={includeHidden}
						surface="overview"
					/>
				</>
			)}
			{hasInternalModelData ? (
				<>
					<ModelBenchmarksSection
						modelId={modelId}
						includeHidden={includeHidden}
						hideWhenEmpty
					/>
					<ModelAboutSection model={model!} />
				</>
			) : null}
		</div>
	);
}
