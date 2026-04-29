import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import {
	Activity,
	AlertTriangle,
	AppWindow,
	BadgeAlert,
	Braces,
	Captions,
	FileText,
	Headphones,
	ImageIcon,
	Music4,
	Speech,
	Video,
} from "lucide-react";
import ModelPricing from "@/components/(data)/model/pricing/ModelPricing";
import ModelPricingInsightsSection from "@/components/(data)/model/pricing/ModelPricingInsightsSection";
import ModelPerformanceDashboard from "@/components/(data)/models/ModelPerformanceDashboard";
import Quickstart from "@/components/(data)/model/quickstart/Quickstart";
import ModelBenchmarks from "@/components/(data)/model/benchmarks/ModelBenchmarks";
import KeyDates from "@/components/(data)/model/overview/KeyDates";
import OtherInfo from "@/components/(data)/model/overview/OtherInfo";
import ModelLinks, {
	hasModelLinks,
} from "@/components/(data)/model/overview/ModelLinks";
import { getModelOverviewCached, type ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import {
	getModelPerformanceActivitySnapshotCached,
	getModelPerformanceMetricsCached,
} from "@/lib/fetchers/models/getModelPerformance";
import { getModelTokenTrajectoryCached } from "@/lib/fetchers/models/getModelTokenTrajectory";
import { getModelGatewayMetadataCached } from "@/lib/fetchers/models/getModelGatewayMetadata";
import { getModelBenchmarkHighlights } from "@/lib/fetchers/models/getModelBenchmarkData";
import { getModelPricingCached } from "@/lib/fetchers/models/getModelPricing";
import { getModelPendingApiReleaseState } from "@/lib/fetchers/models/getModelPendingApiReleaseState";
import { getModelAppsCached } from "@/lib/fetchers/models/getModelApps";
import { getOrganisationModelsCached } from "@/lib/fetchers/organisations/getOrganisation";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import ModelPendingApiReleaseBanner from "@/components/(data)/model/overview/ModelPendingApiReleaseBanner";
import { cn } from "@/lib/utils";
import { getModalityTone } from "@/lib/models/modalityStyles";

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
		if (normalized.includes("music")) return "audio_music";
		if (
			normalized.includes("transcrib") ||
			normalized.includes("speech_to_text") ||
			normalized.includes("stt")
		) {
			return "audio_stt";
		}
		if (
			normalized.includes("text_to_speech") ||
			normalized.includes("audio_speech") ||
			normalized.includes("speech_synth") ||
			normalized.includes("tts")
		) {
			return "audio_tts";
		}
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

function isProviderModelActiveNow(
	providerModel: {
		is_active_gateway: boolean;
		capability_status?: string | null;
		effective_from?: string | null;
		effective_to?: string | null;
	},
	now = new Date(),
): boolean {
	if (!providerModel.is_active_gateway) return false;
	if (providerModel.capability_status === "disabled") return false;

	const from = providerModel.effective_from
		? new Date(providerModel.effective_from)
		: null;
	const to = providerModel.effective_to ? new Date(providerModel.effective_to) : null;

	if (from && Number.isFinite(from.getTime()) && now < from) return false;
	if (to && Number.isFinite(to.getTime()) && now >= to) return false;

	return true;
}

const KNOWN_MODALITY_META = [
	{ key: "text", label: "Text", icon: FileText },
	{ key: "image", label: "Image", icon: ImageIcon },
	{ key: "video", label: "Video", icon: Video },
	{ key: "audio", label: "Audio", icon: Headphones },
	{ key: "audio_tts", label: "Speech", icon: Speech },
	{ key: "audio_stt", label: "Transcription", icon: Captions },
	{ key: "audio_music", label: "Music", icon: Music4 },
	{ key: "embeddings", label: "Embeddings", icon: Braces },
	{ key: "moderations", label: "Moderation", icon: BadgeAlert },
];

function formatTypeLabel(value: string): string {
	if (value === "audio_stt") return "Transcription";
	if (value === "audio_tts") return "Speech";
	if (value === "audio_music") return "Music";
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

export async function ModelPricingInsightsOverviewSection({
	modelId,
	includeHidden,
}: ModelSectionSharedProps) {
	return (
		<Section id="pricing-insights">
			<ModelPricingInsightsSection modelId={modelId} includeHidden={includeHidden} />
		</Section>
	);
}

export async function ModelPerformanceSection({
	modelId,
	includeHidden,
	surface = "page",
}: ModelSectionSharedProps & { surface?: ModelSectionSurface }) {
	const [performanceMetrics, tokenTrajectory, pendingApiRelease] =
		await Promise.all([
		getModelPerformanceMetricsCached(modelId, includeHidden, 24).catch(() => null),
		surface === "page"
			? getModelTokenTrajectoryCached(modelId, includeHidden).catch(() => null)
			: Promise.resolve(null),
		getModelPendingApiReleaseState(modelId, includeHidden).catch(() => null),
	]);
	const shouldShowPendingApiBanner =
		!performanceMetrics && pendingApiRelease?.isPendingApiRelease;

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
				<div className="space-y-3">
					{shouldShowPendingApiBanner ? (
						<ModelPendingApiReleaseBanner
							modelName={pendingApiRelease?.modelName ?? "This model"}
							surface="performance"
						/>
					) : null}
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
				</div>
			)}
		</Section>
	);
}

