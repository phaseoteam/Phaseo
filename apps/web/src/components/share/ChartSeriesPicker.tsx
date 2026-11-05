import { useState, type ReactNode } from "react";
import { useTranslations } from "@/i18n/react";
import { Check } from "lucide-react";

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ChartShareSeries = { key: string; label: string; color: string };

type Props = {
	series: ChartShareSeries[];
	/** Selected keys. In single mode, at most one. */
	selected: string[];
	onChange: (selected: string[]) => void;
	mode: "single" | "multiple";
	/** Most keys that can be chosen in multiple mode. */
	max?: number;
	/** Single mode: label for the empty choice, such as "None". */
	noneLabel?: string;
	trigger: ReactNode;
};

/** Searchable list of a chart's series, for choosing which to show or which to highlight in a share image. */
export default function ChartSeriesPicker({ series, selected, onChange, mode, max = 10, noneLabel, trigger }: Props) {
	const t = useTranslations("Common.ui.chartShare");
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const selectedSet = new Set(selected);
	const needle = query.trim().toLowerCase();
	const visible = needle ? series.filter((item) => item.label.toLowerCase().includes(needle)) : series;
	const full = mode === "multiple" && selected.length >= max;

	const toggle = (key: string) => {
		if (mode === "single") {
			onChange(selectedSet.has(key) ? [] : [key]);
			setOpen(false);
			return;
		}
		if (selectedSet.has(key)) onChange(selected.filter((existing) => existing !== key));
		else if (!full) onChange([...selected, key]);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent align="end" className="w-72 gap-0 rounded-md p-0">
				<Command shouldFilter={false}>
					<CommandInput value={query} onValueChange={setQuery} placeholder={t("searchSeries")} />
					<CommandList className="max-h-64">
						<CommandEmpty>{t("noSeriesFound")}</CommandEmpty>
						{mode === "single" && noneLabel && !needle ? (
							<CommandItem value="__none__" onSelect={() => { onChange([]); setOpen(false); }} className="rounded-md">
								<Check className={cn("size-3.5", selected.length ? "opacity-0" : "opacity-100")} />
								{noneLabel}
							</CommandItem>
						) : null}
						{visible.map((item) => {
							const isSelected = selectedSet.has(item.key);
							return (
								<CommandItem
									key={item.key}
									value={item.key}
									disabled={!isSelected && full}
									onSelect={() => toggle(item.key)}
									className="rounded-md"
								>
									<Check className={cn("size-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
									<span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
									<span className="truncate">{item.label}</span>
								</CommandItem>
							);
						})}
					</CommandList>
					{mode === "multiple" ? (
						<div className="border-t px-3 py-2 text-xs text-muted-foreground">{t("chosenCount", { count: selected.length, max })}</div>
					) : null}
				</Command>
			</PopoverContent>
		</Popover>
	);
}
