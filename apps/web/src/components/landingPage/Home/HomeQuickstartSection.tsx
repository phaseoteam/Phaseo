"use client";

import {
	useEffect,
	useState,
	useSyncExternalStore,
	type ComponentProps,
	type ReactNode,
} from "react";
import Link from "next/link";
import {
	ArrowRight,
	AudioLines,
	BadgeCheck,
	ImageIcon,
	MessageSquareText,
	Mic,
	Music2,
	Radio,
	Sparkles,
	Subtitles,
	Video,
	Workflow,
} from "lucide-react";
import NumberFlow from "@number-flow/react";
import { Logo } from "@/components/Logo";
import { getModalityTone } from "@/lib/models/modalityStyles";

type Benefit = {
	title: string;
	body: string;
	href: string;
	cta: string;
	visual: "models" | "uptime" | "observability" | "database" | "modalities";
};

type QuickstartVariant = "default" | "beta";
type NumberFlowFormat = ComponentProps<typeof NumberFlow>["format"];

export type LandingOpenModelIntelEntry = {
	providerId: string;
	name: string;
	model: string;
	latencyMs: number;
	throughputTps: number;
	inputPrice: number;
	outputPrice: number;
};

function useIsHydrated() {
	return useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);
}

function HydratedNumberFlow({
	value,
	format,
}: {
	value: number;
	format?: NumberFlowFormat;
}) {
	const isHydrated = useIsHydrated();

	if (!isHydrated) {
		return <>{new Intl.NumberFormat("en-US", format).format(value)}</>;
	}

	return <NumberFlow value={value} format={format} />;
}

const BENEFITS_DEFAULT: Benefit[] = [
	{
		title: "Open Model Intelligence",
		body: "Explore benchmarks, pricing, and provider coverage to make better build decisions.",
		href: "/models",
		cta: "Explore database",
		visual: "database",
	},
	{
		title: "Unified AI Gateway",
		body: "Integrate once and access hundreds of models through one OpenAI-compatible API.",
		href: "/models",
		cta: "Browse models",
		visual: "models",
	},
	{
		title: "Every AI workload",
		body: "Build with text, images, video, audio, realtime, batch, and more through one API.",
		href: "https://phaseo.app/docs/v1",
		cta: "Explore Gateway",
		visual: "modalities",
	},
	{
		title: "Request Observability",
		body: "Monitor pricing, reliability, usage, and performance for every request in one place.",
		href: "/settings/usage",
		cta: "View activity",
		visual: "observability",
	},
];

const PROVIDERS = [
	"ai21",
	"aion-labs",
	"alibaba-cloud",
	"amazon-bedrock",
	"anthropic",
	"atlascloud",
	"azure",
	"baseten",
	"black-forest-labs",
	"bytedance-seed",
	"cerebras",
	"chutes",
	"clarifai",
	"cloudflare",
	"cohere",
	"crusoe",
	"deepinfra",
	"deepseek",
	"fireworks",
	"friendli",
	"gmicloud",
	"google",
	"google-vertex",
	"groq",
	"hyperbolic",
	"infermatic",
	"inflection",
	"liquid-ai",
	"minimax-lightning",
	"mistral",
	"moonshotai",
	"morph",
	"nebius-token-factory",
	"novita",
	"openai",
	"parasail",
	"perplexity",
	"phala",
	"sambanova",
	"siliconflow",
	"sourceful",
	"suno",
	"together",
	"weights-and-biases",
	"spacex-ai",
	"z-ai",
	"xiaomi",
	"arcee-ai",
	"stepfun",
	"inceptron",
	"nvidia",
	"venice",
	"nextbit",
	"elevenlabs",
	"inception",
	"nousresearch",
] as const;

const BENEFITS_BETA: Benefit[] = BENEFITS_DEFAULT;

const GRID_COLUMNS = 8;
const GRID_ROWS = 7;
const FEATURED_PROVIDER_IDS = [
	"openai",
	"anthropic",
	"google",
	"google-vertex",
	"deepseek",
	"spacex-ai",
	"mistral",
	"groq",
	"amazon-bedrock",
	"azure",
	"nvidia",
	"perplexity",
	"together",
	"moonshotai",
	"cerebras",
	"cohere",
] as const;

