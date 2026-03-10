import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import ThroughputLiveChart from "./ThroughputLiveChart";

type Benefit = {
	title: string;
	body: string;
	href: string;
	cta: string;
	visual: "models" | "uptime" | "observability" | "database";
};

const BENEFITS: Benefit[] = [
	{
		title: "Open Model Intelligence",
		body: "Explore benchmarks, pricing, and provider coverage to make better build decisions.",
		href: "/models",
		cta: "Explore database",
		visual: "database",
	},
	{
		title: "Unified AI Gateway",
		body: "Integrate once and access hundreds of models across major providers through a single OpenAI-compatible API.",
		href: "/models",
		cta: "Browse models",
		visual: "models",
	},
	{
		title: "Maximum Availability",
		body: "Route requests across providers and keep traffic moving when a model endpoint degrades.",
		href: "/sign-up",
		cta: "Get started",
		visual: "uptime",
	},
	{
		title: "Price & Performance Insights",
		body: "Track latency, throughput, and price trends before choosing a model for production.",
		href: "/tools/pricing-calculator",
		cta: "Explore tools",
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
	"x-ai",
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

const GRID_COLUMNS = 8;
const GRID_ROWS = 7;
const FEATURED_PROVIDER_IDS = [
	"openai",
	"anthropic",
	"google",
	"google-vertex",
	"deepseek",
	"x-ai",
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

function LogoToken({ id, label, size = 14 }: { id: string; label: string; size?: number }) {
	return (
		<div className="group flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all duration-200 hover:scale-[1.04] hover:border-zinc-300 hover:shadow-[0_8px_20px_rgba(15,23,42,0.12)] dark:border-zinc-700 dark:bg-zinc-950 dark:shadow-none dark:hover:border-zinc-600">
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

function ModelsVisual() {
	return (
		<VisualStage>
			<div className="flex h-full w-full items-center justify-center overflow-hidden">
				<div className="grid w-max grid-cols-8 auto-rows-max place-items-center gap-x-3.25 gap-y-2.25">
					{MODELS_VISUAL_PROVIDERS.map((providerId) => (
						<LogoToken key={providerId} id={providerId} label={providerId} />
					))}
				</div>
			</div>
		</VisualStage>
	);
}

function RequestPulse({ d, delay }: { d: string; delay: string }) {
	return (
		<>
			<circle
				r="3.6"
				fill="currentColor"
				className="text-zinc-500 dark:text-zinc-400"
				stroke="rgba(255,255,255,0.88)"
				strokeWidth="1.05"
			>
				<animate attributeName="opacity" values="0;1;0" dur="3.8s" begin={delay} repeatCount="indefinite" />
				<animateMotion dur="3.8s" begin={delay} repeatCount="indefinite" path={d} />
			</circle>
		</>
	);
}

function UptimeVisual() {
	return (
		<VisualStage>
			<div className="flex h-full w-full flex-col items-center justify-center">
				<div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
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

function Sparkline({ color, points }: { color: string; points: string }) {
	return <path d={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />;
}

function AnimatedPriceSparkline({
	color,
	points,
	altPoints,
	duration,
	delay = "0s",
}: {
	color: string;
	points: string;
	altPoints?: string;
	duration: string;
	delay?: string;
}) {
	return (
		<path d={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
			{altPoints ? (
				<animate
					attributeName="d"
					values={`${points};${altPoints};${points}`}
					dur={duration}
					begin={delay}
					repeatCount="indefinite"
					calcMode="spline"
					keyTimes="0;0.5;1"
					keySplines="0.42 0 0.2 1;0.42 0 0.2 1"
				/>
			) : null}
		</path>
	);
}

function ObservabilityVisual() {
	return (
		<VisualStage>
			<div className="relative h-full w-full max-w-[252px]">
				<div className="absolute bottom-1 left-0 z-0 w-[62%] rounded-2xl border border-zinc-200/80 bg-white/96 p-3 dark:border-zinc-800 dark:bg-zinc-950/96">
					<div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
						<span>Price</span>
						<span>7d</span>
					</div>
					<svg viewBox="0 0 150 74" className="mt-2 h-20 w-full" preserveAspectRatio="none" aria-hidden="true">
						<AnimatedPriceSparkline
							color="#f59e0b"
							points="M4 14 H22 V18 H40 V22 H58 V26 H76 V30 H94 V33 H112 V37 H130 V40 H146"
							altPoints="M4 13 H22 V17 H40 V21 H58 V25 H76 V29 H94 V32 H112 V36 H130 V39 H146"
							duration="7.5s"
						/>
						<AnimatedPriceSparkline
							color="#14b8a6"
							points="M4 26 H22 V30 H40 V33 H58 V37 H76 V41 H94 V45 H112 V49 H130 V52 H146"
							altPoints="M4 25 H22 V29 H40 V32 H58 V36 H76 V40 H94 V44 H112 V48 H130 V51 H146"
							duration="6.8s"
							delay="0.5s"
						/>
						<AnimatedPriceSparkline
							color="#3b82f6"
							points="M4 40 H22 V43 H40 V47 H58 V50 H76 V54 H94 V57 H112 V60 H130 V63 H146"
							altPoints="M4 39 H22 V42 H40 V46 H58 V49 H76 V53 H94 V56 H112 V59 H130 V62 H146"
							duration="8.1s"
							delay="0.9s"
						/>
					</svg>
				</div>
				<div className="absolute right-0 top-0 z-10 w-[72%] rounded-2xl border border-zinc-200/80 bg-white/96 p-3 dark:border-zinc-800 dark:bg-zinc-950/96">
					<div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
						<span>Throughput</span>
						<span>tok/s</span>
					</div>
<ThroughputLiveChart />
				</div>
			</div>
		</VisualStage>
	);
}

function DatabaseVisual() {
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

function BenefitVisual({ visual }: { visual: Benefit["visual"] }) {
	switch (visual) {
		case "models":
			return <ModelsVisual />;
		case "uptime":
			return <UptimeVisual />;
		case "observability":
			return <ObservabilityVisual />;
		case "database":
		default:
			return <DatabaseVisual />;
	}
}

export default function HomeQuickstartSection() {
	return (
		<div className="mx-auto mt-6 max-w-7xl">
			<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
				{BENEFITS.map((benefit) => (
					<Link
						key={benefit.title}
						href={benefit.href}
						className="group min-w-0 overflow-hidden rounded-[1.75rem] border border-zinc-200/80 bg-white transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10 dark:focus-visible:ring-zinc-100/10"
					>
						<div className="h-48 border-b border-zinc-200/80 bg-white px-2 py-3 dark:border-zinc-800 dark:bg-zinc-950">
							<BenefitVisual visual={benefit.visual} />
						</div>
						<div className="space-y-4 px-6 py-5 text-left">
							<div className="space-y-2">
								<h3 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-zinc-950 dark:text-zinc-50">
									{benefit.title}
								</h3>
								<p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
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





