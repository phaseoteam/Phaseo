import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import {
	Activity,
	ALargeSmall,
	AppWindow,
	BadgeAlert,
	Braces,
	Captions,
	Headphones,
	ImageIcon,
	Music4,
	Speech,
	Video,
} from "lucide-react";
import ModelPricing from "@/components/(data)/model/pricing/ModelPricing";
import ModelSubscriptions from "@/components/(data)/model/pricing/ModelSubscriptions";
import ModelPricingInsightsSection from "@/components/(data)/model/pricing/ModelPricingInsightsSection";
import ModelPerformanceDashboard from "@/components/(data)/models/ModelPerformanceDashboard";
import ModelSuccessChart from "@/components/(data)/models/ModelSuccessChart";
import ModelActivityChart from "@/components/(data)/model/overview/ModelActivityChart";
import Quickstart from "@/components/(data)/model/quickstart/Quickstart";
import type { QuickstartRequestContext } from "@/components/(data)/model/quickstart/requestContext";
import ModelBenchmarks from "@/components/(data)/model/benchmarks/ModelBenchmarks";
import KeyDates from "@/components/(data)/model/overview/KeyDates";
import OtherInfo from "@/components/(data)/model/overview/OtherInfo";
import ModelLinks from "@/components/(data)/model/overview/ModelLinks";
import { isAdminViewer } from "@/lib/auth/getViewerRole";
import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import { getModelGatewayMetadataCached } from "@/lib/fetchers/models/getModelGatewayMetadata";
import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";
import {
	fetchFrontendModelApps,
	fetchFrontendModelBenchmarkHighlights,
	fetchFrontendModelGatewayMetadata,
	fetchFrontendModelOverview,
	fetchFrontendModelPendingApiReleaseState,
	fetchFrontendModelPerformance,
	fetchFrontendModelTokenTrajectory,
	fetchFrontendModelUsageDailyBreakdown,
	fetchFrontendOrganisationModels,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
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
import ModelPendingApiReleaseBanner from "@/components/(data)/model/overview/ModelPendingApiReleaseBanner";
import { formatModelLifecycleDate } from "@/lib/dates/modelLifecycleDates";
import { cn } from "@/lib/utils";
import { getModalityTone } from "@/lib/models/modalityStyles";

type ModelOverviewSectionsProps = {
	modelId: string;
	model?: ModelOverviewPage | null;
	includeHidden: boolean;
	showBenchmarks?: boolean;
	showSubscriptions?: boolean;
	status?: string | null;
	performancePromise?: Promise<ModelPerformanceMetrics | null>;
	quickstartRequestContext?: QuickstartRequestContext;
};

export type ModelSectionSharedProps = {
	modelId: string;
	includeHidden: boolean;
};
type ModelSectionSurface = "overview" | "page";
type ModelPerformancePromiseProps = {
	performancePromise?: Promise<ModelPerformanceMetrics | null>;
};

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
			className={`scroll-mt-28 space-y-4 ${showDivider ? "border-t border-border/60 pt-6" : ""}`}
		>
			{children}
		</section>
	);
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

const KNOWN_MODALITY_META = [
	{ key: "text", label: "Text", icon: ALargeSmall },
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
		<ModelPricing
			modelId={modelId}
			includeHidden={includeHidden}
			showHeader={false}
		/>
	);
}

export async function ModelPricingInsightsOverviewSection({
	modelId,
	includeHidden,
}: ModelSectionSharedProps) {
	return (
		<ModelPricingInsightsSection
			modelId={modelId}
			includeHidden={includeHidden}
			showPageHeader={false}
		/>
	);
}

function SectionHeader({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="space-y-1">
			<h2 className="text-xl font-semibold tracking-tight">{title}</h2>
			<p className="text-sm text-muted-foreground">{description}</p>
		</div>
	);
}

export async function ModelSubscriptionsSection({
	modelId,
	ownerOrganisationId,
	ownerOrganisationName,
}: {
	modelId: string;
	ownerOrganisationId?: string | null;
	ownerOrganisationName?: string | null;
}) {
	return (
		<ModelSubscriptions
			modelId={modelId}
			ownerOrganisationId={ownerOrganisationId}
			ownerOrganisationName={ownerOrganisationName}
			showHeader={false}
		/>
	);
}

