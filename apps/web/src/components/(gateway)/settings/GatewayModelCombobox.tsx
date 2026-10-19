"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { fetchJsonQuery } from "@/lib/query/fetchers";
import { WEB_QUERY_POLICIES } from "@/lib/query/policies";
import { webQueryKeys } from "@/lib/query/queryKeys";
import { cn } from "@/lib/utils";

export type GatewayModelOption = {
	id: string;
	label: string;
	organisationId: string;
	organisationName: string;
	providerNames: string[];
	capabilities: string[];
	releaseDate: string | null;
	/** At least one provider documents JSON schema (structured output) support. */
	structuredOutputs: boolean;
};

const STRUCTURED_OUTPUT_PARAMS = ["structured_outputs", "response_format"];

function fallbackModelLabel(modelId: string): string {
	const leaf = modelId.split("/").pop() ?? modelId;
	return leaf.split(/[-_]/g).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function hasStructuredOutputs(model: GatewaySupportedModel): boolean {
	const params = model.capabilityParamsById;
	if (!params || typeof params !== "object") return false;
	return Object.values(params).some((value) =>
		Boolean(value) && typeof value === "object" && STRUCTURED_OUTPUT_PARAMS.some((param) => param in (value as Record<string, unknown>)),
	);
}

/** One option per selectable model, newest first, merging its providers. */
export function buildGatewayModelOptions(models: GatewaySupportedModel[]): GatewayModelOption[] {
	const byId = new Map<string, GatewayModelOption>();
	for (const model of models) {
		if (!model.isAvailable) continue;
		const id = model.selectorModelId || model.modelId;
		const organisationId = model.organisationId?.trim() || id.split("/")[0] || "phaseo";
		const existing = byId.get(id);
		const providerName = model.providerName ?? model.providerId;
		const structuredOutputs = hasStructuredOutputs(model);
		if (!existing) {
			byId.set(id, {
				id,
				label: model.modelName?.trim() || fallbackModelLabel(id),
				organisationId,
				organisationName: model.organisationName ?? organisationId.replaceAll("-", " "),
				providerNames: [providerName],
				capabilities: [...new Set(model.capabilities ?? [])],
				releaseDate: model.releaseDate ?? model.announcementDate ?? null,
				structuredOutputs,
			});
			continue;
		}
		if (!existing.providerNames.includes(providerName)) existing.providerNames.push(providerName);
		for (const capability of model.capabilities ?? []) if (!existing.capabilities.includes(capability)) existing.capabilities.push(capability);
		const releaseDate = model.releaseDate ?? model.announcementDate ?? null;
		if (!existing.releaseDate && releaseDate) existing.releaseDate = releaseDate;
		existing.structuredOutputs ||= structuredOutputs;
	}
	return [...byId.values()].sort((left, right) => {
		const leftTime = left.releaseDate ? Date.parse(left.releaseDate) : Number.NEGATIVE_INFINITY;
		const rightTime = right.releaseDate ? Date.parse(right.releaseDate) : Number.NEGATIVE_INFINITY;
		return rightTime - leftTime || left.label.localeCompare(right.label);
	});
}

/** The public gateway model catalogue as combobox options. */
export function useGatewayModelOptions() {
	const { data, error, isLoading } = useQuery<{ models: GatewaySupportedModel[] }>({
		queryKey: webQueryKeys.public.gatewayModels(),
		queryFn: ({ signal }) => fetchJsonQuery<{ models: GatewaySupportedModel[] }>("/api/gateway/models", { signal }),
		...WEB_QUERY_POLICIES.public,
	});
	const options = useMemo(() => buildGatewayModelOptions(data?.models ?? []), [data?.models]);
	return { options, loading: isLoading, error: Boolean(error) };
}

function releaseGroupLabel(releaseDate: string | null, locale: string): string {
	if (!releaseDate) return "earlierModels";
	const date = new Date(releaseDate);
	if (Number.isNaN(date.getTime())) return "earlierModels";
	return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export function capabilityLabel(capability: string): string {
	return capability.replaceAll(".", " ").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Searchable model picker grouped by release month. */
export function GatewayModelCombobox({ value, onChange, options, excludedIds = [], requiredCapabilities = [], filter, ariaLabel, loading, error }: {
	value: string;
	onChange: (value: string) => void;
	options: GatewayModelOption[];
	excludedIds?: string[];
	requiredCapabilities?: string[];
	/** Further narrows the list; the selected model always stays visible. */
	filter?: (option: GatewayModelOption) => boolean;
	ariaLabel: string;
	loading: boolean;
	error: boolean;
}) {
	const t = useTranslations("SettingsUI.routingStudio");
	const locale = useLocale();
	const [open, setOpen] = useState(false);
	const selected = options.find((option) => option.id === value);
	const excluded = new Set(excludedIds.filter((id) => id !== value));
	const available = options.filter((option) => !excluded.has(option.id)
		&& requiredCapabilities.every((capability) => option.capabilities.includes(capability))
		&& (!filter || option.id === value || filter(option)));
	const grouped = new Map<string, GatewayModelOption[]>();
	for (const option of available) {
		const rawGroup = releaseGroupLabel(option.releaseDate, locale);
		const group = rawGroup === "earlierModels" ? t("earlierModels") : rawGroup;
		grouped.set(group, [...(grouped.get(group) ?? []), option]);
	}
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="outline" role="combobox" aria-label={ariaLabel} aria-expanded={open} className="h-auto min-h-10 w-full justify-between gap-2 px-3 py-2 font-normal">
					<span className="flex min-w-0 flex-1 items-center gap-2.5 text-left">{selected ? <Logo id={selected.organisationId} alt={selected.organisationName} width={20} height={20} className="size-5 shrink-0 object-contain" /> : <Sparkles className="size-5 shrink-0 text-muted-foreground" />}<span className="min-w-0">{value ? <><span className="block truncate text-sm font-medium text-foreground">{selected?.organisationName ? `${selected.organisationName}: ` : ""}{selected?.label ?? value}</span>{selected ? <span className="block truncate text-[11px] text-muted-foreground">{selected.id}</span> : null}</> : <span className="text-muted-foreground">{t("chooseModel")}</span>}</span></span>
					<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[min(480px,calc(100vw-2rem))] p-0">
				<Command>
					<CommandInput placeholder={t("searchModels")} />
					<CommandList className="max-h-96 p-1">
						<CommandEmpty>{loading ? t("loadingModels") : error ? t("modelCatalogueError") : t("noCompatibleModels")}</CommandEmpty>
						{Array.from(grouped.entries()).map(([releaseGroup, entries]) => <CommandGroup key={releaseGroup} heading={releaseGroup} className="pb-1 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-foreground">{entries.map((option) => <CommandItem key={option.id} value={`${option.label} ${option.id} ${option.organisationName} ${option.providerNames.join(" ")} ${option.capabilities.join(" ")}`} onSelect={() => { onChange(option.id); setOpen(false); }} className="min-h-11 gap-3 py-2"><Logo id={option.organisationId} alt={option.organisationName} width={20} height={20} className="size-5 shrink-0 object-contain" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{option.organisationName}: {option.label}</p><div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"><span className="truncate">{option.id}</span>{option.capabilities.slice(0, 2).map((capability) => <Badge key={capability} variant="outline" className="h-4 shrink-0 rounded px-1 text-[9px] font-medium">{capabilityLabel(capability)}</Badge>)}</div></div><Check className={cn("size-4 shrink-0", option.id === value ? "opacity-100" : "opacity-0")} /></CommandItem>)}</CommandGroup>)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
