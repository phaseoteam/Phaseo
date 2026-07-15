"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type PresetOption = {
	id: string;
	name: string;
	slug: string | null;
};

type PresetFeedbackFilterValues = {
	range: "7d" | "30d" | "90d" | "custom";
	from: string;
	to: string;
	baselineId: string | null;
	metadataKey: string;
	metadataValue: string;
	presetQuery: string;
	rating: string;
	sort: string;
	direction: string;
};

const RANGE_VALUES = new Set<PresetFeedbackFilterValues["range"]>([
	"7d",
	"30d",
	"90d",
	"custom",
]);

export function PresetFeedbackFilters({
	filters,
	presets,
	baselineId,
	metadataKeys,
}: {
	filters: PresetFeedbackFilterValues;
	presets: PresetOption[];
	baselineId: string | null;
	metadataKeys: string[];
}) {
	const [selectedBaselineId, setSelectedBaselineId] = React.useState(
		baselineId ?? presets[0]?.id ?? "",
	);
	const [range, setRange] = React.useState(filters.range);
	const [rating, setRating] = React.useState(filters.rating || "all");
	const [from, setFrom] = React.useState(filters.from);
	const [to, setTo] = React.useState(filters.to);
	const isCustomRange = range === "custom";
	const hasFilters =
		filters.presetQuery ||
		filters.metadataKey ||
		filters.metadataValue ||
		filters.rating !== "all" ||
		filters.range !== "30d";
	const triggerClassName = "h-9 w-full rounded-md bg-background text-sm";

	return (
		<section className="border-y border-border/70 py-4">
			<form className="space-y-4" method="get">
				<input type="hidden" name="baseline_id" value={selectedBaselineId} />
				<input type="hidden" name="range" value={range} />
				<input type="hidden" name="rating" value={rating} />
				<input type="hidden" name="sort" value={filters.sort} />
				<input type="hidden" name="direction" value={filters.direction} />
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
					<div className="space-y-2 xl:col-span-3">
						<Label htmlFor="baseline_id">Baseline</Label>
						<Select
							value={selectedBaselineId}
							onValueChange={setSelectedBaselineId}
						>
							<SelectTrigger
								id="baseline_id"
								className={triggerClassName}
								aria-label="Baseline preset"
							>
								<SelectValue placeholder="Choose baseline" />
							</SelectTrigger>
							<SelectContent className="max-h-[320px]">
								{presets.map((preset) => (
									<SelectItem key={preset.id} value={preset.id}>
										<span className="truncate">{preset.name}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2 xl:col-span-2">
						<Label htmlFor="preset_q">Preset</Label>
						<Input
							id="preset_q"
							name="preset_q"
							defaultValue={filters.presetQuery}
							placeholder="Search preset"
						/>
					</div>
					<div className="space-y-2 xl:col-span-2">
						<Label htmlFor="range">Date window</Label>
						<Select
							value={range}
							onValueChange={(value) => {
								if (RANGE_VALUES.has(value as PresetFeedbackFilterValues["range"])) {
									setRange(value as PresetFeedbackFilterValues["range"]);
								}
							}}
						>
							<SelectTrigger
								id="range"
								className={triggerClassName}
								aria-label="Date window"
							>
								<SelectValue placeholder="Date window" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="7d">Last 7 days</SelectItem>
								<SelectItem value="30d">Last 30 days</SelectItem>
								<SelectItem value="90d">Last 90 days</SelectItem>
								<SelectItem value="custom">Custom</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2 xl:col-span-2">
						<Label htmlFor="rating">Rating</Label>
						<Select value={rating} onValueChange={setRating}>
							<SelectTrigger
								id="rating"
								className={triggerClassName}
								aria-label="Rating filter"
							>
								<SelectValue placeholder="Rating" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All ratings</SelectItem>
								<SelectItem value="thumbs_up">Thumbs up</SelectItem>
								<SelectItem value="thumbs_down">Thumbs down</SelectItem>
								<SelectItem value="correct">Correct</SelectItem>
								<SelectItem value="partly_correct">Partly correct</SelectItem>
								<SelectItem value="incorrect">Incorrect</SelectItem>
								<SelectItem value="unsafe">Unsafe</SelectItem>
								<SelectItem value="unrated">Unrated</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2 xl:col-span-3">
						<Label htmlFor="metadata_key">Metadata</Label>
						<div className="grid gap-2 sm:grid-cols-2">
							<Input
								id="metadata_key"
								name="metadata_key"
								list="preset-feedback-metadata-keys"
								defaultValue={filters.metadataKey}
								placeholder="user_tier"
							/>
							<Input
								id="metadata_value"
								name="metadata_value"
								defaultValue={filters.metadataValue}
								placeholder="pro"
							/>
						</div>
						<datalist id="preset-feedback-metadata-keys">
							{metadataKeys.map((key) => (
								<option key={key} value={key} />
							))}
						</datalist>
					</div>
				</div>

				<div
					className={cn(
						"gap-3 md:grid-cols-2 xl:grid-cols-12",
						isCustomRange ? "grid" : "hidden",
					)}
					aria-hidden={!isCustomRange}
				>
					<div className="space-y-2 xl:col-span-3">
						<Label htmlFor="from">From</Label>
						<DatePickerInput name="from" value={from} onChange={setFrom} />
					</div>
					<div className="space-y-2 xl:col-span-3">
						<Label htmlFor="to">To</Label>
						<DatePickerInput name="to" value={to} onChange={setTo} />
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="max-w-3xl text-xs text-muted-foreground">
						Comparisons use explicit ratings. Positive means thumbs up or correct; negative means thumbs down, incorrect, or unsafe. Numeric scores are optional detail only.
					</p>
					<div className="flex items-center gap-2">
						{hasFilters ? (
							<Button asChild type="button" variant="ghost" size="sm">
								<Link href="/settings/presets/experiments">
									<X className="h-4 w-4" />
									Reset
								</Link>
							</Button>
						) : null}
						<Button type="submit" size="sm">
							<ArrowUpRight className="h-4 w-4" />
							Apply filters
						</Button>
					</div>
				</div>
			</form>
		</section>
	);
}
