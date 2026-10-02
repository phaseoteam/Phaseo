"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { debounce, parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import {
	Activity,
	ArrowDown,
	ArrowUp,
	ArrowUpRight,
	ArrowUpDown,
	AudioLines,
	BadgeAlert,
	Binary,
	CircleDollarSign,
	CircleOff,
	ChevronsUpDown,
	ExternalLink,
	Globe2,
	ImageIcon,
	KeyRound,
	Layers3,
	LayoutGrid,
	Search,
	Scale,
	Server,
	ScrollText,
	ShieldCheck,
	SlidersHorizontal,
	Table2,
	Type,
	Video,
	type LucideIcon,
} from "lucide-react";
import APIProviderCard from "./APIProviderCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { ProviderModalityBadge } from "./ProviderModalityBadge";
import { matchesProviderCoverage, matchesProviderDatacenter, matchesProviderPolicy, toggleProviderCoverage } from "./providerFilters";
import TableSettings from "@/components/(gateway)/usage/TableSettings";
import { useTablePreferences } from "@/components/(gateway)/usage/useTablePreferences";
import type { TableColumnDefinition } from "@/components/(gateway)/usage/tablePreferences";
import type {
	APIProviderCard as APIProviderCardType,
	ProviderModalityKey,
} from "@/lib/fetchers/api-providers/providerDataTypes";
import { formatLocation } from "@/lib/locations";

interface APIProvidersDisplayProps {
	providers: APIProviderCardType[];
	showPrimaryHeader?: boolean;
}

type ProviderSortOption =
	| "a_z"
	| "daily_tokens_desc"
	| "total_models_desc"
	| "free_models_desc";

type ProviderTableSortField =
	| "provider"
	| "headquarters"
	| "models"
	| "free_models"
	| "modalities"
	| "daily_tokens"
	| "monthly_tokens"
	| "data_policy"
	| "zdr";

const PROVIDER_TABLE_COLUMNS = [
	{ id: "provider", label: "Provider", width: 240 },
	{ id: "headquarters", label: "Headquarters", width: 190 },
	{ id: "models", label: "Models", width: 80, numeric: true },
	{ id: "free_models", label: "Free Models", width: 90, numeric: true },
	{ id: "modalities", label: "Modalities", width: 220 },
	{ id: "daily_tokens", label: "Daily Tokens", width: 120, numeric: true },
	{ id: "monthly_tokens", label: "Monthly Tokens", width: 130, numeric: true },
	{ id: "data_policy", label: "Data policy", width: 160 },
	{ id: "zdr", label: "ZDR", width: 150 },
	{ id: "privacy", label: "Privacy", width: 110 },
	{ id: "terms", label: "Terms", width: 110 },
] as const satisfies readonly (TableColumnDefinition & { width: number })[];

type ProviderTableColumnId = (typeof PROVIDER_TABLE_COLUMNS)[number]["id"];
type ProviderTableColumn = TableColumnDefinition & {
	id: ProviderTableColumnId;
	width: number;
	numeric?: boolean;
};

type FilterOption = { value: string; label: string; count: number; icon?: LucideIcon };

const SORT_OPTIONS: ProviderSortOption[] = ["daily_tokens_desc", "total_models_desc", "free_models_desc", "a_z"];

const MODALITIES: Array<{ value: ProviderModalityKey; icon: LucideIcon }> = [
	{ value: "text", icon: Type },
	{ value: "image", icon: ImageIcon },
	{ value: "video", icon: Video },
	{ value: "audio", icon: AudioLines },
	{ value: "embedding", icon: Binary },
	{ value: "moderation", icon: BadgeAlert },
];

function policyLabel(value: string | null, labels: Record<string, string>, unknownLabel: string): string {
	return value ? labels[value] ?? value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : unknownLabel;
}

const arrayParser = parseAsArrayOf(parseAsString).withDefault([]).withOptions({
	shallow: true,
	clearOnDefault: true,
});
const coverageParser = parseAsArrayOf(parseAsString).withDefault(["active"]).withOptions({
	shallow: true,
	clearOnDefault: true,
});

function normalizeSortOption(value: string | null | undefined): ProviderSortOption {
	switch (value) {
		case "daily_tokens_desc":
		case "total_models_desc":
		case "free_models_desc":
		case "a_z":
			return value;
		default:
			return "daily_tokens_desc";
	}
}

function normalizeTableSortField(value: string | null | undefined): ProviderTableSortField | null {
	return ["provider", "headquarters", "models", "free_models", "modalities", "daily_tokens", "monthly_tokens", "data_policy", "zdr"].includes(value ?? "")
		? value as ProviderTableSortField
		: null;
}