export async function ModelPerformanceSection({
	modelId,
	includeHidden,
	performancePromise,
	surface = "overview",
}: ModelSectionSharedProps &
	ModelPerformancePromiseProps & {
		surface?: ModelSectionSurface;
	}) {
	const [performanceMetrics, pendingApiRelease, tokenTrajectory] =
		await Promise.all([
		performancePromise ??
			fetchFrontendModelPerformance(modelId, 24).catch(() => null),
		fetchFrontendModelPendingApiReleaseState(modelId, includeHidden).catch(
			() => null,
		),
		fetchFrontendModelTokenTrajectory(modelId).catch(() => null),
	]);
	const shouldShowPendingApiBanner =
		!performanceMetrics && pendingApiRelease?.isPendingApiRelease;

	return (
		<>
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
		</>
	);
}

export async function ModelUptimeSection({
	modelId,
	performancePromise,
}: Pick<ModelSectionSharedProps, "modelId"> & ModelPerformancePromiseProps) {
	const performanceMetrics =
		(await (performancePromise ??
			fetchFrontendModelPerformance(modelId, 24).catch(() => null))) ?? null;
	const showLeastStableProvider =
		performanceMetrics?.successSeries.some(
			(point) =>
				(point.providerCount ?? 0) > 1 &&
				point.worstProviderSuccessPct != null,
		) ?? false;

	return (
		<ModelSuccessChart
			successSeries={performanceMetrics?.successSeries ?? []}
			showLeastStableProvider={showLeastStableProvider}
		/>
	);
}

export async function ModelAppsSection({
	modelId,
	includeHidden: _includeHidden,
}: ModelSectionSharedProps) {
	const modelApps = await fetchFrontendModelApps(modelId).catch(() => []);

	return (
		<>
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
		</>
	);
}

export async function ModelActivitySection({
	modelId,
	includeHidden: _includeHidden,
}: ModelSectionSharedProps) {
	const usageRows = await fetchFrontendModelUsageDailyBreakdown({
		modelId,
		days: 30,
	}).catch(() => []);

	return (
		<>
			{usageRows.length > 0 ? (
				<ModelActivityChart rows={usageRows} showHeading={false} />
			) : (
				<Empty className="rounded-lg border p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Activity className="size-5" />
						</EmptyMedia>
						<EmptyTitle>No activity yet</EmptyTitle>
						<EmptyDescription>
							Usage breakdowns will appear once this model has enough gateway traffic.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</>
	);
}

export async function ModelQuickstartSection({
	modelId,
	includeHidden,
	surface = "page",
	quickstartRequestContext,
}: ModelSectionSharedProps & {
	surface?: ModelSectionSurface;
	quickstartRequestContext?: QuickstartRequestContext;
}) {
	const includeInternalProviders = await isAdminViewer().catch(() => false);
	const gatewayMetadata = await (includeInternalProviders
		? getModelGatewayMetadataCached(modelId, includeHidden)
		: fetchFrontendModelGatewayMetadata(modelId)
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
		<>
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
					supportedParametersByEndpoint={
						gatewayMetadata.supportedParametersByEndpoint
					}
					endpoint={quickstartEndpoint}
					supportedEndpoints={supportedEndpoints}
					showHeader={surface !== "overview"}
					requestContext={quickstartRequestContext}
				/>
			) : (
				<p className="text-sm text-muted-foreground">
					Quickstart metadata is not available right now.
				</p>
			)}
		</>
	);
}

export async function ModelBenchmarksSection({
	modelId,
	includeHidden,
	hideWhenEmpty = false,
}: ModelSectionSharedProps & { hideWhenEmpty?: boolean }) {
	const [benchmarkHighlights, pendingApiRelease] = await Promise.all([
		fetchFrontendModelBenchmarkHighlights(modelId).catch(() => []),
		fetchFrontendModelPendingApiReleaseState(modelId, includeHidden).catch(
			() => null,
		),
	]);
	const shouldShowPendingApiBanner =
		benchmarkHighlights.length === 0 && pendingApiRelease?.isPendingApiRelease;
	if (hideWhenEmpty && benchmarkHighlights.length === 0 && !shouldShowPendingApiBanner) {
		return null;
	}

	return (
		<>
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
		</>
	);
}