const MAX_AVAILABILITY_PROVIDER_IDS = [
	"azure",
	"amazon-bedrock",
	"cerebras",
	"cloudflare",
	"deepinfra",
	"fireworks",
	"groq",
	"together",
	"novita",
	"venice",
] as const;

const MAX_AVAILABILITY_RING = [
	{ id: "azure", top: "21%", left: "16%" },
	{ id: "amazon-bedrock", top: "14%", left: "33%" },
	{ id: "cerebras", top: "11%", left: "50%" },
	{ id: "cloudflare", top: "14%", left: "67%" },
	{ id: "deepinfra", top: "21%", left: "84%" },
	{ id: "fireworks", top: "79%", left: "84%" },
	{ id: "groq", top: "86%", left: "67%" },
	{ id: "together", top: "89%", left: "50%" },
	{ id: "novita", top: "86%", left: "33%" },
	{ id: "venice", top: "79%", left: "16%" },
] as const;

function getCenterFirstIndexes(columns: number, rows: number) {
	const centerColumn = (columns - 1) / 2;
	const centerRow = (rows - 1) / 2;

	return Array.from({ length: columns * rows }, (_, index) => index).sort(
		(a, b) => {
			const aColumn = a % columns;
			const aRow = Math.floor(a / columns);
			const bColumn = b % columns;
			const bRow = Math.floor(b / columns);

			const aDistance =
				Math.abs(aColumn - centerColumn) + Math.abs(aRow - centerRow);
			const bDistance =
				Math.abs(bColumn - centerColumn) + Math.abs(bRow - centerRow);

			if (aDistance !== bDistance) return aDistance - bDistance;

			if (aRow !== bRow) return aRow - bRow;
			return aColumn - bColumn;
		}
	);
}

function buildModelsVisualProviders(providerIds: readonly string[]) {
	const availableIds = new Set(providerIds);
	const featured = FEATURED_PROVIDER_IDS.filter((id) => availableIds.has(id));
	const featuredSet = new Set<string>(featured);
	const remaining = providerIds
		.filter((id) => !featuredSet.has(id))
		.sort((a, b) => a.localeCompare(b));
	const ranked = [...featured, ...remaining];

	const visibleCells = GRID_COLUMNS * GRID_ROWS;
	const centerFirstIndexes = getCenterFirstIndexes(GRID_COLUMNS, GRID_ROWS);
	const visibleGrid = new Array<string | undefined>(visibleCells).fill(
		undefined
	);

	for (
		let index = 0;
		index < Math.min(visibleCells, ranked.length);
		index += 1
	) {
		visibleGrid[centerFirstIndexes[index]] = ranked[index];
	}

	const visibleOrdered = visibleGrid.filter(
		(providerId): providerId is string => Boolean(providerId)
	);

	return [...visibleOrdered, ...ranked.slice(visibleCells)];
}

const MODELS_VISUAL_PROVIDERS = buildModelsVisualProviders(PROVIDERS);

const ROUTE_PATHS = [
	{ d: "M110 0 C110 20, 30 28, 30 82", delay: "0s" },
	{ d: "M110 0 C110 24, 110 30, 110 82", delay: "1.25s" },
	{ d: "M110 0 C110 20, 190 28, 190 82", delay: "2.5s" },
] as const;

function LogoToken({
	id,
	label,
	size = 14,
	shape = "circle",
	compact = false,
}: {
	id: string;
	label: string;
	size?: number;
	shape?: "circle" | "card";
	compact?: boolean;
}) {
	const baseSizeClass = compact ? "h-5 w-5" : "h-6 w-6";
	const shellClass =
		shape === "card"
			? `group flex ${baseSizeClass} items-center justify-center rounded-md border border-zinc-200/80 bg-transparent transition-colors hover:bg-zinc-50/70 dark:border-zinc-800/80 dark:hover:bg-zinc-900/60`
			: `group flex ${baseSizeClass} items-center justify-center rounded-full border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all duration-200 hover:scale-[1.04] hover:border-zinc-300 hover:shadow-[0_8px_20px_rgba(15,23,42,0.12)] dark:border-zinc-700 dark:bg-zinc-950 dark:shadow-none dark:hover:border-zinc-600`;

	return (
		<div className={shellClass}>
			<span className="relative" style={{ width: size, height: size }}>
				<Logo
					id={id}
					alt={label}
					variant="color"
					fill
					sizes={`${size}px`}
					className="object-contain object-center transition-transform duration-200 group-hover:scale-105"
					fallback={<span className="block h-2.5 w-2.5 rounded-full bg-zinc-500" aria-hidden="true" />}
				/>
			</span>
		</div>
	);
}

