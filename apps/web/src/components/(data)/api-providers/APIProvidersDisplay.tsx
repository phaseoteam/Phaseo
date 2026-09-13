"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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

type FilterOption = { value: string; label: string; count: number; icon?: LucideIcon };

const SORT_OPTION_LABELS: Record<ProviderSortOption, string> = {
	daily_tokens_desc: "Most Used",
	total_models_desc: "Most Models",
	free_models_desc: "Most Free Models",
	a_z: "Name (A–Z)",
};

const MODALITIES: Array<{ value: ProviderModalityKey; label: string; icon: LucideIcon }> = [
	{ value: "text", label: "Text", icon: Type },
	{ value: "image", label: "Image", icon: ImageIcon },
	{ value: "video", label: "Video", icon: Video },
	{ value: "audio", label: "Audio", icon: AudioLines },
	{ value: "embedding", label: "Embeddings", icon: Binary },
	{ value: "moderation", label: "Moderation", icon: BadgeAlert },
];

const DATA_POLICY_LABELS: Record<string, string> = {
	private: "Private",
	logs: "Logs",
	trains: "Trains",
	unknown: "Unknown",
};

const ZDR_LABELS: Record<string, string> = { true: "True", false: "False" };

function policyLabel(value: string | null, labels: Record<string, string>): string {
	return value ? labels[value] ?? value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Unknown";
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

function countryLabel(code: string) {
	if (!code) return "Unknown";
	try {
		return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code.toUpperCase();
	} catch {
		return code.toUpperCase();
	}
}

function normalizeRegion(value: string) {
	return value.trim().toLowerCase();
}

function datacenterLabel(value: string) {
	const normalized = normalizeRegion(value);
	const labels: Record<string, string> = {
		global: "Global",
		us: "US",
		eu: "EU",
		uk: "UK",
		apac: "APAC",
		au: "Australia",
		ca: "Canada",
		jp: "Japan",
		kr: "South Korea",
		sg: "Singapore",
	};
	if (labels[normalized]) return labels[normalized];
	return value.trim().replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTokens(value: number) {
	if (!Number.isFinite(value) || value <= 0) return "0";
	for (const unit of [
		{ value: 1_000_000_000_000, suffix: "T" },
		{ value: 1_000_000_000, suffix: "B" },
		{ value: 1_000_000, suffix: "M" },
		{ value: 1_000, suffix: "K" },
	]) {
		if (value >= unit.value) return `${(value / unit.value).toFixed(value / unit.value >= 100 ? 0 : 1).replace(/\.0$/, "")}${unit.suffix}`;
	}
	return Math.round(value).toLocaleString("en-US");
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
	const sortOption = normalizeSortOption(sort);
	const tableSortField = normalizeTableSortField(tableSort);
	const normalizedTableSortDirection = tableSortDirection === "asc" ? "asc" : "desc";

	const countryOptions = useMemo<FilterOption[]>(() => {
		const counts = new Map<string, number>();
		for (const provider of providers) {
			const code = provider.country_code?.trim().toLowerCase() || "unknown";
			counts.set(code, (counts.get(code) ?? 0) + 1);
		}
		return Array.from(counts, ([value, count]) => ({ value, count, label: value === "unknown" ? "Unknown" : countryLabel(value) }))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [providers]);

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
			label: value === "unknown" ? "Unknown" : datacenterLabel(value),
			icon: Server,
		})).sort((a, b) => a.label.localeCompare(b.label));
	}, [providers]);

	const modalityOptions = useMemo<FilterOption[]>(() => MODALITIES.map((item) => ({
		...item,
		count: providers.filter((provider) => supportsModality(provider, item.value)).length,
	})).filter((item) => item.count > 0), [providers]);

	const coverageOptions = useMemo<FilterOption[]>(() => [
		{ value: "active", label: "Gateway Providers", count: providers.filter((provider) => provider.is_gateway_provider).length, icon: Activity },
		{ value: "free", label: "Has Free Models", count: providers.filter((provider) => provider.free_models > 0).length, icon: CircleDollarSign },
		{ value: "inactive", label: "Inactive Providers", count: providers.filter((provider) => matchesProviderCoverage(provider, "inactive")).length, icon: CircleOff },
	], [providers]);

	const policyOptions = useMemo<FilterOption[]>(() => [
		{ value: "byok", label: "BYOK Available", count: providers.filter((provider) => matchesProviderPolicy(provider, "byok")).length, icon: KeyRound },
		{ value: "privacy", label: "Privacy Policy", count: providers.filter((provider) => matchesProviderPolicy(provider, "privacy")).length, icon: ShieldCheck },
		{ value: "terms", label: "Terms of Service", count: providers.filter((provider) => matchesProviderPolicy(provider, "terms")).length, icon: ScrollText },
	].filter((option) => option.count > 0), [providers]);

	const dataPolicyOptions = useMemo<FilterOption[]>(() => [
		{ value: "data_policy:private", label: "Private", count: providers.filter((provider) => matchesProviderPolicy(provider, "data_policy:private")).length },
		{ value: "data_policy:logs", label: "Logs", count: providers.filter((provider) => matchesProviderPolicy(provider, "data_policy:logs")).length },
		{ value: "data_policy:trains", label: "Trains", count: providers.filter((provider) => matchesProviderPolicy(provider, "data_policy:trains")).length },
		{ value: "data_policy:unknown", label: "Unknown", count: providers.filter((provider) => matchesProviderPolicy(provider, "data_policy:unknown")).length },
	].filter((option) => option.count > 0), [providers]);

	const zdrOptions = useMemo<FilterOption[]>(() => [
		{ value: "zdr:true", label: "True", count: providers.filter((provider) => matchesProviderPolicy(provider, "zdr:true")).length },
		{ value: "zdr:false", label: "False", count: providers.filter((provider) => matchesProviderPolicy(provider, "zdr:false")).length },
	].filter((option) => option.count > 0), [providers]);

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
							delta = countryLabel(a.country_code).localeCompare(countryLabel(b.country_code));
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
							delta = policyLabel(a.data_policy_tier, DATA_POLICY_LABELS).localeCompare(policyLabel(b.data_policy_tier, DATA_POLICY_LABELS));
							break;
						case "zdr":
							delta = policyLabel(String(a.zero_data_retention), ZDR_LABELS).localeCompare(policyLabel(String(b.zero_data_retention), ZDR_LABELS));
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
	}, [countries, coverage, datacenters, dataPolicy, deferredSearch, modalities, normalizedTableSortDirection, policies, providers, sortOption, tableSortField, zdr]);

	const customCoverageCount = coverage.length === 1 && coverage[0] === "active" ? 0 : coverage.length;
	const activeFilterCount = modalities.length + customCoverageCount + countries.length + datacenters.length + policies.length + dataPolicy.length + zdr.length;
	const resetFilters = () => { void setModalities([]); void setCoverage(["active"]); void setCountries([]); void setDatacenters([]); void setPolicies([]); void setDataPolicy([]); void setZdr([]); };
	const filtersContent = (
		<Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
			<AccordionItem value="coverage" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline"><span className="flex items-center gap-2"><Activity className="size-4 text-muted-foreground" />Gateway Coverage</span></AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation><ProviderFilterList options={coverageOptions} selected={coverage} onToggle={(value) => void setCoverage(toggleProviderCoverage(coverage, value))} /></AccordionContent>
			</AccordionItem>
			<AccordionItem value="modalities" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline"><span className="flex items-center gap-2"><Layers3 className="size-4 text-muted-foreground" />Modalities</span></AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation><ProviderFilterList options={modalityOptions} selected={modalities} onToggle={(value) => void setModalities(toggleValue(modalities, value))} /></AccordionContent>
			</AccordionItem>
			<AccordionItem value="policies" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground" />Policies</span></AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation><ProviderFilterList options={policyOptions} selected={policies} onToggle={(value) => void setPolicies(toggleValue(policies, value))} /></AccordionContent>
			</AccordionItem>
			<AccordionItem value="dataPolicy" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground" />Data Policy</span></AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation><ProviderFilterList options={dataPolicyOptions} selected={dataPolicy} onToggle={(value) => void setDataPolicy(toggleValue(dataPolicy, value))} /></AccordionContent>
			</AccordionItem>
			<AccordionItem value="zdr" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground" />ZDR</span></AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation><ProviderFilterList options={zdrOptions} selected={zdr} onToggle={(value) => void setZdr(toggleValue(zdr, value))} /></AccordionContent>
			</AccordionItem>
			<AccordionItem value="headquarters" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline"><span className="flex items-center gap-2"><Globe2 className="size-4 text-muted-foreground" />Headquarters</span></AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation><ProviderFilterList options={countryOptions} selected={countries} onToggle={(value) => void setCountries(toggleValue(countries, value))} showFlags /></AccordionContent>
			</AccordionItem>
			<AccordionItem value="datacenters" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline"><span className="flex items-center gap-2"><Server className="size-4 text-muted-foreground" />Datacenters</span></AccordionTrigger>
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
			<SelectTrigger className={cn("rounded-md border-border", className)} aria-label="Sort providers"><span className="flex min-w-0 items-center gap-2"><ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{SORT_OPTION_LABELS[sortOption]}</span></span></SelectTrigger>
			<SelectContent align="end">{(Object.keys(SORT_OPTION_LABELS) as ProviderSortOption[]).map((option) => <SelectItem key={option} value={option}>{SORT_OPTION_LABELS[option]}</SelectItem>)}</SelectContent>
		</Select>
	);
	const filterButton = () => (
		<Button variant="outline" size="sm" className="relative h-8 rounded-md px-2 lg:hidden" onClick={() => setMobileFiltersOpen(true)} aria-label="Open filters"><SlidersHorizontal className="size-3.5" /><span className="sr-only">Filters</span>{activeFilterCount ? <span className="absolute -right-1 -top-1 min-w-4 rounded-sm bg-primary px-1 text-[10px] text-primary-foreground">{activeFilterCount}</span> : null}</Button>
	);
	const viewSwitcher = (
		<div className="inline-flex h-8 shrink-0 overflow-hidden rounded-md border border-border/70 bg-background shadow-xs">
			<Link href="/api-providers" prefetch={false} aria-label="Card view" aria-current={!isTable ? "page" : undefined} className={cn("inline-flex h-8 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45", !isTable && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}><LayoutGrid className="size-4" /></Link>
			<Link href="/api-providers/table" prefetch={false} aria-label="Table view" aria-current={isTable ? "page" : undefined} className={cn("inline-flex h-8 w-9 items-center justify-center border-l border-border/70 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45", isTable && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}><Table2 className="size-4" /></Link>
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
		<button type="button" onClick={() => handleTableSort(field)} className={cn("group inline-flex w-full items-center gap-1.5 text-xs font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", align === "center" ? "justify-center text-center" : "justify-start text-left", tableSortField === field ? "text-foreground" : "text-muted-foreground")} aria-label={`Sort providers by ${label.toLowerCase()}`}>
			<span>{label}</span>
			{tableSortIcon(field)}
		</button>
	);
	const providerTableColgroup = () => (
		<colgroup>
			{[240, 150, 80, 90, 220, 120, 130, 160, 150, 110, 110].map((width, index) => <col key={`provider-col-${index}`} style={{ width: `${width}px` }} />)}
		</colgroup>
	);
	const providerTableHeader = () => (
		<TableHeader>
			<TableRow className="bg-background hover:bg-background">
				<TableHead className="bg-background">{renderTableSortHead("Provider", "provider")}</TableHead>
				<TableHead className="bg-background">{renderTableSortHead("Headquarters", "headquarters")}</TableHead>
				<TableHead className="bg-background text-center">{renderTableSortHead("Models", "models", "center")}</TableHead>
				<TableHead className="bg-background text-center">{renderTableSortHead("Free Models", "free_models", "center")}</TableHead>
				<TableHead className="bg-background">{renderTableSortHead("Modalities", "modalities")}</TableHead>
				<TableHead className="bg-background text-center">{renderTableSortHead("Daily Tokens", "daily_tokens", "center")}</TableHead>
				<TableHead className="bg-background text-center">{renderTableSortHead("Monthly Tokens", "monthly_tokens", "center")}</TableHead>
				<TableHead className="bg-background">{renderTableSortHead("Data policy", "data_policy")}</TableHead>
				<TableHead className="bg-background">{renderTableSortHead("ZDR", "zdr")}</TableHead>
				<TableHead className="bg-background">Privacy</TableHead>
				<TableHead className="bg-background">Terms</TableHead>
			</TableRow>
		</TableHeader>
	);
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
						{showPrimaryHeader ? <div className="flex items-center gap-2"><h1 className="font-bold text-xl leading-8">Providers</h1></div> : null}
						<div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
							{sortSelect("h-8 min-w-0 bg-background text-sm")}
							{filterButton()}
							{showPrimaryHeader ? viewSwitcher : null}
						</div>
						<div className="relative w-full">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input placeholder="Search" value={search} onChange={(event) => void setSearch(event.target.value, { limitUrlUpdates: debounce(250) })} className="h-8 w-full rounded-md border border-border bg-background pl-9 pr-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary" style={{ minWidth: 0 }} />
						</div>
					</div>

					<div className="hidden md:block">
						<div className="hidden lg:block">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex h-8 shrink-0 items-center">{showPrimaryHeader ? <h1 className="font-bold text-xl leading-8">Providers</h1> : null}</div>
								<div className="flex min-w-[min(100%,30rem)] flex-1 items-center justify-end gap-3">
									<div className="relative min-w-32 max-w-[22rem] flex-1 2xl:max-w-[28rem]">
										<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input placeholder="Search" value={search} onChange={(event) => void setSearch(event.target.value, { limitUrlUpdates: debounce(250) })} className="h-8 w-full rounded-md border border-border bg-background pl-9 pr-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary" style={{ minWidth: 0 }} />
									</div>
									{sortSelect("h-8 w-[12.5rem] bg-background text-sm 2xl:w-[13.5rem]")}
									{showPrimaryHeader ? viewSwitcher : null}
									<Button asChild variant="outline" size="sm" className="h-8 rounded-md px-2.5"><Link href="/api-providers/compare" prefetch={false}><Scale className="size-3.5" /><span className="hidden sm:inline">Compare</span></Link></Button>
								</div>
							</div>
						</div>

						<div className="lg:hidden">
							<div className="flex h-8 items-center justify-between gap-3">
								{showPrimaryHeader ? <h1 className="font-bold text-xl leading-8">Providers</h1> : <div />}
								<div className="flex shrink-0 items-center justify-end gap-2">{filterButton()}{showPrimaryHeader ? viewSwitcher : null}</div>
							</div>
							<div className="mt-2 grid grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] items-center gap-2">
								{sortSelect("h-8 min-w-0 bg-background text-sm")}
								<div className="relative min-w-0">
									<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
									<Input placeholder="Search" value={search} onChange={(event) => void setSearch(event.target.value, { limitUrlUpdates: debounce(250) })} className="h-8 w-full rounded-md border border-border bg-background pl-9 pr-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary" style={{ minWidth: 0 }} />
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
									<div ref={tableHeaderTrackRef} className="will-change-transform" style={{ width: "1560px", minWidth: "1560px" }}>
										<Table wrapInContainer={false} aria-label="Providers table column headers" className="table-fixed w-max bg-background text-xs" style={{ width: "1560px", minWidth: "1560px" }}>
											{providerTableColgroup()}
											{providerTableHeader()}
										</Table>
									</div>
								</div>
								<div ref={tableContainerRef} className="relative overflow-x-auto overflow-y-clip">
									<Table wrapInContainer={false} aria-label="Providers table rows" className="table-fixed w-max bg-background text-xs" style={{ width: "1560px", minWidth: "1560px" }}>
										{providerTableColgroup()}
										<TableBody className="bg-background">{filteredProviders.map((provider) => {
										const supported = MODALITIES.filter((modality) => supportsModality(provider, modality.value));
										const isExternal = String(provider.provider_status ?? "").trim().toLowerCase() === "external";
										return <TableRow key={provider.api_provider_id} className="hover:bg-muted/35">
											<TableCell className="py-0"><Link href={`/api-providers/${provider.api_provider_id}`} prefetch={false} className="inline-flex h-11 min-w-0 items-center gap-2 font-medium leading-none hover:underline hover:underline-offset-4"><span className="relative size-6 shrink-0"><Logo id={provider.api_provider_id} alt={provider.api_provider_name} fill className="object-contain" /></span><span className="flex min-w-0 items-center gap-1.5"><span className="truncate">{provider.api_provider_name}</span>{isExternal ? <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300"><ArrowUpRight className="size-3" />External</span> : null}</span></Link></TableCell>
											<TableCell>{provider.country_code ? <Link href={`/countries/${provider.country_code.toLowerCase()}`} prefetch={false} className="inline-flex items-center gap-2 hover:underline hover:underline-offset-4"><Image src={`/flags/${provider.country_code.toLowerCase()}.svg`} alt="" width={16} height={12} className="h-3 w-4 object-cover" />{formatLocation(provider.country_code, provider.subdivision_code) ?? countryLabel(provider.country_code)}</Link> : "—"}</TableCell>
											<TableCell className="text-center tabular-nums">{provider.total_models.toLocaleString()}</TableCell>
											<TableCell className="text-center tabular-nums">{provider.free_models ? provider.free_models.toLocaleString() : "—"}</TableCell>
											<TableCell><div className="flex items-center gap-1.5">{supported.map(({ value, icon: Icon, label }) => <ProviderModalityBadge key={value} label={label} modality={value} icon={Icon} inputCount={provider.modality_support[value]?.input ?? 0} outputCount={provider.modality_support[value]?.output ?? 0} />)}</div></TableCell>
											<TableCell className="text-center font-medium tabular-nums">{formatTokens(Number(provider.total_daily_tokens))}</TableCell>
											<TableCell className="text-center font-medium tabular-nums">{formatTokens(Number(provider.total_monthly_tokens))}</TableCell>
											<TableCell className={cn("whitespace-nowrap", !provider.data_policy_tier && "text-muted-foreground")}>{policyLabel(provider.data_policy_tier, DATA_POLICY_LABELS)}</TableCell>
			<TableCell className="whitespace-nowrap">{policyLabel(String(provider.zero_data_retention), ZDR_LABELS)}</TableCell>
											<TableCell>{provider.privacy_policy_url ? <a href={provider.privacy_policy_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline hover:underline-offset-4">Privacy <ExternalLink className="size-3 text-muted-foreground" /></a> : <span className="text-muted-foreground">—</span>}</TableCell>
											<TableCell>{provider.terms_of_service_url ? <a href={provider.terms_of_service_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline hover:underline-offset-4">Terms <ExternalLink className="size-3 text-muted-foreground" /></a> : <span className="text-muted-foreground">—</span>}</TableCell>
										</TableRow>;
										})}</TableBody>
									</Table>
								</div>
							</div>
						) : filteredProviders.length ? <div className="grid grid-cols-1 gap-px md:grid-cols-2 2xl:grid-cols-3">
							{filteredProviders.map((provider) => <APIProviderCard key={provider.api_provider_id} api_provider={provider} />)}
							{Array.from({ length: mdFillers }).map((_, index) => <div key={`md-filler-${index}`} aria-hidden className="hidden bg-background md:block 2xl:hidden" />)}
							{Array.from({ length: twoXlFillers }).map((_, index) => <div key={`2xl-filler-${index}`} aria-hidden className="hidden bg-background 2xl:block" />)}
						</div> : <div className="flex min-h-64 flex-col items-center justify-center gap-2 bg-background px-4 text-center"><Search className="size-5 text-muted-foreground" /><p className="text-sm font-medium">No providers found</p><p className="text-xs text-muted-foreground">Try changing your search or filters.</p>{activeFilterCount ? <Button variant="outline" size="sm" className="mt-2 rounded-md" onClick={resetFilters}>Reset Filters</Button> : null}</div>}
					</div>
				</div>
			</section>

			<Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
				<SheetContent side="right" className="w-[86vw] max-w-sm gap-0 p-0 lg:hidden">
					<SheetHeader className="border-b border-border/70 px-4 py-3 text-left"><div className="flex items-start justify-between gap-3 pr-8"><div><SheetTitle>Filters</SheetTitle><SheetDescription>Refine the providers list.</SheetDescription></div>{activeFilterCount ? <Button variant="ghost" size="sm" className="h-8 px-2" onClick={resetFilters}>Reset</Button> : null}</div></SheetHeader>
					<ScrollArea className="min-h-0 flex-1 overscroll-y-contain px-4 py-2"><div className="space-y-4 pb-6">{filtersContent}</div></ScrollArea>
				</SheetContent>
			</Sheet>
		</div>
	);
}