export async function ModelLineageSection({
	modelId,
	includeHidden: _includeHidden,
	model,
}: ModelSectionSharedProps & { model?: ModelOverviewPage | null }) {
	const overview = model ?? (await fetchFrontendModelOverview(modelId));

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

	const renderModalityValue = (kind: "Input" | "Output") => {
		const isInput = kind === "Input";
		const activeSet = isInput ? inputTypeSet : outputTypeSet;
		const extraTypes = isInput ? extraInputTypes : extraOutputTypes;
		const hasAny = activeSet.size > 0;

		return (
			<div className="mt-1 flex min-w-0 flex-wrap gap-1.5">
				{KNOWN_MODALITY_META.filter((modality) => activeSet.has(modality.key)).map((modality) => {
					const Icon = modality.icon;
					const tone = getModalityTone(modality.key);
					return (
						<span
							key={`${kind}-${modality.key}`}
							className={cn(
								"inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
								tone.badgeClassName,
							)}
						>
							<Icon className={cn("h-3.5 w-3.5", tone.iconClassName)} />
							{modality.label}
						</span>
					)}
				)}
				{extraTypes.map((type) => {
					const tone = getModalityTone(type);
					return (
						<span
							key={`${kind}-extra-${type}`}
							className={cn(
								"inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
								tone.badgeClassName,
							)}
						>
							{formatTypeLabel(type)}
						</span>
					);
				})}
				{hasAny ? null : (
					<span className="text-sm font-medium text-muted-foreground">
						Not listed
					</span>
				)}
			</div>
		);
	};

	return (
		<>
			<KeyDates
				announced={model.announcement_date ?? undefined}
				released={model.release_date ?? undefined}
				deprecated={model.deprecation_date ?? undefined}
				retired={model.retirement_date ?? undefined}
				showHeading={false}
				showEmpty
			/>
			<div className="space-y-2">
			<OtherInfo
				details={model.model_details ?? undefined}
				showHeading={false}
				showEmpty
				extraItems={[
					{
						key: "input_modalities",
						label: "Input",
							value: renderModalityValue("Input"),
						},
						{
							key: "output_modalities",
						label: "Output",
						value: renderModalityValue("Output"),
					},
				]}
			/>
			</div>
			<div className="space-y-2">
				<h3 className="text-base font-semibold">Links</h3>
				<ModelLinks model={model} showEmpty />
			</div>
		</>
	);
}

export async function ModelCreatorModelsSection({
	modelId,
	includeHidden: _includeHidden,
	model,
}: ModelSectionSharedProps & { model: ModelOverviewPage }) {
	const creatorName = model.organisation?.name ?? "this creator";
	const creatorModels = await fetchFrontendOrganisationModels(
		model.organisation_id,
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
					<div className="relative min-w-0 overflow-hidden sm:px-8">
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
												{formatModelLifecycleDate(creatorModel.primary_date)}
											</p>
										</div>
									</Link>
								</CarouselItem>
							))}
						</CarouselContent>
						{otherModels.length > 1 ? (
							<div className="pointer-events-none absolute inset-y-0 left-1 right-1 hidden items-center justify-between sm:flex">
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
		<div className="space-y-4">
			<div className="flex items-center justify-end">
				<Skeleton className="h-8 w-32 rounded-md" />
			</div>
			<div className="overflow-hidden rounded-sm border border-border/70 bg-background">
				<div className="grid min-w-[780px] grid-cols-[27%_12%_12%_11%_11%_13%_1fr] border-b px-3 py-3">
					{["Provider", "Input $/M", "Output $/M", "Latency", "Throughput", "Uptime"].map((label) => (
						<div key={label} className="px-2">
							<Skeleton className="h-3 w-2/3" />
						</div>
					))}
				</div>
				{Array.from({ length: 4 }).map((_, rowIndex) => (
					<div
						key={rowIndex}
						className="grid min-w-[780px] grid-cols-[27%_12%_12%_11%_11%_13%_1fr] items-center border-b px-3 py-3 last:border-b-0"
					>
						<div className="flex items-center gap-3 px-2">
							<Skeleton className="h-8 w-8 rounded-md" />
							<Skeleton className="h-4 w-28" />
						</div>
						<Skeleton className="mx-2 h-4 w-12 justify-self-end" />
						<Skeleton className="mx-2 h-4 w-12 justify-self-end" />
						<Skeleton className="mx-2 h-4 w-12 justify-self-end" />
						<Skeleton className="mx-2 h-4 w-16 justify-self-end" />
						<div className="mx-2 flex items-center justify-end gap-2">
							<Skeleton className="h-4 w-12" />
							<Skeleton className="h-5 w-12" />
						</div>
						<Skeleton className="h-4 w-4 justify-self-end" />
					</div>
				))}
			</div>
		</div>
	);
}

