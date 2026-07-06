import { Badge } from "@/components/ui/badge";
import type { ExtendedModel } from "@/data/types";
import { cn } from "@/lib/utils";

function formatInteger(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function normalizeTypeLabel(value: string): string {
	const normalized = value.trim().toLowerCase();
	if (normalized === "text") return "Text";
	if (normalized === "image") return "Image";
	if (normalized === "audio_stt") return "Speech-to-text";
	if (normalized === "audio_tts") return "Text-to-speech";
	if (normalized === "audio_music") return "Music";
	if (normalized === "audio") return "Audio";
	if (normalized === "video") return "Video";
	if (normalized === "embedding" || normalized === "embeddings") return "Embeddings";
	return value;
}

function getShortTypeLabel(value: string): string {
	const normalized = normalizeTypeLabel(value);
	if (normalized === "Text") return "T";
	if (normalized === "Image") return "Img";
	if (normalized === "Audio") return "Aud";
	if (normalized === "Video") return "Vid";
	if (normalized === "Embeddings") return "Emb";
	if (normalized === "Speech-to-text") return "STT";
	if (normalized === "Text-to-speech") return "TTS";
	return normalized.slice(0, 3);
}

export function ColumnGrid({
	selectedModels,
	children,
}: {
	selectedModels: ExtendedModel[];
	children: React.ReactNode;
}) {
	return (
		<div className="overflow-x-auto">
			<div
				className="grid gap-3"
				style={{
					gridTemplateColumns: `repeat(${selectedModels.length}, minmax(270px, 1fr))`,
					minWidth: `${Math.max(720, selectedModels.length * 286)}px`,
				}}
			>
				{children}
			</div>
		</div>
	);
}

export function TypeBadges({ values }: { values: string[] }) {
	if (!values.length) return <span className="text-muted-foreground">-</span>;

	return (
		<div className="flex flex-wrap justify-end gap-1">
			{values.map((value) => (
				<Badge
					key={value}
					variant="outline"
					className="h-5 rounded px-1.5 text-[10px] font-semibold"
					title={normalizeTypeLabel(value)}
				>
					{getShortTypeLabel(value)}
				</Badge>
			))}
		</div>
	);
}

export function MiniBars({
	modelId,
	points,
}: {
	modelId: string;
	points: Array<{ date: string; value: number }>;
}) {
	const compactPoints = points.slice(-18);
	const maxValue = compactPoints.length
		? Math.max(...compactPoints.map((point) => point.value), 1)
		: 1;

	return (
		<div className="flex h-9 items-end gap-[2px]">
			{compactPoints.length ? (
				compactPoints.map((point, index) => (
					<div
						key={`${modelId}-activity-${point.date}-${index}`}
						className="min-w-0 flex-1 rounded-[2px] bg-sky-500/75"
						style={{
							height: `${Math.max(
								point.value > 0 ? 12 : 2,
								Math.round((point.value / maxValue) * 100)
							)}%`,
							opacity: point.value > 0 ? 1 : 0.2,
						}}
						title={`${formatInteger(point.value)} tokens`}
					/>
				))
			) : (
				<div className="w-full text-right text-xs text-muted-foreground">
					No activity points
				</div>
			)}
		</div>
	);
}

export function MetricRow({
	label,
	children,
	className,
}: {
	label: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex min-h-11 items-center justify-between gap-3 border-b border-border/60 py-2.5 text-sm last:border-b-0",
				className
			)}
		>
			<div className="min-w-0 text-muted-foreground">{label}</div>
			<div className="min-w-0 text-right font-medium">{children}</div>
		</div>
	);
}

export function CompareSection({
	title,
	selectedModels,
	children,
}: {
	title: string;
	selectedModels: ExtendedModel[];
	children: React.ReactNode;
}) {
	return (
		<section>
			<div className="overflow-x-auto">
				<div
					className="grid gap-x-3 gap-y-3"
					style={{
						gridTemplateColumns: `repeat(${selectedModels.length}, minmax(270px, 1fr))`,
						minWidth: `${Math.max(720, selectedModels.length * 286)}px`,
					}}
				>
					<h2 className="col-span-full border-b border-border/70 pb-3 pl-4 text-xl font-semibold">
						{title}
					</h2>
					{children}
				</div>
			</div>
		</section>
	);
}
