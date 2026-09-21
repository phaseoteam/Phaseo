"use client";

import { Badge } from "@/components/ui/badge";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import type { ExtendedModel } from "@/data/types";
import { cn } from "@/lib/utils";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { Binary, Captions, FileText, Image as ImageIcon, Music4, Radio, Speech, Type, Video, Volume2 } from "lucide-react";

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

function getModalityIcon(value: string) {
	const normalized = value.toLowerCase().replace(/[._/-]+/g, " ");
	if (normalized.includes("realtime")) return Radio;
	if (normalized.includes("embed")) return Binary;
	if (normalized.includes("file")) return FileText;
	if (normalized.includes("image")) return ImageIcon;
	if (normalized.includes("music")) return Music4;
	if (normalized.includes("speech to text") || normalized.includes("stt")) return Captions;
	if (normalized.includes("text to speech") || normalized.includes("tts")) return Speech;
	if (normalized.includes("audio")) return Volume2;
	if (normalized.includes("video")) return Video;
	return Type;
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
			{values.map((value) => {
				const Icon = getModalityIcon(value);
				const tone = getModalityTone(value);
				return (
					<Badge key={value} variant="outline" className={cn("h-6 gap-1 rounded-md px-1.5 text-[10px] font-medium", tone.badgeClassName)}>
						<Icon className={cn("size-3", tone.iconClassName)} />
						{normalizeTypeLabel(value)}
					</Badge>
				);
			})}
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
	const format = useDisplayFormatters();
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
						title={`${format.number(point.value, {
							maximumFractionDigits: 0,
							notation: "standard",
						})} tokens`}
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