function QuickstartSectionSkeleton() {
	return (
		<div className="overflow-hidden rounded-lg border border-border/70 bg-background">
			<div className="flex flex-wrap gap-2">
				<div className="flex w-full flex-wrap items-center gap-2 border-b p-3">
					<Skeleton className="h-8 w-28 rounded-md" />
					<Skeleton className="h-8 w-28 rounded-md" />
					<Skeleton className="h-8 w-36 rounded-md" />
					<Skeleton className="ml-auto h-8 w-24 rounded-md" />
				</div>
			</div>
			<div className="space-y-3 p-4">
				<Skeleton className="h-4 w-2/5" />
				<Skeleton className="h-4 w-4/5" />
				<Skeleton className="h-4 w-3/4" />
				<Skeleton className="h-4 w-5/6" />
				<Skeleton className="h-4 w-1/2" />
			</div>
		</div>
	);
}

function BenchmarksSectionSkeleton() {
	return (
		<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			{Array.from({ length: 3 }).map((_, index) => (
				<div key={index} className="space-y-3 rounded-md border border-border/70 p-4">
					<Skeleton className="h-5 w-2/3" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
				</div>
			))}
		</div>
	);
}

function AboutSectionSkeleton() {
	return (
		<div className="space-y-5">
			<div className="grid gap-2 sm:grid-cols-3">
				<Skeleton className="h-16 w-full rounded-md" />
				<Skeleton className="h-16 w-full rounded-md" />
				<Skeleton className="h-16 w-full rounded-md" />
			</div>
			<div className="grid gap-2 sm:grid-cols-2">
				<Skeleton className="h-24 w-full rounded-md" />
				<Skeleton className="h-24 w-full rounded-md" />
			</div>
		</div>
	);
}

function PerformanceSectionSkeleton() {
	return (
		<div className="space-y-4">
			<div className="grid gap-3 md:grid-cols-3">
				{Array.from({ length: 3 }).map((_, index) => (
					<div key={index} className="rounded-md border border-border/70 p-4">
						<Skeleton className="mb-3 h-3 w-20" />
						<Skeleton className="h-7 w-24" />
					</div>
				))}
			</div>
			<div className="rounded-md border border-border/70 p-4">
				<div className="mb-4 flex items-center justify-between">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-7 w-28 rounded-md" />
				</div>
				<Skeleton className="h-56 w-full rounded-sm" />
			</div>
		</div>
	);
}

function PricingSectionSkeleton() {
	return (
		<div className="space-y-6">
			<div className="overflow-hidden rounded-md border border-border/70">
				{Array.from({ length: 4 }).map((_, index) => (
					<div key={index} className="grid grid-cols-4 gap-3 border-b p-3 last:border-b-0">
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-4 w-16 justify-self-end" />
						<Skeleton className="h-4 w-16 justify-self-end" />
						<Skeleton className="h-4 w-16 justify-self-end" />
					</div>
				))}
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				<Skeleton className="h-56 w-full rounded-md" />
				<Skeleton className="h-56 w-full rounded-md" />
			</div>
		</div>
	);
}

function ActivitySectionSkeleton() {
	return (
		<div className="space-y-3">
			<div className="flex justify-end">
				<Skeleton className="h-9 w-32 rounded-md" />
			</div>
			<div className="rounded-md border border-border/70 p-4">
				<Skeleton className="h-64 w-full rounded-sm" />
			</div>
		</div>
	);
}

function AppsSectionSkeleton() {
	return (
		<div className="grid gap-3 md:grid-cols-2">
			{Array.from({ length: 4 }).map((_, index) => (
				<div key={index} className="space-y-3 rounded-md border border-border/70 p-4">
					<Skeleton className="h-4 w-2/5" />
					<Skeleton className="h-3 w-3/5" />
					<div className="flex gap-2">
						<Skeleton className="h-5 w-20 rounded-full" />
						<Skeleton className="h-5 w-20 rounded-full" />
					</div>
				</div>
			))}
		</div>
	);
}