function toggleValue(values: string[], value: string) {
	return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function supportsModality(provider: APIProviderCardType, modality: ProviderModalityKey) {
	const support = provider.modality_support[modality];
	return Number(support?.input ?? 0) + Number(support?.output ?? 0) > 0;
}

function normalizeRegion(value: string) {
	return value.trim().toLowerCase();
}

function ProviderFilterList({ options, selected, onToggle, showFlags = false }: {
	options: FilterOption[];
	selected: string[];
	onToggle: (value: string) => void;
	showFlags?: boolean;
}) {
	return (
		<div className="space-y-1.5">
			{options.map((option) => {
				const Icon = option.icon;
				const checked = selected.includes(option.value);
				return (
					<button
						key={option.value}
						type="button"
						onClick={() => onToggle(option.value)}
						aria-pressed={checked}
						className={cn(
							"group flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
							checked ? "bg-muted/45 text-foreground hover:bg-muted/55" : "hover:bg-muted/50",
						)}
					>
						<span className="flex min-w-0 items-center gap-2">
							{showFlags && option.value !== "unknown" ? (
								<Image src={`/flags/${option.value.toLowerCase()}.svg`} alt="" width={20} height={15} className="h-[15px] w-5 shrink-0 object-contain" />
							) : Icon ? <Icon className={cn("size-3.5 shrink-0", checked ? "text-primary" : "text-muted-foreground")} /> : null}
							<span className="truncate">{option.label}</span>
						</span>
						<span className={cn("inline-flex min-w-5 shrink-0 justify-center text-[11px] tabular-nums", checked ? "text-foreground" : "text-muted-foreground")}>{option.count}</span>
					</button>
				);
			})}
		</div>
	);
}

export default function APIProvidersDisplay({ providers, showPrimaryHeader = true }: APIProvidersDisplayProps) {
	const t = useTranslations("Catalogue.providers");
	const locale = useLocale();
	const providerTableDefinitions = useMemo(() => {
		const labels: Record<ProviderTableColumnId, string> = {
			provider: t("providerColumn"), headquarters: t("filterHeadquarters"),
			models: t("models"), free_models: t("freeModels"),
			modalities: t("filterModalities"), daily_tokens: t("dailyTokens"),
			monthly_tokens: t("monthlyTokens"), data_policy: t("filterDataPolicy"),
			zdr: "ZDR", privacy: t("privacyPolicy"), terms: t("termsOfService"),
		};
		return PROVIDER_TABLE_COLUMNS.map((column) => ({ ...column, label: labels[column.id] }));
	}, [t]);
	const modalityLabels = useMemo<Record<ProviderModalityKey, string>>(() => ({
		text: t("modalityText"),
		image: t("modalityImage"),
		video: t("modalityVideo"),
		audio: t("modalityAudio"),
		embedding: t("modalityEmbeddings"),
		moderation: t("modalityModeration"),
	}), [t]);
	const sortLabels = useMemo<Record<ProviderSortOption, string>>(() => ({
		daily_tokens_desc: t("sortMostUsed"),
		total_models_desc: t("sortMostModels"),
		free_models_desc: t("sortMostFreeModels"),
		a_z: t("sortNameAscending"),
	}), [t]);
	const dataPolicyLabels = useMemo<Record<string, string>>(() => ({
		private: t("dataPolicyPrivate"),
		logs: t("dataPolicyLogs"),
		trains: t("dataPolicyTrains"),
		unknown: t("unknown"),
	}), [t]);
	const zdrLabels = useMemo<Record<string, string>>(() => ({
		true: t("yes"),
		false: t("no"),
		unknown: t("unknown"),
	}), [t]);
	const formatTokens = (value: number) => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
	const countryLabel = useCallback((code: string) => {
		if (!code) return t("unknown");
		try {
			return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) ?? code.toUpperCase();
		} catch {
			return code.toUpperCase();
		}
	}, [locale, t]);
	const datacenterLabel = useCallback((value: string) => {
		const normalized = normalizeRegion(value);
		if (normalized === "global") return t("regionGlobal");
		if (["us", "eu", "uk", "apac"].includes(normalized)) return normalized.toUpperCase();
		if (["au", "ca", "jp", "kr", "sg"].includes(normalized)) return countryLabel(normalized);
		return value.trim().replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
	}, [countryLabel, t]);
	const pathname = usePathname();
	const isTable = pathname.endsWith("/table");
	const [search, setSearch] = useQueryState("search", { defaultValue: "", shallow: true });
	const deferredSearch = useDeferredValue(search);
	const [sort, setSort] = useQueryState("sort", { defaultValue: "daily_tokens_desc", shallow: true });
	const [tableSort, setTableSort] = useQueryState("tableSort", { defaultValue: "", shallow: true });
	const [tableSortDirection, setTableSortDirection] = useQueryState("tableDir", { defaultValue: "desc", shallow: true });
	const [modalities, setModalities] = useQueryState("modalities", arrayParser);
	const [coverage, setCoverage] = useQueryState("coverage", coverageParser);
	const [countries, setCountries] = useQueryState("countries", arrayParser);
	const [datacenters, setDatacenters] = useQueryState("datacenters", arrayParser);
	const [policies, setPolicies] = useQueryState("policies", arrayParser);
	const [dataPolicy, setDataPolicy] = useQueryState("dataPolicy", arrayParser);
	const [zdr, setZdr] = useQueryState("zdr", arrayParser);
	const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
	const [openSections, setOpenSections] = useState(["coverage", "modalities"]);
	const {
		columns: providerTableColumns,
		density: providerTableDensity,
		updateColumns: updateProviderTableColumns,
		updateDensity: updateProviderTableDensity,
		resetColumns: resetProviderTableColumns,
	} = useTablePreferences("providers-table", providerTableDefinitions);
	const sortOption = normalizeSortOption(sort);
	const tableSortField = normalizeTableSortField(tableSort);
	const normalizedTableSortDirection = tableSortDirection === "asc" ? "asc" : "desc";

	const countryOptions = useMemo<FilterOption[]>(() => {
		const counts = new Map<string, number>();
		for (const provider of providers) {
			const code = provider.country_code?.trim().toLowerCase() || "unknown";
			counts.set(code, (counts.get(code) ?? 0) + 1);
		}
		return Array.from(counts, ([value, count]) => ({ value, count, label: value === "unknown" ? t("unknown") : countryLabel(value) }))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [countryLabel, providers, t]);

	const datacenterOptions = useMemo<FilterOption[]>(() => {
		const counts = new Map<string, number>();
		for (const provider of providers) {
			const regions = (provider.default_execution_regions ?? [])
				.map(normalizeRegion)
				.filter(Boolean);
			if (regions.length === 0) {
				counts.set("unknown", (counts.get("unknown") ?? 0) + 1);
				continue;
			}
			for (const region of new Set(regions)) counts.set(region, (counts.get(region) ?? 0) + 1);
		}
		return Array.from(counts, ([value, count]) => ({
			value,
			count,
			label: value === "unknown" ? t("unknown") : datacenterLabel(value),
			icon: Server,
		})).sort((a, b) => a.label.localeCompare(b.label));
	}, [datacenterLabel, providers, t]);

	const modalityOptions = useMemo<FilterOption[]>(() => MODALITIES.map((item) => ({
		...item,
		label: modalityLabels[item.value],
		count: providers.filter((provider) => supportsModality(provider, item.value)).length,
	})).filter((item) => item.count > 0), [modalityLabels, providers]);

	const coverageOptions = useMemo<FilterOption[]>(() => [
		{ value: "active", label: t("gatewayProvidersFilter"), count: providers.filter((provider) => provider.is_gateway_provider).length, icon: Activity },
		{ value: "free", label: t("hasFreeModelsFilter"), count: providers.filter((provider) => provider.free_models > 0).length, icon: CircleDollarSign },
		{ value: "inactive", label: t("inactiveProvidersFilter"), count: providers.filter((provider) => matchesProviderCoverage(provider, "inactive")).length, icon: CircleOff },
	], [providers, t]);

	const policyOptions = useMemo<FilterOption[]>(() => [
		{ value: "byok", label: t("byokAvailable"), count: providers.filter((provider) => matchesProviderPolicy(provider, "byok")).length, icon: KeyRound },
		{ value: "privacy", label: t("privacyPolicy"), count: providers.filter((provider) => matchesProviderPolicy(provider, "privacy")).length, icon: ShieldCheck },
		{ value: "terms", label: t("termsOfService"), count: providers.filter((provider) => matchesProviderPolicy(provider, "terms")).length, icon: ScrollText },
	].filter((option) => option.count > 0), [providers, t]);

	const dataPolicyOptions = useMemo<FilterOption[]>(() => [
		{ value: "data_policy:private", label: t("dataPolicyPrivate"), count: providers.filter((provider) => matchesProviderPolicy(provider, "data_policy:private")).length },
		{ value: "data_policy:logs", label: t("dataPolicyLogs"), count: providers.filter((provider) => matchesProviderPolicy(provider, "data_policy:logs")).length },
		{ value: "data_policy:trains", label: t("dataPolicyTrains"), count: providers.filter((provider) => matchesProviderPolicy(provider, "data_policy:trains")).length },
		{ value: "data_policy:unknown", label: t("unknown"), count: providers.filter((provider) => matchesProviderPolicy(provider, "data_policy:unknown")).length },
	].filter((option) => option.count > 0), [providers, t]);

	const zdrOptions = useMemo<FilterOption[]>(() => [
		{ value: "zdr:true", label: t("yes"), count: providers.filter((provider) => matchesProviderPolicy(provider, "zdr:true")).length },
		{ value: "zdr:false", label: t("no"), count: providers.filter((provider) => matchesProviderPolicy(provider, "zdr:false")).length },
	].filter((option) => option.count > 0), [providers, t]);

	const filteredProviders = useMemo(() => {
		const query = deferredSearch.trim().toLowerCase();
		return [...providers]
			.filter((provider) => !query || provider.api_provider_name.toLowerCase().includes(query) || provider.api_provider_id.toLowerCase().includes(query))
			.filter((provider) => modalities.length === 0 || modalities.every((value) => supportsModality(provider, value as ProviderModalityKey)))
			.filter((provider) => countries.length === 0 || countries.includes(provider.country_code?.trim().toLowerCase() || "unknown"))
			.filter((provider) => coverage.length === 0 || coverage.every((value) => matchesProviderCoverage(provider, value)))
			.filter((provider) => datacenters.length === 0 || datacenters.every((value) => matchesProviderDatacenter(provider, value)))
			.filter((provider) => policies.length === 0 || policies.every((value) => matchesProviderPolicy(provider, value)))
			.filter((provider) => dataPolicy.length === 0 || dataPolicy.some((value) => matchesProviderPolicy(provider, value)))
			.filter((provider) => zdr.length === 0 || zdr.some((value) => matchesProviderPolicy(provider, value)))
			.sort((a, b) => {
				if (tableSortField) {
					let delta = 0;
					switch (tableSortField) {
						case "provider":
							delta = a.api_provider_name.localeCompare(b.api_provider_name);
							break;
						case "headquarters":
							delta = countryLabel(a.country_code ?? "").localeCompare(countryLabel(b.country_code ?? ""));
							break;
						case "models":
							delta = Number(a.total_models ?? 0) - Number(b.total_models ?? 0);
							break;
						case "free_models":
							delta = Number(a.free_models ?? 0) - Number(b.free_models ?? 0);
							break;
						case "modalities":
							delta = MODALITIES.reduce((left, modality) => left + Number(a.modality_support[modality.value]?.input ?? 0) + Number(a.modality_support[modality.value]?.output ?? 0), 0) - MODALITIES.reduce((left, modality) => left + Number(b.modality_support[modality.value]?.input ?? 0) + Number(b.modality_support[modality.value]?.output ?? 0), 0);
							break;
						case "daily_tokens":
							delta = Number(a.total_daily_tokens ?? 0) - Number(b.total_daily_tokens ?? 0);
							break;
						case "monthly_tokens":
							delta = Number(a.total_monthly_tokens ?? 0) - Number(b.total_monthly_tokens ?? 0);
							break;
						case "data_policy":
							delta = policyLabel(a.data_policy_tier, dataPolicyLabels, t("unknown")).localeCompare(policyLabel(b.data_policy_tier, dataPolicyLabels, t("unknown")));
							break;
						case "zdr":
							delta = policyLabel(a.zero_data_retention == null ? "unknown" : String(a.zero_data_retention), zdrLabels, t("unknown")).localeCompare(policyLabel(b.zero_data_retention == null ? "unknown" : String(b.zero_data_retention), zdrLabels, t("unknown")));
							break;
					}
					if (delta) return normalizedTableSortDirection === "asc" ? delta : -delta;
				}
				if (sortOption === "daily_tokens_desc") {
					const delta = Number(b.total_daily_tokens ?? 0) - Number(a.total_daily_tokens ?? 0);
					if (delta) return delta;
					const monthlyDelta = Number(b.total_monthly_tokens ?? 0) - Number(a.total_monthly_tokens ?? 0);
					if (monthlyDelta) return monthlyDelta;
				}
				if (sortOption === "total_models_desc") {
					const delta = Number(b.total_models ?? 0) - Number(a.total_models ?? 0);
					if (delta) return delta;
				}
				if (sortOption === "free_models_desc") {
					const delta = Number(b.free_models ?? 0) - Number(a.free_models ?? 0);
					if (delta) return delta;
				}
				return a.api_provider_name.localeCompare(b.api_provider_name);
			});
	}, [countries, countryLabel, coverage, datacenters, dataPolicy, dataPolicyLabels, deferredSearch, modalities, normalizedTableSortDirection, policies, providers, sortOption, tableSortField, t, zdr, zdrLabels]);

	const customCoverageCount = coverage.length === 1 && coverage[0] === "active" ? 0 : coverage.length;
	const activeFilterCount = modalities.length + customCoverageCount + countries.length + datacenters.length + policies.length + dataPolicy.length + zdr.length;
	const resetFilters = () => { void setModalities([]); void setCoverage(["active"]); void setCountries([]); void setDatacenters([]); void setPolicies([]); void setDataPolicy([]); void setZdr([]); };
	const filtersContent = (
		<Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
			<AccordionItem value="coverage" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline"><span className="flex items-center gap-2"><Activity className="size-4 text-muted-foreground" />{t("filterGatewayCoverage")}</span></AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation><ProviderFilterList options={coverageOptions} selected={coverage} onToggle={(value) => void setCoverage(toggleProviderCoverage(coverage, value))} /></AccordionContent>
			</AccordionItem>
			<AccordionItem value="modalities" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline"><span className="flex items-center gap-2"><Layers3 className="size-4 text-muted-foreground" />{t("filterModalities")}</span></AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation><ProviderFilterList options={modalityOptions} selected={modalities} onToggle={(value) => void setModalities(toggleValue(modalities, value))} /></AccordionContent>
			</AccordionItem>
			<AccordionItem value="policies" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground" />{t("filterPolicies")}</span></AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation><ProviderFilterList options={policyOptions} selected={policies} onToggle={(value) => void setPolicies(toggleValue(policies, value))} /></AccordionContent>
			</AccordionItem>
			<AccordionItem value="dataPolicy" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground" />{t("filterDataPolicy")}</span></AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation><ProviderFilterList options={dataPolicyOptions} selected={dataPolicy} onToggle={(value) => void setDataPolicy(toggleValue(dataPolicy, value))} /></AccordionContent>
			</AccordionItem>
			<AccordionItem value="zdr" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground" />ZDR</span></AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation><ProviderFilterList options={zdrOptions} selected={zdr} onToggle={(value) => void setZdr(toggleValue(zdr, value))} /></AccordionContent>
			</AccordionItem>
			<AccordionItem value="headquarters" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline"><span className="flex items-center gap-2"><Globe2 className="size-4 text-muted-foreground" />{t("filterHeadquarters")}</span></AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation><ProviderFilterList options={countryOptions} selected={countries} onToggle={(value) => void setCountries(toggleValue(countries, value))} showFlags /></AccordionContent>
			</AccordionItem>
			<AccordionItem value="datacenters" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline"><span className="flex items-center gap-2"><Server className="size-4 text-muted-foreground" />{t("filterDatacentres")}</span></AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation><ProviderFilterList options={datacenterOptions} selected={datacenters} onToggle={(value) => void setDatacenters(toggleValue(datacenters, value))} /></AccordionContent>
			</AccordionItem>
		</Accordion>
	);

	const mdFillers = (2 - (filteredProviders.length % 2)) % 2;
	const twoXlFillers = (3 - (filteredProviders.length % 3)) % 3;
	const toolbarRef = useRef<HTMLDivElement | null>(null);
	const tableContainerRef = useRef<HTMLDivElement | null>(null);
	const tableHeaderTrackRef = useRef<HTMLDivElement | null>(null);
	const [stickyOffsets, setStickyOffsets] = useState({ toolbarTop: 60, tableHeaderTop: 60 });

	useEffect(() => {
		const toolbar = toolbarRef.current;
		if (!toolbar || typeof window === "undefined") return;
		const siteHeader = document.querySelector<HTMLElement>("#dashboard-shell > header");
		const mediumViewport = window.matchMedia("(min-width: 768px)");
		const updateOffsets = () => {
			const toolbarTop = Math.ceil(siteHeader?.getBoundingClientRect().height ?? 60);
			const toolbarHeight = mediumViewport.matches ? Math.ceil(toolbar.getBoundingClientRect().height) : 0;
			const tableHeaderTop = toolbarTop + toolbarHeight;
			setStickyOffsets((current) => current.toolbarTop === toolbarTop && current.tableHeaderTop === tableHeaderTop ? current : { toolbarTop, tableHeaderTop });
		};
		updateOffsets();
		const resizeObserver = new ResizeObserver(updateOffsets);
		resizeObserver.observe(toolbar);
		if (siteHeader) resizeObserver.observe(siteHeader);
		mediumViewport.addEventListener("change", updateOffsets);
		window.addEventListener("resize", updateOffsets);
		return () => {
			resizeObserver.disconnect();
			mediumViewport.removeEventListener("change", updateOffsets);
			window.removeEventListener("resize", updateOffsets);
		};
	}, []);

	useEffect(() => {
		const tableContainer = tableContainerRef.current;
		const headerTrack = tableHeaderTrackRef.current;
		if (!tableContainer || !headerTrack) return;
		const syncHeaderScroll = () => {
			headerTrack.style.transform = `translate3d(${-tableContainer.scrollLeft}px, 0, 0)`;
			headerTrack.style.setProperty(
				"--table-scroll-left",
				`${tableContainer.scrollLeft}px`,
			);
		};
		syncHeaderScroll();
		tableContainer.addEventListener("scroll", syncHeaderScroll, { passive: true });
		return () => tableContainer.removeEventListener("scroll", syncHeaderScroll);
	}, [filteredProviders.length, isTable]);

	const sortSelect = (className: string) => (
		<Select value={sortOption} onValueChange={(value) => {
			void setSort(normalizeSortOption(value));
			void setTableSort(null);
			void setTableSortDirection(null);
		}}>
		<SelectTrigger className={cn("rounded-md border-border", className)} aria-label={t("sort")}><span className="flex min-w-0 items-center gap-2"><ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{sortLabels[sortOption]}</span></span></SelectTrigger>
			<SelectContent align="end">{SORT_OPTIONS.map((option) => <SelectItem key={option} value={option}>{sortLabels[option]}</SelectItem>)}</SelectContent>
		</Select>
	);
	const filterButton = () => (
		<Button variant="outline" size="sm" className="relative h-8 rounded-md px-2 lg:hidden" onClick={() => setMobileFiltersOpen(true)} aria-label={t("filters")}><SlidersHorizontal className="size-3.5" /><span className="sr-only">{t("filters")}</span>{activeFilterCount ? <span className="absolute -right-1 -top-1 min-w-4 rounded-sm bg-primary px-1 text-[10px] text-primary-foreground">{activeFilterCount}</span> : null}</Button>
	);
	const viewSwitcher = (
		<div className="inline-flex h-8 shrink-0 overflow-hidden rounded-md border border-border/70 bg-background shadow-xs">
			<Link href="/api-providers" prefetch={false} aria-label={t("cardView")} aria-current={!isTable ? "page" : undefined} className={cn("inline-flex h-8 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45", !isTable && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}><LayoutGrid className="size-4" /></Link>
			<Link href="/api-providers/table" prefetch={false} aria-label={t("tableView")} aria-current={isTable ? "page" : undefined} className={cn("inline-flex h-8 w-9 items-center justify-center border-l border-border/70 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45", isTable && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}><Table2 className="size-4" /></Link>
		</div>
	);
	const handleTableSort = (field: ProviderTableSortField) => {
		if (tableSortField !== field) {
			void setTableSort(field);
			void setTableSortDirection("desc");
			return;
		}
		if (normalizedTableSortDirection === "desc") {
			void setTableSortDirection("asc");
			return;
		}
		void setTableSort(null);
		void setTableSortDirection(null);
	};
	const tableSortIcon = (field: ProviderTableSortField) => {
		if (tableSortField !== field) return <ChevronsUpDown className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />;
		return normalizedTableSortDirection === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
	};
	const renderTableSortHead = (label: string, field: ProviderTableSortField, align: "left" | "center" = "left") => (
		<button type="button" onClick={() => handleTableSort(field)} className={cn("group inline-flex w-full items-center gap-1.5 text-xs font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", align === "center" ? "justify-center text-center" : "justify-start text-left", tableSortField === field ? "text-foreground" : "text-muted-foreground")} aria-label={t("sortProvidersBy", { metric: label.toLowerCase() })}>
			<span>{label}</span>
			{tableSortIcon(field)}
		</button>
	);
	const visibleProviderTableColumns = providerTableColumns
		.filter(({ visible }) => visible)
		.map((preference) => ({
			preference,
			definition: providerTableDefinitions.find(({ id }) => id === preference.id)! as ProviderTableColumn,
		}));
	const providerTableWidth = visibleProviderTableColumns.reduce(
		(total, { definition }) => total + definition.width,
		0,
	);
	const providerTablePinnedProps = (index: number, header = false) => {
		const current = visibleProviderTableColumns[index];
		if (!current?.preference.pinned) return {};
		const left = visibleProviderTableColumns
			.slice(0, index)
			.reduce((total, { definition }) => total + definition.width, 0);
		return {
			"data-pinned": true,
			style: {
				position: "sticky" as const,
				left,
				zIndex: header ? 3 : 1,
				backgroundColor: "var(--background)",
				transform: header
					? "translateX(var(--table-scroll-left, 0px))"
					: undefined,
				boxShadow: !visibleProviderTableColumns[index + 1]?.preference.pinned
					? "inset -1px 0 0 var(--border)"
					: undefined,
			},
		};
	};
	const providerTableColgroup = () => (
		<colgroup>
			{visibleProviderTableColumns.map(({ definition }) => (
				<col key={definition.id} style={{ width: `${definition.width}px` }} />
			))}
		</colgroup>
	);
	const providerTableHeader = () => (
		<TableHeader>
			<TableRow className="bg-background hover:bg-background">
				{visibleProviderTableColumns.map(({ definition }, index) => {
					const align = definition.numeric ? "center" : "left";
					const sortable = definition.id !== "privacy" && definition.id !== "terms";
					return (
						<TableHead
							key={definition.id}
							{...providerTablePinnedProps(index, true)}
							className={cn("bg-background", definition.numeric && "text-center")}
						>
							{sortable
								? renderTableSortHead(
										definition.label,
										definition.id as ProviderTableSortField,
										align,
									)
								: definition.label}
						</TableHead>
					);
				})}
			</TableRow>
		</TableHeader>
	);
	const renderProviderTableCell = (
		provider: APIProviderCardType,
		column: ProviderTableColumnId,
	) => {
		switch (column) {
			case "provider": {
				const isExternal =
					String(provider.provider_status ?? "").trim().toLowerCase() ===
					"external";
				return (
					<Link
						href={`/api-providers/${provider.api_provider_id}`}
						prefetch={false}
						className={cn(
							"inline-flex min-w-0 items-center gap-2 font-medium leading-none hover:underline hover:underline-offset-4",
							providerTableDensity === "compact"
								? "h-8"
								: providerTableDensity === "expanded"
									? "h-14"
									: "h-11",
						)}
					>
						<span className="relative flex size-6 shrink-0 items-center justify-center rounded-md border">
							<span className="relative size-4">
								<Logo
									id={provider.api_provider_id}
									alt=""
									fill
									className="object-contain"
								/>
							</span>
						</span>
						<span className="flex min-w-0 items-center gap-1.5">
							<span className="truncate">{provider.api_provider_name}</span>
							{isExternal ? (
								<span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
									<ArrowUpRight className="size-3" />
									{t("external")}
								</span>
							) : null}
						</span>
					</Link>
				);
			}
			case "headquarters": {
				if (!provider.country_code) return "—";
				const location =
					formatLocation(provider.country_code, provider.subdivision_code, locale) ??
					countryLabel(provider.country_code);
				return (
					<Link
							href={`/countries/${provider.country_code.toLowerCase()}`}
							prefetch={false}
							className="inline-flex min-w-0 max-w-full items-center gap-2 whitespace-nowrap hover:underline hover:underline-offset-4"
					>
						<Image
							src={`/flags/${provider.country_code.toLowerCase()}.svg`}
							alt=""
							width={16}
							height={12}
							className="h-3 w-4 shrink-0 object-cover"
						/>
						<span>{location}</span>
					</Link>
				);
			}
			case "models":
				return provider.total_models.toLocaleString(locale);
			case "free_models":
				return provider.free_models ? provider.free_models.toLocaleString(locale) : "—";
			case "modalities": {
				const supported = MODALITIES.filter((modality) =>
					supportsModality(provider, modality.value),
				);
				return (
					<div className="flex items-center gap-1.5">
						{supported.map(({ value, icon: Icon }) => (
							<ProviderModalityBadge
								key={value}
								label={modalityLabels[value]}
								modality={value}
								icon={Icon}
								inputCount={provider.modality_support[value]?.input ?? 0}
								outputCount={provider.modality_support[value]?.output ?? 0}
							/>
						))}
					</div>
				);
			}
			case "daily_tokens":
				return formatTokens(Number(provider.total_daily_tokens));
			case "monthly_tokens":
				return formatTokens(Number(provider.total_monthly_tokens));
			case "data_policy":
				return policyLabel(provider.data_policy_tier, dataPolicyLabels, t("unknown"));
			case "zdr":
				return policyLabel(String(provider.zero_data_retention), zdrLabels, t("unknown"));
			case "privacy":
				return provider.privacy_policy_url ? (
					<a
						href={provider.privacy_policy_url}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1 font-medium hover:underline hover:underline-offset-4"
					>
						{t("privacyPolicy")} <ExternalLink className="size-3 text-muted-foreground" />
					</a>
				) : (
					<span className="text-muted-foreground">—</span>
				);
			case "terms":
				return provider.terms_of_service_url ? (
					<a
						href={provider.terms_of_service_url}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1 font-medium hover:underline hover:underline-offset-4"
					>
						{t("termsOfService")} <ExternalLink className="size-3 text-muted-foreground" />
					</a>
				) : (
					<span className="text-muted-foreground">—</span>
				);
		}
	};
	const providerTableSettings = isTable ? (
		<TableSettings
			columns={providerTableColumns}
			definitions={providerTableDefinitions}
			tableLabel={t("title")}
			onReset={resetProviderTableColumns}
			onChange={updateProviderTableColumns}
			density={providerTableDensity}
			onDensityChange={updateProviderTableDensity}
		/>
	) : null;
	return (
		<div className="flex w-full flex-1">
			<aside className="hidden lg:block w-[20rem] shrink-0 border-r border-border/70 bg-background/95 [&_[data-slot=separator]]:-mx-4">
				<div className="sticky top-16 flex h-[calc(100dvh-4rem)] min-h-0 flex-col">
					<ScrollArea className="min-h-0 flex-1 overscroll-y-contain [&>[data-orientation=vertical]]:opacity-0 [&>[data-orientation=vertical]]:transition-opacity [&>[data-orientation=vertical]]:duration-150 hover:[&>[data-orientation=vertical]]:opacity-100 focus-within:[&>[data-orientation=vertical]]:opacity-100"><div className="space-y-4 px-4 py-2 pb-6">{filtersContent}</div></ScrollArea>
				</div>
			</aside>

			<section className="min-w-0 flex flex-1 flex-col">
				<div ref={toolbarRef} className="z-40 shrink-0 border-b border-border/70 bg-background/95 px-4 pb-1 pt-2.5 backdrop-blur md:sticky lg:px-8" style={{ top: `${stickyOffsets.toolbarTop}px` }}>
					<div className="space-y-2 md:hidden">
						{showPrimaryHeader ? <div className="flex items-center gap-2"><h1 className="font-bold text-xl leading-8">{t("title")}</h1></div> : null}
						<div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
							{sortSelect("h-8 min-w-0 bg-background text-sm")}
							{filterButton()}
							<div className="flex items-center gap-1">
								{providerTableSettings}
								{showPrimaryHeader ? viewSwitcher : null}
							</div>
						</div>
						<div className="relative w-full">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input placeholder={t("searchPlaceholder")} value={search} onChange={(event) => void setSearch(event.target.value, { limitUrlUpdates: debounce(250) })} className="h-8 w-full rounded-md border border-border bg-background pl-9 pr-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary" style={{ minWidth: 0 }} />
						</div>
					</div>

					<div className="hidden md:block">
						<div className="hidden lg:block">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex h-8 shrink-0 items-center">{showPrimaryHeader ? <h1 className="font-bold text-xl leading-8">{t("title")}</h1> : null}</div>
								<div className="flex min-w-[min(100%,30rem)] flex-1 items-center justify-end gap-3">
									<div className="relative min-w-32 max-w-[22rem] flex-1 2xl:max-w-[28rem]">
										<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input placeholder={t("searchPlaceholder")} value={search} onChange={(event) => void setSearch(event.target.value, { limitUrlUpdates: debounce(250) })} className="h-8 w-full rounded-md border border-border bg-background pl-9 pr-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary" style={{ minWidth: 0 }} />
									</div>
									{sortSelect("h-8 w-[12.5rem] bg-background text-sm 2xl:w-[13.5rem]")}
									{providerTableSettings}
									{showPrimaryHeader ? viewSwitcher : null}
									<Button asChild variant="outline" size="sm" className="h-8 rounded-md px-2.5"><Link href="/api-providers/compare" prefetch={false}><Scale className="size-3.5" /><span className="hidden sm:inline">{t("compareButton")}</span></Link></Button>
								</div>
							</div>
						</div>

						<div className="lg:hidden">
							<div className="flex h-8 items-center justify-between gap-3">
								{showPrimaryHeader ? <h1 className="font-bold text-xl leading-8">{t("title")}</h1> : <div />}
								<div className="flex shrink-0 items-center justify-end gap-2">{filterButton()}{providerTableSettings}{showPrimaryHeader ? viewSwitcher : null}</div>
							</div>
							<div className="mt-2 grid grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] items-center gap-2">
								{sortSelect("h-8 min-w-0 bg-background text-sm")}
								<div className="relative min-w-0">
									<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
									<Input placeholder={t("searchPlaceholder")} value={search} onChange={(event) => void setSearch(event.target.value, { limitUrlUpdates: debounce(250) })} className="h-8 w-full rounded-md border border-border bg-background pl-9 pr-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary" style={{ minWidth: 0 }} />
								</div>
							</div>
						</div>
					</div>
				</div>

					<div className="w-full px-4 pt-1 pb-5 lg:px-8 lg:pt-1 lg:pb-6">
						<div className={cn(isTable ? "bg-background" : "overflow-hidden bg-border/70")}>
							{filteredProviders.length && isTable ? (
								<div className="relative">
									<div className="sticky z-30 w-full overflow-hidden bg-background" style={{ top: `${stickyOffsets.tableHeaderTop}px` }}>
										<div ref={tableHeaderTrackRef} className="will-change-transform" style={{ width: `${providerTableWidth}px`, minWidth: `${providerTableWidth}px` }}>
											<Table wrapInContainer={false} aria-label={t("providerTableColumnHeadersAria")} className="table-fixed w-max bg-background text-xs" style={{ width: `${providerTableWidth}px`, minWidth: `${providerTableWidth}px` }}>
												{providerTableColgroup()}
												{providerTableHeader()}
											</Table>
										</div>
									</div>
									<ScrollArea
									className="w-full"
									scrollBarOrientation="horizontal"
									keepScrollbarMounted
									viewportClassName="w-full pb-2"
									viewportRef={tableContainerRef}
								>
						<Table
							wrapInContainer={false}
							aria-label={t("providerTableRowsAria")}
							data-density={providerTableDensity}
							className="table-fixed w-max bg-background text-xs"
							style={{ width: `${providerTableWidth}px`, minWidth: `${providerTableWidth}px` }}
						>
											{providerTableColgroup()}
											<TableBody className="bg-background">
												{filteredProviders.map((provider) => (
													<TableRow key={provider.api_provider_id} className="hover:bg-muted/35">
														{visibleProviderTableColumns.map(({ definition }, index) => (
											<TableCell
												key={definition.id}
												{...providerTablePinnedProps(index)}
												className={cn(
													definition.id === "provider"
														? "py-0"
														: providerTableDensity === "compact"
															? "py-1"
															: providerTableDensity === "expanded"
																? "py-4"
																: "py-2",
													definition.numeric && "text-center font-medium tabular-nums",
																	(definition.id === "data_policy" || definition.id === "zdr") && "whitespace-nowrap",
																	definition.id === "data_policy" && !provider.data_policy_tier && "text-muted-foreground",
																)}
															>
																{renderProviderTableCell(provider, definition.id)}
															</TableCell>
														))}
													</TableRow>
												))}
											</TableBody>
										</Table>
									</ScrollArea>
							</div>
						) : filteredProviders.length ? <div className="grid grid-cols-1 gap-px md:grid-cols-2 2xl:grid-cols-3">
							{filteredProviders.map((provider) => <APIProviderCard key={provider.api_provider_id} api_provider={provider} />)}
							{Array.from({ length: mdFillers }).map((_, index) => <div key={`md-filler-${index}`} aria-hidden className="hidden bg-background md:block 2xl:hidden" />)}
							{Array.from({ length: twoXlFillers }).map((_, index) => <div key={`2xl-filler-${index}`} aria-hidden className="hidden bg-background 2xl:block" />)}
						</div> : <div className="flex min-h-64 flex-col items-center justify-center gap-2 bg-background px-4 text-center"><Search className="size-5 text-muted-foreground" /><p className="text-sm font-medium">{t("noResults")}</p><p className="text-xs text-muted-foreground">{t("tryDifferent")}</p>{activeFilterCount ? <Button variant="outline" size="sm" className="mt-2 rounded-md" onClick={resetFilters}>{t("reset")}</Button> : null}</div>}
					</div>
				</div>
			</section>

			<Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
				<SheetContent side="right" className="w-[86vw] max-w-sm gap-0 p-0 lg:hidden">
					<SheetHeader className="border-b border-border/70 px-4 py-3 text-left"><div className="flex items-start justify-between gap-3 pr-8"><div><SheetTitle>{t("filters")}</SheetTitle><SheetDescription>{t("refine")}</SheetDescription></div>{activeFilterCount ? <Button variant="ghost" size="sm" className="h-8 px-2" onClick={resetFilters}>{t("reset")}</Button> : null}</div></SheetHeader>
					<ScrollArea className="min-h-0 flex-1 overscroll-y-contain px-4 py-2"><div className="space-y-4 pb-6">{filtersContent}</div></ScrollArea>
				</SheetContent>
			</Sheet>
		</div>
	);
}