export async function ModelAppsSection({
	modelId,
	includeHidden,
}: ModelSectionSharedProps) {
	const modelApps = await getModelAppsCached(
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
					Public apps observed in gateway request traffic for this model.
				</p>
			</div>
			{modelApps.length > 0 ? (
				<div className="grid gap-3 md:grid-cols-2">
					{modelApps.map((app) => (
						<Link
							key={app.appId}
							href={`/apps/${encodeURIComponent(app.appId)}`}
							className="rounded-lg border border-border/70 px-4 py-3 transition-colors hover:bg-muted/40"
						>
							<p className="text-sm font-semibold">{app.title}</p>
							<p className="text-xs text-muted-foreground">
								{app.appId}
							</p>
							<div className="mt-2 flex flex-wrap items-center gap-2">
								<Badge variant="outline" className="text-[11px]">
									{app.totalRequests.toLocaleString()} requests
								</Badge>
								<Badge variant="outline" className="text-[11px]">
									{app.totalTokens.toLocaleString()} tokens
								</Badge>
							</div>
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
							No gateway request app data is available for this model yet.
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
	const activitySnapshot = await getModelPerformanceActivitySnapshotCached(
		modelId,
		includeHidden,
	).catch(() => null);

	const usageSummary = activitySnapshot?.summary ?? null;
	const providerWithTelemetry =
		activitySnapshot?.providerPerformance.filter(
			(provider) => provider.requests > 0,
		).length ?? 0;
	const totalProviders = activitySnapshot?.providerPerformance.length ?? 0;

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
							{activitySnapshot?.cumulativeTokens != null
								? activitySnapshot.cumulativeTokens.toLocaleString()
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
	const [benchmarkHighlights, pendingApiRelease] = await Promise.all([
		getModelBenchmarkHighlights(
			modelId,
			includeHidden,
		).catch(() => []),
		getModelPendingApiReleaseState(modelId, includeHidden).catch(() => null),
	]);
	const shouldShowPendingApiBanner =
		benchmarkHighlights.length === 0 && pendingApiRelease?.isPendingApiRelease;
	if (hideWhenEmpty && benchmarkHighlights.length === 0 && !shouldShowPendingApiBanner) {
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
				<div className="space-y-3">
					{shouldShowPendingApiBanner ? (
						<ModelPendingApiReleaseBanner
							modelName={pendingApiRelease?.modelName ?? "This model"}
							surface="benchmarks"
						/>
					) : null}
					<Empty className="rounded-lg border p-8">
						<EmptyHeader>
							<EmptyTitle>No benchmark data yet</EmptyTitle>
							<EmptyDescription>
								No benchmark data is available for this model yet.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</div>
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
					{KNOWN_MODALITY_META.filter((modality) => activeSet.has(modality.key)).map((modality) => {
						const Icon = modality.icon;
						const tone = getModalityTone(modality.key);
						return (
							<span
								key={`${kind}-${modality.key}`}
								className={cn(
									"inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium",
									tone.badgeClassName,
								)}
							>
								<Icon className={cn("h-3.5 w-3.5", tone.iconClassName)} />
								{modality.label}
							</span>
						);
					})}
					{extraTypes.map((type) => {
						const tone = getModalityTone(type);
						return (
							<span
								key={`${kind}-extra-${type}`}
								className={cn(
									"inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium",
									tone.badgeClassName,
								)}
							>
								{formatTypeLabel(type)}
							</span>
						);
					})}
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
			{otherModels.length > 0 ? (
				<Carousel
					className="min-w-0"
					opts={{ align: "start", loop: otherModels.length > 4 }}
				>
					<div className="mb-3 min-w-0 space-y-1">
						<h2 className="text-xl font-semibold tracking-tight">
							Other models from{" "}
							<Link
								href={`/organisations/${model.organisation_id}`}
								className="group/link inline-flex items-center no-underline"
							>
								<span className="underline decoration-transparent group-hover/link:decoration-current">
									{creatorName}
								</span>
							</Link>
						</h2>
					</div>
					<div className="relative min-w-0 overflow-hidden md:px-8">
						<CarouselContent className="-ml-3">
							{otherModels.map((creatorModel) => (
								<CarouselItem
									key={creatorModel.model_id}
									className="pl-3 sm:basis-1/2 xl:basis-1/3 2xl:basis-1/4"
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
										<div className="mt-3">
											<p className="text-xs text-muted-foreground">
												{formatDate(creatorModel.primary_date)}
											</p>
										</div>
									</Link>
								</CarouselItem>
							))}
						</CarouselContent>
						{otherModels.length > 1 ? (
							<div className="pointer-events-none absolute inset-y-0 left-1 right-1 hidden items-center justify-between md:flex">
								<CarouselPrevious className="pointer-events-auto static h-full w-6 translate-x-0 translate-y-0 rounded-l-md rounded-r-none border border-border/80 bg-background shadow-none" />
								<CarouselNext className="pointer-events-auto static h-full w-6 translate-x-0 translate-y-0 rounded-r-md rounded-l-none border border-border/80 bg-background shadow-none" />
							</div>
						) : null}
					</div>
					{otherModels.length > 1 ? (
						<div className="mt-3 flex items-center justify-end gap-2 sm:hidden">
							<CarouselPrevious className="static size-8 translate-x-0 translate-y-0 bg-background shadow-sm" />
							<CarouselNext className="static size-8 translate-x-0 translate-y-0 bg-background shadow-sm" />
						</div>
					) : null}
				</Carousel>
			) : (
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
					<p className="text-sm text-muted-foreground">
						No additional models from this creator are available yet.
					</p>
				</div>
			)}
		</Section>
	);
}

function ProvidersSectionSkeleton() {
	return (
		<Section id="providers-loading" showDivider={false}>
			<div className="space-y-4">
				<div className="space-y-2">
					<Skeleton className="h-6 w-44" />
					<Skeleton className="h-4 w-72" />
				</div>
				<div className="grid gap-3 md:grid-cols-3">
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
				</div>
				<div className="space-y-2">
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
				</div>
			</div>
		</Section>
	);
}

function QuickstartSectionSkeleton() {
	return (
		<Section id="quickstart-loading">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">Quickstart</h2>
				<p className="text-sm text-muted-foreground">
					Start calling this model with endpoint-specific examples.
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				<Skeleton className="h-8 w-24" />
				<Skeleton className="h-8 w-28" />
				<Skeleton className="h-8 w-20" />
			</div>
			<div className="space-y-2">
				<Skeleton className="h-4 w-1/2" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-5/6" />
			</div>
		</Section>
	);
}

function BenchmarksSectionSkeleton() {
	return (
		<Section id="benchmarks-loading">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">Benchmarks</h2>
				<p className="text-sm text-muted-foreground">
					Headline benchmark standings and comparison context.
				</p>
			</div>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{Array.from({ length: 3 }).map((_, index) => (
					<div key={index} className="space-y-3 py-1">
						<Skeleton className="h-5 w-2/3" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</div>
				))}
			</div>
		</Section>
	);
}

function AboutSectionSkeleton() {
	return (
		<Section id="about-loading">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">About</h2>
				<p className="text-sm text-muted-foreground">
					Key dates, capabilities, and model metadata.
				</p>
			</div>
			<div className="space-y-3">
				<Skeleton className="h-4 w-1/3" />
				<Skeleton className="h-4 w-5/6" />
				<Skeleton className="h-4 w-2/3" />
			</div>
		</Section>
	);
}

export function ModelCreatorModelsSkeleton() {
	return (
		<Section id="other-models-loading">
			<div className="space-y-1">
				<Skeleton className="h-6 w-72" />
				<Skeleton className="h-4 w-56" />
			</div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, index) => (
					<div key={index} className="space-y-3 py-1">
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-3 w-full" />
						<Skeleton className="h-3 w-1/3" />
					</div>
				))}
			</div>
		</Section>
	);
}

export function ModelOverviewSectionsSkeleton() {
	return (
		<div className="space-y-10">
			<ProvidersSectionSkeleton />
			<QuickstartSectionSkeleton />
			<BenchmarksSectionSkeleton />
			<AboutSectionSkeleton />
		</div>
	);
}

async function ModelQuickstartOverviewGate({
	modelId,
	includeHidden,
}: ModelSectionSharedProps) {
	const providerPricing = await getModelPricingCached(
		modelId,
		includeHidden,
	).catch(() => null);
	const hasApiProviders = (providerPricing ?? []).some(
		(provider) =>
			provider.pricing_rules.length > 0 &&
			provider.provider_models.some((providerModel) =>
				isProviderModelActiveNow(providerModel),
			),
	);

	if (!hasApiProviders) return null;

	return (
		<ModelQuickstartSection
			modelId={modelId}
			includeHidden={includeHidden}
			surface="overview"
		/>
	);
}

export default function ModelOverviewSections({
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
			<Suspense
				fallback={
					<ProvidersSectionSkeleton />
				}
			>
				<ModelProvidersSection modelId={modelId} includeHidden={includeHidden} />
			</Suspense>
			{isLimitedAvailabilityModel ? null : (
				<Suspense
					fallback={
						<QuickstartSectionSkeleton />
					}
				>
					<ModelQuickstartOverviewGate
						modelId={modelId}
						includeHidden={includeHidden}
					/>
				</Suspense>
			)}
			{hasInternalModelData ? (
				<>
					<Suspense
						fallback={
							<BenchmarksSectionSkeleton />
						}
					>
						<ModelBenchmarksSection
							modelId={modelId}
							includeHidden={includeHidden}
							hideWhenEmpty
						/>
					</Suspense>
					<ModelAboutSection model={model!} />
				</>
			) : null}
		</div>
	);
}

