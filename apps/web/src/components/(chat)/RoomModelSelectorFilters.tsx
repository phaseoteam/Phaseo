"use client";

import type { Dispatch, SetStateAction } from "react";
import {
	ArrowUpDown,
	AudioLines,
	BadgeAlert,
	Binary,
	ChevronDown,
	Circle,
	FileText,
	ImageIcon,
	Mic,
	Music,
	Type,
	type LucideIcon,
	Video,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ModelFacetOption = {
	id: string;
	label: string;
	disabled?: boolean;
};

export type ModelFilterState = {
	inputModalities: string[];
	outputModalities: string[];
	providers: string[];
	free: boolean;
	hideUnavailable: boolean;
};

type ModelSelectorFilterBarProps = {
	facetOptions: {
		inputModalities: ModelFacetOption[];
		outputModalities: ModelFacetOption[];
		providers: ModelFacetOption[];
	};
	filters: ModelFilterState;
	setFilters: Dispatch<SetStateAction<ModelFilterState>>;
};

const MODALITY_LABELS: Record<string, string> = {
	text: "Text",
	image: "Image",
	images: "Image",
	embedding: "Embeddings",
	embeddings: "Embeddings",
	audio: "Audio",
	music: "Music",
	video: "Video",
	rerank: "Rerank",
	speech: "Speech",
	transcription: "Transcription",
	moderation: "Moderation",
};

const MODALITY_ORDER = [
	"text",
	"image",
	"embeddings",
	"audio",
	"music",
	"video",
	"rerank",
	"speech",
	"transcription",
	"moderation",
];

const MODALITY_ICONS: Record<string, LucideIcon> = {
	text: Type,
	image: ImageIcon,
	embeddings: Binary,
	audio: AudioLines,
	music: Music,
	video: Video,
	rerank: ArrowUpDown,
	speech: Mic,
	transcription: FileText,
	moderation: BadgeAlert,
};

export function normalizeModelSelectorModality(value: string) {
	const normalized = value.trim().toLowerCase().replace(/[\s.-]+/g, "_");
	if (normalized === "images") return "image";
	if (normalized === "embedding") return "embeddings";
	if (normalized === "audio_music") return "music";
	return normalized;
}

function formatModalityLabel(value: string) {
	return (
		MODALITY_LABELS[value] ??
		value
			.split(/[_-]+/)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(" ")
	);
}

export function buildModalityFacetOptions(values: Set<string>) {
	return Array.from(values)
		.map((id) => ({ id, label: formatModalityLabel(id) }))
		.sort((a, b) => {
			const aIndex = MODALITY_ORDER.indexOf(a.id);
			const bIndex = MODALITY_ORDER.indexOf(b.id);
			if (aIndex !== -1 || bIndex !== -1) {
				return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
			}
			return a.label.localeCompare(b.label);
		});
}

function toggleFilterValue(values: string[], value: string) {
	return values.includes(value)
		? values.filter((item) => item !== value)
		: [...values, value];
}

function ModelFacetOptionIcon({
	kind,
	option,
}: {
	kind: "modality" | "provider";
	option: ModelFacetOption;
}) {
	if (kind === "provider") {
		return (
			<Logo
				id={option.id}
				alt={option.label}
				width={16}
				height={16}
				className="h-4 w-4 shrink-0 rounded-none object-contain"
			/>
		);
	}

	const Icon = MODALITY_ICONS[option.id] ?? Circle;
	return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function ModelFacetDropdown({
	label,
	options,
	selectedValues,
	onToggle,
}: {
	label: string;
	options: ModelFacetOption[];
	selectedValues: string[];
	onToggle: (value: string) => void;
}) {
	const selectedCount = selectedValues.length;
	const optionIconKind = label === "Provider" ? "provider" : "modality";
	const buttonLabel =
		selectedCount === 0
			? label
			: selectedCount === 1
				? options.find((option) => option.id === selectedValues[0])?.label ?? label
				: `${label}: ${selectedCount}`;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className={cn(
						"h-7 gap-1.5 rounded-md px-2.5 text-xs",
						selectedCount > 0 &&
							"border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background",
					)}
				>
					<span className="max-w-[120px] truncate">{buttonLabel}</span>
					<ChevronDown className="h-3.5 w-3.5 shrink-0" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="!z-[150] max-h-[320px] w-56">
				<DropdownMenuLabel className="text-xs">{label}</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{options.length === 0 ? (
					<DropdownMenuItem disabled>No options</DropdownMenuItem>
				) : null}
				{options.map((option) => (
					<DropdownMenuCheckboxItem
						key={option.id}
						checked={selectedValues.includes(option.id)}
						disabled={option.disabled}
						className={cn(
							"gap-2 pl-2 pr-7 [&>span:first-child]:left-auto [&>span:first-child]:right-2",
							option.disabled && "text-muted-foreground/60",
						)}
						onSelect={(event) => event.preventDefault()}
						onCheckedChange={() => {
							if (!option.disabled) onToggle(option.id);
						}}
					>
						<ModelFacetOptionIcon kind={optionIconKind} option={option} />
						<span className="truncate">{option.label}</span>
					</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function RoomModelSelectorFilters({
	facetOptions,
	filters,
	setFilters,
}: ModelSelectorFilterBarProps) {
	const hasNonDefaultFilters =
		filters.inputModalities.length > 0 ||
		filters.outputModalities.length > 0 ||
		filters.providers.length > 0 ||
		filters.free ||
		!filters.hideUnavailable;
	const resetFilters = () => {
		setFilters({
			inputModalities: [],
			outputModalities: [],
			providers: [],
			free: false,
			hideUnavailable: true,
		});
	};

	return (
		<div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
			<ModelFacetDropdown
				label="Input"
				options={facetOptions.inputModalities}
				selectedValues={filters.inputModalities}
				onToggle={(value) =>
					setFilters((prev) => ({
						...prev,
						inputModalities: toggleFilterValue(prev.inputModalities, value),
					}))
				}
			/>
			<ModelFacetDropdown
				label="Output"
				options={facetOptions.outputModalities}
				selectedValues={filters.outputModalities}
				onToggle={(value) =>
					setFilters((prev) => ({
						...prev,
						outputModalities: toggleFilterValue(prev.outputModalities, value),
					}))
				}
			/>
			<ModelFacetDropdown
				label="Provider"
				options={facetOptions.providers}
				selectedValues={filters.providers}
				onToggle={(value) =>
					setFilters((prev) => ({
						...prev,
						providers: toggleFilterValue(prev.providers, value),
					}))
				}
			/>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => setFilters((prev) => ({ ...prev, free: !prev.free }))}
				className={cn(
					"h-7 rounded-md px-2.5 text-xs",
					filters.free &&
						"border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background",
				)}
			>
				Free
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() =>
					setFilters((prev) => ({
						...prev,
						hideUnavailable: !prev.hideUnavailable,
					}))
				}
				className={cn(
					"h-7 rounded-md px-2.5 text-xs",
					filters.hideUnavailable &&
						"border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background",
				)}
			>
				Hide Unavailable
			</Button>
			{hasNonDefaultFilters ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs text-muted-foreground"
					onClick={resetFilters}
				>
					Reset
				</Button>
			) : null}
		</div>
	);
}