function VisualStage({ children }: { children: ReactNode }) {
	return <div className="relative flex h-full items-center justify-center overflow-hidden">{children}</div>;
}

function ModelsVisual({ variant = "default" }: { variant?: QuickstartVariant }) {
	const compactBetaIconSize = 13;

	return (
		<VisualStage>
			<div className="relative flex h-full w-full items-center justify-center overflow-hidden">
				<div
					className={
						variant === "beta"
							? "grid w-full grid-cols-8 place-items-center gap-x-2.5 gap-y-2 px-4"
							: "grid w-max grid-cols-8 auto-rows-max place-items-center gap-x-3.25 gap-y-2.25"
					}
				>
					{MODELS_VISUAL_PROVIDERS.map((providerId) => (
						<LogoToken
							key={providerId}
							id={providerId}
							label={providerId}
							shape={variant === "beta" ? "card" : "circle"}
							size={variant === "beta" ? compactBetaIconSize : 14}
							compact={variant === "beta"}
						/>
					))}
				</div>
				{variant === "beta" ? (
					<>
						<div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white via-white/90 to-transparent dark:from-zinc-950 dark:via-zinc-950/90 dark:to-transparent" />
						<div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white via-white/90 to-transparent dark:from-zinc-950 dark:via-zinc-950/90 dark:to-transparent" />
					</>
				) : null}
			</div>
		</VisualStage>
	);
}

function RequestPulse({
	d,
	pathId,
	delay,
}: {
	d?: string;
	pathId?: string;
	delay: string;
}) {
	return (
		<>
			<circle
				r="3.6"
				opacity="0"
				fill="currentColor"
				className="text-zinc-500 dark:text-zinc-400"
				stroke="rgba(255,255,255,0.88)"
				strokeWidth="1.05"
			>
				<animate attributeName="opacity" values="0;1;0" dur="3.8s" begin={delay} repeatCount="indefinite" />
				{pathId ? (
					<animateMotion dur="3.8s" begin={delay} repeatCount="indefinite">
						<mpath href={`#${pathId}`} />
					</animateMotion>
				) : d ? (
					<animateMotion dur="3.8s" begin={delay} repeatCount="indefinite" path={d} />
				) : null}
			</circle>
		</>
	);
}