function UptimeSectionSkeleton() {
	return (
		<div className="rounded-lg border border-border/70 bg-background p-6">
			<Skeleton className="h-5 w-32" />
			<Skeleton className="mt-4 h-[260px] w-full rounded-sm" />
		</div>
	);
}

function SubscriptionsSectionSkeleton() {
	return (
		<div className="space-y-3">
			{Array.from({ length: 3 }).map((_, index) => (
				<div key={index} className="rounded-md border border-border/70 p-4">
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-2">
							<Skeleton className="h-4 w-36" />
							<Skeleton className="h-3 w-64" />
						</div>
						<Skeleton className="h-5 w-20" />
					</div>
				</div>
			))}
		</div>
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
			<Section id="providers" showDivider={false}>
				<SectionHeader
					title="Providers"
					description="API providers, route pricing, availability, and recent reliability signals."
				/>
				<ProvidersSectionSkeleton />
			</Section>
			<Section id="performance">
				<SectionHeader
					title="Performance"
					description="Latency, throughput, and reliability signals from recent traffic."
				/>
				<PerformanceSectionSkeleton />
			</Section>
			<Section id="pricing">
				<SectionHeader
					title="Pricing"
					description="Effective prices over the last 30 days, with current provider list prices for context."
				/>
				<PricingSectionSkeleton />
			</Section>
			<Section id="benchmarks">
				<SectionHeader
					title="Benchmarks"
					description="Headline benchmark standings and comparison context."
				/>
				<BenchmarksSectionSkeleton />
			</Section>
			<Section id="activity">
				<SectionHeader
					title="Activity"
					description="Daily gateway activity over the last 30 days, with current UTC-day pace projection."
				/>
				<ActivitySectionSkeleton />
			</Section>
			<Section id="apps">
				<SectionHeader
					title="Apps Using This Model"
					description="Public apps observed in gateway request traffic for this model."
				/>
				<AppsSectionSkeleton />
			</Section>
			<Section id="uptime">
				<SectionHeader
					title="Model Uptime"
					description="Uptime trend for this model over the last 24 hours."
				/>
				<UptimeSectionSkeleton />
			</Section>
			<Section id="quickstart">
				<SectionHeader
					title="Quickstart"
					description="Start calling this model with endpoint-specific examples."
				/>
				<QuickstartSectionSkeleton />
			</Section>
			<Section id="about">
				<SectionHeader
					title="About"
					description="Key dates, capabilities, and model metadata."
				/>
				<AboutSectionSkeleton />
			</Section>
			<Section id="subscriptions">
				<SectionHeader
					title="Subscriptions"
					description="Commercial plans and bundled access that currently include this model."
				/>
				<SubscriptionsSectionSkeleton />
			</Section>
		</div>
	);
}

