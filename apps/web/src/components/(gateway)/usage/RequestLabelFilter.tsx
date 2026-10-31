"use client";

import * as React from "react";
import { useTranslations } from "@/i18n/react";
import { parseAsString, useQueryStates } from "nuqs";
import { Check, Sparkles, Tag, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { UsageLabelFacet } from "@/lib/fetchers/internal/settingsTypes";
import {
	buildLabelKeyOptions,
	labelValueDisplay,
	type LabelKeyOption,
	type RequestClassifierSummary,
} from "./requestClassifierLabels";

/**
 * Logs filter rows one by one, so they also take "any value" and "is not". The
 * usage overview totals a rollup keyed by exact key and value, so it takes that only.
 */
export type RequestLabelFilterMode = "logs" | "usage";

type ActiveFilter = { key: string; value: string | null; exclude: boolean };

export function readActiveLabelFilter(
	state: { label_key: string; label_value: string; label_op: string },
	mode: RequestLabelFilterMode,
): ActiveFilter | null {
	const key = state.label_key.trim();
	const value = state.label_value.trim() || null;
	const exclude = state.label_op === "is_not";
	if (!key) return null;
	if (mode === "usage" && (!value || exclude)) return null;
	return { key, value, exclude };
}

export default function RequestLabelFilter({
	facets,
	classifiers = [],
	mode = "logs",
}: {
	facets: UsageLabelFacet[];
	classifiers?: RequestClassifierSummary[];
	mode?: RequestLabelFilterMode;
}) {
	const t = useTranslations("SettingsUI.requestClassifierUsage");
	const [queryState, setQueryState] = useQueryStates({
		label_key: parseAsString.withDefault(""),
		label_value: parseAsString.withDefault(""),
		label_op: parseAsString.withDefault(""),
	}, { shallow: false });
	const [open, setOpen] = React.useState(false);
	const active = readActiveLabelFilter(queryState, mode);
	const [exclude, setExclude] = React.useState(active?.exclude ?? false);
	// Each time the list opens, it starts from the active filter's operator.
	const onOpenChange = (next: boolean) => {
		if (next) setExclude(active?.exclude ?? false);
		setOpen(next);
	};

	const options = React.useMemo(() => buildLabelKeyOptions(facets, classifiers), [facets, classifiers]);
	const optionByKey = React.useMemo(() => new Map(options.map((option) => [option.key, option])), [options]);
	const keyName = (key: string) => {
		const option = optionByKey.get(key);
		if (option?.kind === "classifier_calls") return t("classifierCalls");
		return option?.name ?? key;
	};
	const activeText = active ? (() => {
		const key = keyName(active.key);
		if (active.value == null) return active.exclude ? t("filterNotSet", { key }) : t("filterAny", { key });
		const value = labelValueDisplay(active.key, active.value, classifiers);
		return active.exclude ? t("filterIsNot", { key, value }) : t("filterIs", { key, value });
	})() : null;

	const select = (key: string, value: string | null) => {
		void setQueryState({
			label_key: key,
			label_value: value,
			label_op: mode === "logs" && exclude ? "is_not" : null,
		});
		setOpen(false);
	};
	const clear = () => {
		void setQueryState({ label_key: null, label_value: null, label_op: null });
	};

	const groups: Array<{ heading: string; options: LabelKeyOption[] }> = [
		{ heading: t("classifierGroup"), options: options.filter((option) => option.kind === "classifier") },
		{ heading: t("classifierCallsGroup"), options: options.filter((option) => option.kind === "classifier_calls") },
		{ heading: t("callerGroup"), options: options.filter((option) => option.kind === "caller") },
	].filter((group) => group.options.length > 0);

	return (
		<div className="inline-flex items-center gap-1">
			<Popover open={open} onOpenChange={onOpenChange}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant={active ? "secondary" : "outline"}
						size="sm"
						className="h-8 max-w-[min(320px,50vw)] gap-1.5 rounded-md px-2 text-xs"
						aria-label={activeText ? t("changeFilterAria", { filter: activeText }) : t("filterAria")}
					>
						<Tag className="size-3.5 shrink-0" />
						<span className="truncate">{activeText ?? t("filterLabel")}</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-[360px] gap-0 overflow-hidden rounded-md p-0">
					<Command>
						<CommandInput placeholder={t("searchLabels")} />
						{mode === "logs" ? (
							<div className="flex items-center gap-1 border-b px-2 py-1.5" role="group" aria-label={t("operatorAria")}>
								{([false, true] as const).map((value) => (
									<button
										key={String(value)}
										type="button"
										aria-pressed={exclude === value}
										onClick={() => setExclude(value)}
										className={cn(
											"rounded-md px-2 py-0.5 text-xs",
											exclude === value ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
										)}
									>
										{value ? t("opIsNot") : t("opIs")}
									</button>
								))}
							</div>
						) : null}
						<CommandList className="max-h-[340px]">
							<CommandEmpty>{options.length ? t("noMatches") : t("noLabels")}</CommandEmpty>
							{groups.map((group) => (
								<CommandGroup key={group.heading} heading={group.heading}>
									{group.options.flatMap((option) => {
										const name = option.kind === "classifier_calls" ? t("classifierCalls") : option.name ?? option.key;
										const searchText = [name, option.key, option.classifierName ?? ""].join(" ");
										const items = option.values.map((entry) => {
											const selected = active?.key === option.key && active.value === entry.value && active.exclude === (mode === "logs" && exclude);
											return (
												<CommandItem
													key={`${option.key}\u0000${entry.value}`}
													value={`${option.key}\u0000${entry.value}`}
													keywords={[searchText, entry.label, entry.value]}
													onSelect={() => select(option.key, entry.value)}
												>
													<span className="min-w-0 flex-1 truncate">
														<span className="font-medium">{name}</span>
														<span className="px-1 text-muted-foreground">{exclude && mode === "logs" ? "≠" : "="}</span>
														<span className={cn(!entry.seen && "text-muted-foreground")}>{entry.label}</span>
													</span>
													{option.kind === "classifier" && option.classifierName ? (
														<span className="max-w-[120px] shrink-0 truncate text-[11px] text-muted-foreground" title={t("classifierHint", { name: option.classifierName })}>
															<Sparkles className="mr-1 inline size-3 align-[-2px]" aria-hidden />
															{option.classifierName}
														</span>
													) : null}
													{selected ? <Check className="size-4" /> : null}
												</CommandItem>
											);
										});
										if (mode === "logs") {
											items.unshift(
												<CommandItem
													key={`${option.key}\u0000*`}
													value={`${option.key}\u0000*`}
													keywords={[searchText]}
													onSelect={() => select(option.key, null)}
												>
													<span className="min-w-0 flex-1 truncate">
														<span className="font-medium">{name}</span>
														<span className="px-1 text-muted-foreground">·</span>
														<span className="text-muted-foreground">{exclude ? t("notSet") : t("anyValue")}</span>
													</span>
													{active?.key === option.key && active.value == null && active.exclude === exclude ? <Check className="size-4" /> : null}
												</CommandItem>,
											);
										}
										return items;
									})}
								</CommandGroup>
							))}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
			{active ? (
				<button
					type="button"
					className="inline-flex size-8 items-center justify-center rounded-md border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground"
					onClick={clear}
					aria-label={t("clearFilter")}
				>
					<X className="size-3.5" />
				</button>
			) : null}
		</div>
	);
}