function UptimeVisual({ variant = "default" }: { variant?: QuickstartVariant }) {
	if (variant === "beta") {
		return (
			<VisualStage>
				<div className="w-full px-3">
					<div
						className="relative mx-auto h-[138px] w-full max-w-[276px]"
						aria-hidden="true"
					>
						{MAX_AVAILABILITY_RING.map((provider) => (
							<div
								key={provider.id}
								className="absolute z-0 -translate-x-1/2 -translate-y-1/2"
								style={{ top: provider.top, left: provider.left }}
								aria-hidden="true"
							>
								<LogoToken
									id={provider.id}
									label={provider.id}
									shape="card"
									size={15}
									compact={false}
								/>
							</div>
						))}
						<div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
							<div className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
								<span className="relative h-[18px] w-[18px] shrink-0">
									<Logo
										id="openai"
										alt="OpenAI"
										variant="color"
										fill
										sizes="18px"
										className="object-contain object-center"
									/>
								</span>
								<span className="whitespace-nowrap text-[12px] font-semibold leading-none text-zinc-950 dark:text-zinc-50">
									GPT-OSS 120B
								</span>
							</div>
						</div>
					</div>
				</div>
			</VisualStage>
		);
	}

	if (false) {
		return (
			<VisualStage>
				<div className="w-full max-w-[272px] space-y-2.5">
					<div className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
						<span className="relative h-3.5 w-3.5">
							<Logo
								id="openai"
								alt="OpenAI"
								variant="color"
								fill
								sizes="14px"
								className="object-contain object-center"
							/>
						</span>
						<span>openai/gpt-oss-120b</span>
					</div>
					<div className="rounded-2xl border border-zinc-200/80 bg-white/96 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/96">
						<div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
							<div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 px-2 py-2 text-center dark:border-zinc-800 dark:bg-zinc-900/70">
								<p className="text-[10px] font-semibold text-zinc-800 dark:text-zinc-100">App</p>
							</div>
							<span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">↔</span>
							<div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 px-2 py-2 text-center dark:border-zinc-800 dark:bg-zinc-900/70">
								<p className="text-[10px] font-semibold text-zinc-800 dark:text-zinc-100">Phaseo</p>
							</div>
							<span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">↔</span>
							<div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 px-2 py-2 text-center dark:border-zinc-800 dark:bg-zinc-900/70">
								<p className="text-[10px] font-semibold text-zinc-800 dark:text-zinc-100">Providers</p>
							</div>
						</div>
						<div className="mt-2.5 flex items-center justify-center gap-1.5">
							<LogoToken id="openai" label="OpenAI" shape="card" compact size={12} />
							<LogoToken id="groq" label="Groq" shape="card" compact size={12} />
							<LogoToken id="cerebras" label="Cerebras" shape="card" compact size={12} />
							<LogoToken id="novita" label="Novita" shape="card" compact size={12} />
							<LogoToken id="deepseek" label="DeepSeek" shape="card" compact size={12} />
						</div>
						<div className="mt-2 rounded-lg border border-zinc-200/80 bg-zinc-50/70 px-2 py-1.5 text-center text-[10px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
							Health-aware routing with automatic failover
						</div>
					</div>
				</div>
			</VisualStage>
		);
	}

	const badgeRounding = "rounded-full";
	return (
		<VisualStage>
			<div className="flex h-full w-full flex-col items-center justify-center">
				<div className={`inline-flex items-center gap-1.5 border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 ${badgeRounding}`}>
					<span className="relative h-3.5 w-3.5">
						<Logo
							id="openai"
							alt="OpenAI"
							variant="color"
							fill
							sizes="14px"
							className="object-contain object-center"
						/>
					</span>
					<span>openai/gpt-oss-120b</span>
				</div>
				<div className="relative mt-1 h-[98px] w-full max-w-[220px]">
					<svg viewBox="0 0 220 98" className="absolute inset-0 h-full w-full" aria-hidden="true">
						{ROUTE_PATHS.map((path) => (
							<path
								key={path.d + "-glow"}
								d={path.d}
								fill="none"
								stroke="rgba(255,255,255,0.28)"
								strokeWidth="3"
								strokeLinecap="round"
							/>
						))}
						{ROUTE_PATHS.map((path) => (
							<path
								key={path.d}
								d={path.d}
								fill="none"
								stroke="currentColor"
								className="text-zinc-400 dark:text-zinc-600"
								strokeWidth="1.75"
								strokeLinecap="round"
							/>
						))}
						{ROUTE_PATHS.map((path) => (
							<RequestPulse key={path.d + path.delay} d={path.d} delay={path.delay} />
						))}
					</svg>
					<div className="absolute bottom-0 left-4"><LogoToken id="cerebras" label="Cerebras" size={16} /></div>
					<div className="absolute bottom-0 left-1/2 -translate-x-1/2"><LogoToken id="novita" label="Novita" size={16} /></div>
					<div className="absolute bottom-0 right-4"><LogoToken id="groq" label="Groq" size={16} /></div>
				</div>
			</div>
		</VisualStage>
	);
}

const WORKLOADS = [
	{ label: "Text", detail: "Chat & responses", icon: MessageSquareText, tone: "text" },
	{ label: "Images", detail: "Generate & edit", icon: ImageIcon, tone: "image" },
	{ label: "Video", detail: "Prompt to video", icon: Video, tone: "video" },
	{ label: "Text to Speech", detail: "Natural voice", icon: Mic, tone: "audio_tts" },
	{ label: "Transcription", detail: "Speech to text", icon: Subtitles, tone: "audio_stt" },
	{ label: "Music", detail: "Generate audio", icon: Music2, tone: "audio_music" },
	{ label: "Moderation", detail: "Text & images", icon: BadgeCheck, tone: "moderations" },
	{ label: "Embeddings", detail: "Vector search", icon: Sparkles, tone: "embeddings" },
	{ label: "Realtime", detail: "Live interactions", icon: Radio, tone: "rerank" },
	{ label: "Batch", detail: "Async processing", icon: Workflow, tone: "file" },
] as const;