export default function ModelOverviewSections({
	modelId,
	model,
	includeHidden,
	showBenchmarks = true,
	showSubscriptions = true,
	status,
	performancePromise,
	quickstartRequestContext,
}: ModelOverviewSectionsProps) {
	const hasInternalModelData = Boolean(model);
	const isRetired = status === "Retired";

	if (isRetired) {
		return (
			<div className="space-y-10">
				{showBenchmarks ? (
					<Section id="benchmarks" showDivider={false}>
						<SectionHeader
							title="Benchmarks"
							description="Historical benchmark standings and comparison context."
						/>
						<Suspense fallback={<BenchmarksSectionSkeleton />}>
							<ModelBenchmarksSection
								modelId={modelId}
								includeHidden={includeHidden}
								hideWhenEmpty
							/>
						</Suspense>
					</Section>
				) : null}
				{hasInternalModelData ? (
					<>
						<Section id="about" showDivider={showBenchmarks}>
							<SectionHeader
								title="About"
								description="Archived dates, capabilities, links, and model metadata."
							/>
							<Suspense fallback={<AboutSectionSkeleton />}>
								<ModelAboutSection model={model!} />
							</Suspense>
						</Section>
						{showSubscriptions ? (
							<Section id="subscriptions">
								<SectionHeader
									title="Subscriptions"
									description="Historical commercial plans and bundled access that listed this model."
								/>
								<Suspense fallback={<SubscriptionsSectionSkeleton />}>
									<ModelSubscriptionsSection
										modelId={modelId}
										ownerOrganisationId={model?.organisation_id}
										ownerOrganisationName={model?.organisation?.name}
									/>
								</Suspense>
							</Section>
						) : null}
					</>
				) : null}
			</div>
		);
	}

	return (
		<div className="space-y-10">
			<Section id="providers" showDivider={false}>
				<SectionHeader
					title="Providers"
					description="API providers, route pricing, availability, and recent reliability signals."
				/>
				<Suspense fallback={<ProvidersSectionSkeleton />}>
					<ModelProvidersSection modelId={modelId} includeHidden={includeHidden} />
				</Suspense>
			</Section>
			<Section id="performance">
				<SectionHeader
					title="Performance"
					description="Latency, throughput, and reliability signals from recent traffic."
				/>
				<Suspense fallback={<PerformanceSectionSkeleton />}>
					<ModelPerformanceSection
						modelId={modelId}
						includeHidden={includeHidden}
						performancePromise={performancePromise}
					/>
				</Suspense>
			</Section>
			<Section id="pricing">
				<SectionHeader
					title="Pricing"
					description="Weighted provider pricing over the last 30 days, with recent route pricing history below."
				/>
				<Suspense fallback={<PricingSectionSkeleton />}>
					<ModelPricingInsightsOverviewSection
						modelId={modelId}
						includeHidden={includeHidden}
					/>
				</Suspense>
			</Section>
			{showBenchmarks ? (
				<Section id="benchmarks">
					<SectionHeader
						title="Benchmarks"
						description="Headline benchmark standings and comparison context."
					/>
					<Suspense fallback={<BenchmarksSectionSkeleton />}>
						<ModelBenchmarksSection
							modelId={modelId}
							includeHidden={includeHidden}
							hideWhenEmpty
						/>
					</Suspense>
				</Section>
			) : null}
			<Section id="activity">
				<SectionHeader
					title="Activity"
					description="Daily gateway activity over the last 30 days, with current UTC-day pace projection."
				/>
				<Suspense fallback={<ActivitySectionSkeleton />}>
					<ModelActivitySection modelId={modelId} includeHidden={includeHidden} />
				</Suspense>
			</Section>
			<Section id="apps">
				<SectionHeader
					title="Apps Using This Model"
					description="Public apps observed in gateway request traffic for this model."
				/>
				<Suspense fallback={<AppsSectionSkeleton />}>
					<ModelAppsSection modelId={modelId} includeHidden={includeHidden} />
				</Suspense>
			</Section>
			<Section id="uptime">
				<SectionHeader
					title="Model Uptime"
					description="Uptime trend for this model over the last 24 hours."
				/>
				<Suspense fallback={<UptimeSectionSkeleton />}>
					<ModelUptimeSection
						modelId={modelId}
						performancePromise={performancePromise}
					/>
				</Suspense>
			</Section>
			<Section id="quickstart">
				<SectionHeader
					title="Quickstart"
					description="Start calling this model with endpoint-specific examples."
				/>
				<Suspense fallback={<QuickstartSectionSkeleton />}>
					<ModelQuickstartSection
						modelId={modelId}
						includeHidden={includeHidden}
						surface="overview"
						quickstartRequestContext={quickstartRequestContext}
					/>
				</Suspense>
			</Section>
			{hasInternalModelData ? (
				<>
					<Section id="about">
						<SectionHeader
							title="About"
							description="Key dates, capabilities, and model metadata."
						/>
						<Suspense fallback={<AboutSectionSkeleton />}>
							<ModelAboutSection model={model!} />
						</Suspense>
					</Section>
					{showSubscriptions ? (
						<Section id="subscriptions">
							<SectionHeader
								title="Subscriptions"
								description="Commercial plans and bundled access that currently include this model."
							/>
							<Suspense fallback={<SubscriptionsSectionSkeleton />}>
								<ModelSubscriptionsSection
									modelId={modelId}
									ownerOrganisationId={model?.organisation_id}
									ownerOrganisationName={model?.organisation?.name}
								/>
							</Suspense>
						</Section>
					) : null}
				</>
			) : null}
		</div>
	);
}
