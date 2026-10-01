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
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type PresetOption = {
	id: string;
	name: string;
	displayName: string;
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

const RANGE_LABELS: Record<PresetFeedbackFilterValues["range"], string> = {
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	"90d": "Last 90 days",
	custom: "Custom",
};

const RATING_LABELS: Record<string, string> = {
	all: "All ratings",
	thumbs_up: "Thumbs up",
	thumbs_down: "Thumbs down",
	correct: "Correct",
	partly_correct: "Partly correct",
	incorrect: "Incorrect",
	unsafe: "Unsafe",
	unrated: "Unrated",
};

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
	const t = useTranslations("SettingsUI");
	const [selectedBaselineId, setSelectedBaselineId] = React.useState(
		baselineId ?? "none",
	);
	const [range, setRange] = React.useState(filters.range);
	const [rating, setRating] = React.useState(filters.rating || "all");
	const [from, setFrom] = React.useState(filters.from);
	const [to, setTo] = React.useState(filters.to);
	const isCustomRange = range === "custom";
	const selectedBaseline = presets.find((preset) => preset.id === selectedBaselineId);
	const hasFilters =
		filters.metadataKey ||
		filters.metadataValue ||
		filters.rating !== "all" ||
		filters.range !== "30d";
	const controlClassName = "w-full !rounded-md";
	const contentClassName = "!rounded-md";
	const itemClassName = "!rounded-md";

	return (
		<section className="space-y-3">
			<div>
				<h2 className="text-sm font-semibold">{t("strings.Analysis" as never)}</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{t("strings.Choose the comparison baseline and narrow the feedback included below." as never)}
				</p>
			</div>
			<form method="get">
				<input type="hidden" name="baseline_id" value={selectedBaselineId === "none" ? "" : selectedBaselineId} />
				<input type="hidden" name="range" value={range} />
				<input type="hidden" name="rating" value={rating} />
				<input type="hidden" name="sort" value={filters.sort} />
				<input type="hidden" name="direction" value={filters.direction} />
				<div className="divide-y divide-border/70 border-y border-border/70">
					<div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
				<Label htmlFor="baseline_id" className="text-sm font-medium">{t("strings.Comparison Baseline" as never)}</Label>
				<p className="mt-1 text-xs text-muted-foreground">{t("strings.Optional. Select a control only for A/B tests or staged rollouts." as never)}</p>
						</div>
						<Select
							value={selectedBaselineId}
							onValueChange={setSelectedBaselineId}
						>
							<SelectTrigger
								id="baseline_id"
								className={cn(controlClassName, "sm:w-72")}
					aria-label={t("strings.Baseline preset" as never)}
							>
								<span className="truncate">
									{selectedBaseline?.displayName ?? t("strings.No Baseline" as never)}
								</span>
							</SelectTrigger>
							<SelectContent className={cn(contentClassName, "max-h-[320px]")}>
								<SelectItem value="none" className={itemClassName}>
									{t("strings.No Baseline" as never)}
								</SelectItem>
								{presets.map((preset) => (
									<SelectItem key={preset.id} value={preset.id} className={itemClassName}>
										<div className="flex min-w-0 flex-1 flex-col items-start">
											<span className="w-full truncate">{preset.displayName}</span>
											{preset.slug ? (
												<span className="w-full truncate font-mono text-xs text-muted-foreground">@{preset.slug.replace(/^@/, "")}</span>
											) : null}
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
				<Label htmlFor="range" className="text-sm font-medium">{t("strings.Date Window" as never)}</Label>
				<p className="mt-1 text-xs text-muted-foreground">{t("strings.Limit feedback to a recent or custom period." as never)}</p>
						</div>
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
								className={cn(controlClassName, "sm:w-72")}
					aria-label={t("strings.Date window" as never)}
							>
								<span>{t(`strings.${RANGE_LABELS[range]}` as never)}</span>
							</SelectTrigger>
							<SelectContent className={contentClassName}>
					<SelectItem value="7d" className={itemClassName}>{t("strings.Last 7 days" as never)}</SelectItem>
					<SelectItem value="30d" className={itemClassName}>{t("strings.Last 30 days" as never)}</SelectItem>
					<SelectItem value="90d" className={itemClassName}>{t("strings.Last 90 days" as never)}</SelectItem>
					<SelectItem value="custom" className={itemClassName}>{t("strings.Custom" as never)}</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{isCustomRange ? (
						<div className="grid gap-3 py-3 sm:grid-cols-[1fr_18rem] sm:items-center">
							<div>
				<p className="text-sm font-medium">{t("strings.Custom Dates" as never)}</p>
				<p className="mt-1 text-xs text-muted-foreground">{t("strings.Include feedback created within this range." as never)}</p>
							</div>
							<div className="grid grid-cols-2 gap-2">
								<DatePickerInput id="from" name="from" value={from} onChange={setFrom} />
								<DatePickerInput id="to" name="to" value={to} onChange={setTo} />
							</div>
						</div>
					) : null}
					<div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
				<Label htmlFor="rating" className="text-sm font-medium">{t("strings.Rating" as never)}</Label>
				<p className="mt-1 text-xs text-muted-foreground">{t("strings.Focus the analysis on a specific response outcome." as never)}</p>
						</div>
						<Select value={rating} onValueChange={setRating}>
							<SelectTrigger
								id="rating"
								className={cn(controlClassName, "sm:w-72")}
					aria-label={t("strings.Rating filter" as never)}
							>
								<span>{t(`strings.${RATING_LABELS[rating] ?? "All Ratings"}` as never)}</span>
							</SelectTrigger>
							<SelectContent className={contentClassName}>
					<SelectItem value="all" className={itemClassName}>{t("strings.All ratings" as never)}</SelectItem>
					<SelectItem value="thumbs_up" className={itemClassName}>{t("strings.Thumbs up" as never)}</SelectItem>
					<SelectItem value="thumbs_down" className={itemClassName}>{t("strings.Thumbs down" as never)}</SelectItem>
					<SelectItem value="correct" className={itemClassName}>{t("strings.Correct" as never)}</SelectItem>
					<SelectItem value="partly_correct" className={itemClassName}>{t("strings.Partly correct" as never)}</SelectItem>
					<SelectItem value="incorrect" className={itemClassName}>{t("strings.Incorrect" as never)}</SelectItem>
					<SelectItem value="unsafe" className={itemClassName}>{t("strings.Unsafe" as never)}</SelectItem>
					<SelectItem value="unrated" className={itemClassName}>{t("strings.Unrated" as never)}</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
				<Label htmlFor="metadata_key" className="text-sm font-medium">{t("strings.Metadata Cohort" as never)}</Label>
				<p className="mt-1 text-xs text-muted-foreground">{t("strings.Group or filter feedback using an indexed metadata dimension." as never)}</p>
						</div>
						<div className="grid w-full gap-2 sm:w-72 sm:grid-cols-2">
							<Input
								id="metadata_key"
								name="metadata_key"
								list="preset-feedback-metadata-keys"
								defaultValue={filters.metadataKey}
								placeholder="user_tier"
								className={controlClassName}
							/>
							<Input
								id="metadata_value"
								name="metadata_value"
								defaultValue={filters.metadataValue}
								placeholder="pro"
								className={controlClassName}
							/>
						</div>
						<datalist id="preset-feedback-metadata-keys">
							{metadataKeys.map((key) => (
								<option key={key} value={key} />
							))}
						</datalist>
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-3 pt-3">
					<p className="max-w-3xl text-xs text-muted-foreground">
						{t("strings.Comparisons use explicit ratings. Positive means thumbs up or correct; negative means thumbs down, incorrect, or unsafe. Numeric scores are optional detail only." as never)}
					</p>
					<div className="flex items-center gap-2">
						{hasFilters ? (
							<Button asChild type="button" variant="ghost" size="sm">
								<Link href="/settings/presets/experiments">
									<X className="h-4 w-4" />
									{t("strings.Reset" as never)}
								</Link>
							</Button>
						) : null}
						<Button type="submit" size="sm">
							<ArrowUpRight className="h-4 w-4" />
							{t("strings.Apply filters" as never)}
						</Button>
					</div>
				</div>
			</form>
		</section>
	);
}