function ModalityTicker({
	workloads,
	speed,
}: {
	workloads: readonly (typeof WORKLOADS)[number][];
	speed: number;
}) {
	const loopedWorkloads = [...workloads, ...workloads];

	return (
		<div className="h-[150px] overflow-hidden">
			<div
				className="space-y-1.5 px-0.5 py-1 motion-reduce:[animation:none]"
				style={{ animation: `modality-ticker ${speed}s linear infinite` }}
			>
				{loopedWorkloads.map((workload, index) => {
					const Icon = workload.icon;
					const tone = getModalityTone(workload.tone);

					return (
						<div
							key={`${workload.label}-${index}`}
							className="flex h-[46px] items-center gap-2 rounded-xl border border-zinc-200/80 bg-white/80 px-2.5 py-2 dark:border-zinc-800/80 dark:bg-zinc-950/80"
						>
							<Icon className={`h-3.5 w-3.5 shrink-0 ${tone.iconClassName}`} />
							<span className="min-w-0 flex-1">
								<span className="block whitespace-nowrap text-[10px] font-semibold leading-tight text-zinc-950 dark:text-zinc-50">
									{workload.label}
								</span>
								<span className="mt-0.5 block whitespace-nowrap text-[9px] leading-tight text-zinc-500 dark:text-zinc-400">
									{workload.detail}
								</span>
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function ModalitiesVisual() {
	const columns = [
		WORKLOADS.filter((_, index) => index % 2 === 0),
		WORKLOADS.filter((_, index) => index % 2 === 1),
	] as const;

	return (
		<VisualStage>
			<div className="w-full max-w-[340px] space-y-2.5">
				<div className="flex items-center justify-between px-1">
					<span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
						Gateway capabilities
					</span>
					<span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
						{WORKLOADS.length} workloads
					</span>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<ModalityTicker workloads={columns[0]} speed={16} />
					<ModalityTicker workloads={columns[1]} speed={16} />
				</div>
			</div>
		</VisualStage>
	);
}

function ObservabilityVisual() {
	const requests = [
		{
			providerId: "openai",
			model: "GPT-5.6 Sol",
			path: "/v1/responses",
			latency: "612 ms",
			throughput: "91 tok/s",
			cost: "$0.018",
			status: "200 OK",
			statusTone:
				"bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
		},
		{
			providerId: "anthropic",
			model: "Claude Fable 5",
			path: "/v1/messages",
			latency: "958 ms",
			throughput: "61 tok/s",
			cost: "$0.041",
			status: "200 OK",
			statusTone:
				"bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
		},
		{
			providerId: "google",
			model: "Gemini 3.1 Pro",
			path: "/v1/generate",
			latency: "684 ms",
			throughput: "88 tok/s",
			cost: "$0.014",
			status: "200 OK",
			statusTone:
				"bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
		},
		{
			providerId: "x-ai",
			model: "Grok 4.5",
			path: "/v1/chat",
			latency: "488 ms",
			throughput: "112 tok/s",
			cost: "$0.012",
			status: "200 OK",
			statusTone:
				"bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
		},
	] as const;
	const [hoveredRequestIndex, setHoveredRequestIndex] = useState<number | null>(
		null,
	);
	const selectedRequest =
		hoveredRequestIndex === null
			? requests[0]
			: requests[hoveredRequestIndex];

	return (
		<VisualStage>
			<div className="relative flex h-full w-full flex-col justify-center px-5 py-3">
				<div
					className="space-y-1"
					onMouseLeave={() => setHoveredRequestIndex(null)}
				>
					{requests.map((request, index) => {
						const isHovered = index === hoveredRequestIndex;

						return (
							<div
								key={`${request.providerId}-${request.path}`}
								onMouseEnter={() => setHoveredRequestIndex(index)}
								className={`grid min-h-6 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2.5 py-0.5 transition-colors ${
									isHovered
										? "border-zinc-300 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/60"
										: "border-zinc-200/80 bg-white hover:border-zinc-300 hover:bg-zinc-50/70 dark:border-zinc-800/80 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/50"
								}`}
							>
								<div className="flex min-w-0 items-center gap-1.5 self-center">
									<span className="relative h-3 w-3 shrink-0">
										<Logo
											id={request.providerId}
											alt={request.providerId}
											variant="color"
											fill
											sizes="12px"
											className="object-contain object-center"
										/>
									</span>
									<div className="min-w-0">
										<p className="truncate text-[10px] font-semibold leading-none text-zinc-950 dark:text-zinc-50">
											{request.model}
										</p>
									</div>
								</div>
								<div className="flex items-center justify-end self-center text-right">
									<span
										className={`inline-flex rounded-full px-1.5 py-0.5 text-[8px] font-semibold leading-none ${request.statusTone}`}
									>
										{request.status}
									</span>
								</div>
							</div>
						);
					})}
				</div>
				<div
					className={`pointer-events-none absolute right-4 top-11 w-[136px] rounded-xl border border-zinc-200/90 bg-white p-2 shadow-[0_12px_30px_rgba(15,23,42,0.14)] transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-[0_12px_30px_rgba(2,6,23,0.42)] ${
						hoveredRequestIndex === null
							? "translate-y-1 opacity-0"
							: "translate-y-0 opacity-100"
					}`}
					aria-hidden="true"
				>
					<div className="flex items-center gap-1.5">
						<span className="relative h-3.5 w-3.5 shrink-0">
							<Logo
								id={selectedRequest.providerId}
								alt={selectedRequest.providerId}
								variant="color"
								fill
								sizes="14px"
								className="object-contain object-center"
							/>
						</span>
						<p className="truncate text-[10px] font-semibold leading-none text-zinc-950 dark:text-zinc-50">
							{selectedRequest.model}
						</p>
					</div>
					<div className="mt-2 grid gap-1 text-[9px] leading-none">
						<div className="flex justify-between gap-2">
							<span className="text-zinc-500 dark:text-zinc-400">Latency</span>
							<span className="font-semibold text-zinc-950 dark:text-zinc-50">
								{selectedRequest.latency}
							</span>
						</div>
						<div className="flex justify-between gap-2">
							<span className="text-zinc-500 dark:text-zinc-400">
								Throughput
							</span>
							<span className="font-semibold text-zinc-950 dark:text-zinc-50">
								{selectedRequest.throughput}
							</span>
						</div>
						<div className="flex justify-between gap-2">
							<span className="text-zinc-500 dark:text-zinc-400">Cost</span>
							<span className="font-semibold text-zinc-950 dark:text-zinc-50">
								{selectedRequest.cost}
							</span>
						</div>
					</div>
				</div>
			</div>
		</VisualStage>
	);
}

const BETA_OPEN_MODEL_INTEL: LandingOpenModelIntelEntry[] = [
	{
		providerId: "openai",
		name: "GPT-5.6 Sol",
		model: "openai/gpt-5.6-sol",
		latencyMs: 472,
		throughputTps: 92,
		inputPrice: 12.5,
		outputPrice: 75.0,
	},
	{
		providerId: "anthropic",
		name: "Claude Fable 5",
		model: "anthropic/claude-fable-5",
		latencyMs: 548,
		throughputTps: 79,
		inputPrice: 10.0,
		outputPrice: 50.0,
	},
	{
		providerId: "google",
		name: "Gemini 3.1 Pro",
		model: "google/gemini-3.1-pro-preview",
		latencyMs: 441,
		throughputTps: 101,
		inputPrice: 2.0,
		outputPrice: 12.0,
	},
	{
		providerId: "minimax",
		name: "MiniMax M3",
		model: "minimax/minimax-m3",
		latencyMs: 388,
		throughputTps: 108,
		inputPrice: 0.3,
		outputPrice: 1.2,
	},
	{
		providerId: "deepseek",
		name: "DeepSeek V4 Pro",
		model: "deepseek/deepseek-v4-pro",
		latencyMs: 405,
		throughputTps: 94,
		inputPrice: 1.68,
		outputPrice: 3.38,
	},
	{
		providerId: "moonshotai",
		name: "Kimi K2.7 Code",
		model: "moonshotai/kimi-k2.7-code",
		latencyMs: 423,
		throughputTps: 89,
		inputPrice: 0.95,
		outputPrice: 4.0,
	},
] as const;

function BetaModelHeader({
	providerId,
	providerLabel,
	name,
	nameSlot,
	showLabel = true,
}: {
	providerId: string;
	providerLabel: string;
	name?: string;
	nameSlot?: ReactNode;
	showLabel?: boolean;
}) {
	return (
		<div className="border-b border-zinc-200/80 pb-1.5 dark:border-zinc-800/80">
			<div className="min-w-0">
				{showLabel ? (
					<span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
						Model
					</span>
				) : null}
				{nameSlot ?? (
					<div
						className={`${showLabel ? "mt-1" : ""} flex min-h-6 items-center gap-2`}
					>
						<span className="relative h-4 w-4 shrink-0">
							<Logo
								id={providerId}
								alt={providerLabel}
								variant="color"
								fill
								sizes="16px"
								className="object-contain object-center"
							/>
						</span>
						<p className="truncate text-[11px] font-semibold leading-4 text-zinc-950 dark:text-zinc-50">
							{name}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

function BetaDatabaseVisual() {
	const [activeIndex, setActiveIndex] = useState(0);
	const [nextIndex, setNextIndex] = useState<number | null>(null);
	const [isSliding, setIsSliding] = useState(false);
	const modelPool = BETA_OPEN_MODEL_INTEL;

	useEffect(() => {
		if (isSliding) return;

		const timer = window.setTimeout(() => {
			setNextIndex((activeIndex + 1) % modelPool.length);
			setIsSliding(true);
		}, 2600);
		return () => window.clearTimeout(timer);
	}, [activeIndex, isSliding, modelPool.length]);

	useEffect(() => {
		if (!isSliding || nextIndex === null) return;

		const timer = window.setTimeout(() => {
			setActiveIndex(nextIndex);
			setNextIndex(null);
			setIsSliding(false);
		}, 320);

		return () => window.clearTimeout(timer);
	}, [isSliding, nextIndex]);

	const currentModel = modelPool[activeIndex] ?? modelPool[0];
	const incomingModel =
		nextIndex === null ? currentModel : modelPool[nextIndex] ?? currentModel;

	return (
		<div className="w-full px-4">
			<div className="space-y-3">
				<BetaModelHeader
					providerId={currentModel.providerId}
					providerLabel={currentModel.providerId}
					showLabel={false}
					nameSlot={
						<div className="h-6 overflow-hidden">
							<div
								className={
									isSliding
										? "-translate-y-6 transition-transform duration-300 ease-out"
										: "translate-y-0"
								}
							>
								{[currentModel, incomingModel].map((model, index) => (
									<div
										key={`${model.model}-${index}`}
										className="flex h-6 items-center gap-2 pt-px"
									>
										<span className="relative h-4 w-4 shrink-0">
											<Logo
												id={model.providerId}
												alt={model.providerId}
												variant="color"
												fill
												sizes="16px"
												className="object-contain object-center"
											/>
										</span>
										<p className="truncate text-[12px] font-semibold leading-6 text-zinc-950 dark:text-zinc-50">
											{model.name}
										</p>
									</div>
								))}
							</div>
						</div>
					}
				/>
				<div
					className="grid grid-cols-2 gap-4 xl:grid-cols-[0.9fr_1fr_1.2fr]"
					data-nosnippet
				>
					<div>
						<span className="text-[9px] font-medium text-zinc-500 dark:text-zinc-400">
							Latency
						</span>
						<p className="mt-1 text-[16px] font-semibold leading-none tracking-[-0.04em] text-zinc-950 dark:text-zinc-50">
							<HydratedNumberFlow value={currentModel.latencyMs} />
							<span className="ml-0.5 text-[10px] font-medium tracking-normal text-zinc-500 dark:text-zinc-400">
								ms
							</span>
						</p>
					</div>
					<div>
						<span className="text-[9px] font-medium text-zinc-500 dark:text-zinc-400">
							Throughput
						</span>
						<p className="mt-1 text-[16px] font-semibold leading-none tracking-[-0.04em] text-zinc-950 dark:text-zinc-50">
							<HydratedNumberFlow value={currentModel.throughputTps} />
							<span className="ml-0.5 text-[10px] font-medium tracking-normal text-zinc-500 dark:text-zinc-400">
								tok/s
							</span>
						</p>
					</div>
					<div className="hidden text-right xl:block">
						<span className="text-[9px] font-medium text-zinc-500 dark:text-zinc-400">
							Pricing
						</span>
						<p className="mt-1 whitespace-nowrap text-[12px] font-semibold leading-none text-zinc-950 dark:text-zinc-50">
							$<HydratedNumberFlow value={currentModel.inputPrice} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
							<span className="px-1 text-zinc-400 dark:text-zinc-500">/</span>$
							<HydratedNumberFlow value={currentModel.outputPrice} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

function DatabaseVisual({
	variant = "default",
}: {
	variant?: QuickstartVariant;
}) {
	if (variant === "beta") {
		return (
			<VisualStage>
				<div className="flex h-full w-full items-center justify-center">
					<BetaDatabaseVisual />
				</div>
			</VisualStage>
		);
	}

	return (
		<VisualStage>
			<div className="w-full max-w-[232px] space-y-1.5">
				{[
					["Latency", "472ms"],
					["Throughput", "184 tok/s"],
					["GPQA Score", "86.4"],
					["Rank", "#7 Overall"],
				].map(([label, value], index) => (
					<div
						key={label}
						className="rounded-[1.1rem] border border-zinc-200/80 bg-white/96 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/96"
					>
						<div className="flex items-center justify-between gap-3">
							<span className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</span>
							<span
								className={index >= 2
									? "text-[13px] font-semibold leading-none text-zinc-950 dark:text-zinc-50"
									: "text-[13px] font-medium leading-none text-zinc-950 dark:text-zinc-50"}
							>
								{value}
							</span>
						</div>
					</div>
				))}
			</div>
		</VisualStage>
	);
}

function BenefitVisual({
	visual,
	variant = "default",
}: {
	visual: Benefit["visual"];
	variant?: QuickstartVariant;
}) {
	switch (visual) {
		case "models":
			return <ModelsVisual variant={variant} />;
		case "uptime":
			return <UptimeVisual variant={variant} />;
		case "modalities":
			return <ModalitiesVisual />;
		case "observability":
			return <ObservabilityVisual />;
		case "database":
		default:
			return <DatabaseVisual variant={variant} />;
	}
}

export default function HomeQuickstartSection({
	variant = "default",
}: {
	variant?: QuickstartVariant;
}) {
	const benefits = variant === "beta" ? BENEFITS_BETA : BENEFITS_DEFAULT;

	return (
		<div className="mx-auto mt-6 max-w-7xl">
			<div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
				{benefits.map((benefit) => (
					<Link
						key={benefit.title}
						href={benefit.href}
						className="group min-w-0 overflow-hidden rounded-[1.75rem] border border-zinc-200/80 bg-white transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10 dark:focus-visible:ring-zinc-100/10"
					>
						<div
							className={`border-b border-zinc-200/80 bg-white px-2 py-3 dark:border-zinc-800 dark:bg-zinc-950 ${
								variant === "beta" ? "h-40" : "h-48"
							}`}
						>
							<BenefitVisual
								visual={benefit.visual}
								variant={variant}
							/>
						</div>
						<div className="space-y-4 px-6 py-5 text-left">
							<div className="space-y-2">
								<h3 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-zinc-950 dark:text-zinc-50">
									{benefit.title}
								</h3>
								<p
									className={`text-sm leading-6 text-zinc-600 dark:text-zinc-300 ${
										variant === "beta" ? "min-h-[4.5rem]" : ""
									}`}
								>
									{benefit.body}
								</p>
							</div>
							<span className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 transition-colors group-hover:text-zinc-900 dark:text-zinc-300 dark:group-hover:text-zinc-100">
								{benefit.cta}
								<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
							</span>
						</div>
					</Link>
				))}
			</div>
		</div>
	);
}





