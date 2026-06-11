"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Area,
	AreaChart,
	Line,
	LineChart,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	Blocks,
	BarChart3,
	ChevronDown,
	ChevronUp,
	ChevronsUpDown,
	ArrowUpRight,
	Check,
	ChevronRight,
	CircleDot,
	CircleDollarSign,
	Filter,
	Hash,
	KeyRound,
	LineChart as LineChartIcon,
	ListFilter,
	Plus,
	Search,
	Settings2,
	Coins,
	Table2,
	UserRound,
	Workflow,
	X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	ChartContainer,
	ChartTooltipContent,
	type ChartConfig,
} from "@/components/ui/chart";
import {
	TooltipContent as UiTooltipContent,
	Tooltip as UiTooltip,
	TooltipTrigger as UiTooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { GuardrailEnforcementMetricsResult } from "@/lib/gateway/usage/guardrailEnforcementMetrics";
import type { UsageRangePreset } from "@/lib/gateway/usage/timeRange";
import UsageLogsToolbar from "@/components/(gateway)/usage/UsageLogsToolbar";
import { Logo } from "@/components/Logo";
import type {
	ObservabilityBreakdownItem,
	ObservabilityData,
	ObservabilityExploreRow,
	ObservabilityKpi,
	ObservabilityRankedItem,
	ObservabilitySeriesPoint,
	ObservabilityTab,
	ObservabilityTrendMetricCharts,
	ObservabilityTimeSeriesChart,
} from "./types";

const CHART_COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#dc2626"];

type ObservabilityFilterField = "workspace" | "key" | "model" | "user";
type ObservabilityFilterOperator = "include" | "exclude";

type ObservabilityFilter = {
	id: string;
	field: ObservabilityFilterField;
	operator: ObservabilityFilterOperator;
	values: ObservabilityFilterOption[];
};

type ObservabilityFilterOption = {
	value: string;
	label: string;
	logoId?: string | null;
};

const FILTER_FIELDS: Array<{
	id: ObservabilityFilterField;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
}> = [
	{ id: "workspace", label: "Workspace", icon: Workflow },
	{ id: "key", label: "Key", icon: KeyRound },
	{ id: "model", label: "Model", icon: Blocks },
	{ id: "user", label: "User", icon: UserRound },
];

function formatNumber(value: number): string {
	return new Intl.NumberFormat("en", {
		notation: value >= 100000 ? "compact" : "standard",
		maximumFractionDigits: value >= 100000 ? 1 : 0,
	}).format(value);
}

function formatCurrency(value: number): string {
	return new Intl.NumberFormat("en", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: value >= 100 ? 0 : 2,
	}).format(value);
}

function formatPercent(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

function formatKpiValue(kpi: ObservabilityKpi, value = kpi.value): string {
	if (kpi.format === "currency") return formatCurrency(value);
	if (kpi.format === "percent") return formatPercent(value);
	return formatNumber(value);
}

function formatDelta(value: number | null): string {
	if (value === null) return "No previous data";
	return `${Math.abs(value).toFixed(1)}% vs previous`;
}

function formatCompactDelta(value: number | null): string {
	if (value === null) return "No prev data";
	return `${Math.abs(value).toFixed(1)}%`;
}

function uniqueOptions(values: string[], limit = 80): ObservabilityFilterOption[] {
	return Array.from(new Set(values.filter(Boolean)))
		.sort((a, b) => a.localeCompare(b))
		.slice(0, limit)
		.map((value) => ({ value, label: value }));
}

function buildFilterOptions(data: ObservabilityData): Record<
	ObservabilityFilterField,
	ObservabilityFilterOption[]
> {
	return {
		workspace: [{ value: "current", label: "Current workspace" }],
		key: uniqueOptions(data.exploreRows.map((row) => row.apiKey)),
		model:
			data.filterOptions?.models?.length
				? data.filterOptions.models
				: uniqueOptions(data.exploreRows.map((row) => row.model)),
		user: [],
	};
}

function fieldLabel(field: ObservabilityFilterField): string {
	return FILTER_FIELDS.find((item) => item.id === field)?.label ?? field;
}

function filterValueLabel(filter: ObservabilityFilter): string {
	if (filter.values.length === 0) return "Select values";
	if (filter.values.length === 1) return filter.values[0]?.label ?? "1 value";
	return `${filter.values.length} ${filterValueNoun(filter.field, filter.values.length)}`;
}

function filterValueNoun(field: ObservabilityFilterField, count: number): string {
	const plural = count !== 1;
	if (field === "workspace") return plural ? "workspaces" : "workspace";
	if (field === "key") return plural ? "keys" : "key";
	if (field === "model") return plural ? "models" : "model";
	return plural ? "users" : "user";
}

function operatorLabel(
	operator: ObservabilityFilterOperator,
	valueCount = 2,
): string {
	if (valueCount <= 1) return operator === "include" ? "is" : "is not";
	return operator === "include" ? "is any of" : "is none of";
}

function ObservabilityFilters({
	data,
}: {
	data: ObservabilityData;
}) {
	const options = React.useMemo(() => buildFilterOptions(data), [data]);
	const [filters, setFilters] = React.useState<ObservabilityFilter[]>([]);
	const [open, setOpen] = React.useState(false);
	const [step, setStep] = React.useState<"field" | "value">("field");
	const [field, setField] = React.useState<ObservabilityFilterField>("model");
	const [query, setQuery] = React.useState("");
	const addFilter = (option: ObservabilityFilterOption) => {
		setFilters((current) => [
			...current,
			{
				id: `${field}-include-${option.value}-${Date.now()}`,
				field,
				operator: "include",
				values: [option],
			},
		]);
		setQuery("");
		setStep("field");
		setOpen(false);
	};
	const addTextFilter = (targetField = field) => {
		const value = query.trim();
		if (!value) return;
		setFilters((current) => [
			...current,
			{
				id: `${targetField}-include-${value}-${Date.now()}`,
				field: targetField,
				operator: "include",
				values: [{ value, label: value }],
			},
		]);
		setQuery("");
		setStep("field");
		setOpen(false);
	};

	return (
		<div className="min-w-0 flex-1 space-y-2">
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<ButtonGroup>
					<Popover
						open={open}
						onOpenChange={(nextOpen) => {
							setOpen(nextOpen);
							if (!nextOpen) {
								setStep("field");
								setQuery("");
							}
						}}
					>
						<PopoverTrigger asChild>
							<Button variant="outline" size="sm" className="h-9 gap-2">
								<Filter className="h-4 w-4" />
								Filter
								{filters.length > 0 ? (
									<Badge
										variant="secondary"
										className="ml-1 h-5 rounded-sm px-1.5"
									>
										{filters.length}
									</Badge>
								) : null}
							</Button>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-[250px] p-0">
							{step === "field" ? (
								<FilterFieldMenu
									query={query}
									onQueryChange={setQuery}
									onSelect={(nextField) => {
										setField(nextField);
										setQuery("");
										setStep("value");
									}}
								/>
							) : (
						<FilterValueMenu
							field={field}
							query={query}
							options={options[field]}
							selectedValues={[]}
							onQueryChange={setQuery}
									onBack={() => {
										setStep("field");
										setQuery("");
									}}
									onSelect={addFilter}
									onAddText={() => addTextFilter(field)}
								/>
							)}
						</PopoverContent>
					</Popover>
					{filters.length > 0 ? (
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="h-9 w-9"
							aria-label="Clear filters"
							onClick={() => setFilters([])}
						>
							<X className="h-4 w-4" />
						</Button>
					) : null}
				</ButtonGroup>
			</div>
			{filters.length > 0 ? (
				<div className="flex min-w-0 flex-wrap items-center gap-2 pl-0">
					{filters.map((filter) => (
						<AppliedFilterChip
							key={filter.id}
							filter={filter}
							options={options}
							onUpdate={(nextFilter) =>
								setFilters((current) =>
									current.map((item) =>
										item.id === filter.id ? { ...item, ...nextFilter } : item,
									),
								)
							}
							onRemove={() =>
								setFilters((current) =>
									current.filter((item) => item.id !== filter.id),
								)
							}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}

function FilterSearchBox({
	value,
	placeholder = "Search...",
	onChange,
	onEnter,
}: {
	value: string;
	placeholder?: string;
	onChange: (value: string) => void;
	onEnter?: () => void;
}) {
	return (
		<div className="relative border-b">
			<Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
			<Input
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") onEnter?.();
				}}
				placeholder={placeholder}
				className="h-9 rounded-none border-0 pl-9 shadow-none focus-visible:ring-0"
			/>
		</div>
	);
}

function FilterFieldMenu({
	query,
	onQueryChange,
	onSelect,
}: {
	query: string;
	onQueryChange: (value: string) => void;
	onSelect: (field: ObservabilityFilterField) => void;
}) {
	const normalized = query.trim().toLowerCase();
	const fields = FILTER_FIELDS.filter((item) =>
		item.label.toLowerCase().includes(normalized),
	);
	return (
		<div>
			<FilterSearchBox value={query} onChange={onQueryChange} />
			<div className="p-1">
				{fields.map((item) => {
					const Icon = item.icon;
					return (
						<button
							key={item.id}
							type="button"
							className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-muted"
							onClick={() => onSelect(item.id)}
						>
							<span className="flex min-w-0 items-center gap-2">
								<Icon className="h-4 w-4 text-muted-foreground" />
								<span className="truncate">{item.label}</span>
							</span>
							<ChevronRight className="h-4 w-4 text-muted-foreground" />
						</button>
					);
				})}
			</div>
		</div>
	);
}

function FilterValueMenu({
	field,
	query,
	options,
	selectedValues = [],
	onQueryChange,
	onBack,
	onSelect,
	onAddText,
}: {
	field: ObservabilityFilterField;
	query: string;
	options: ObservabilityFilterOption[];
	selectedValues?: ObservabilityFilterOption[];
	onQueryChange: (value: string) => void;
	onBack?: () => void;
	onSelect: (option: ObservabilityFilterOption) => void;
	onAddText: () => void;
}) {
	const normalized = query.trim().toLowerCase();
	const visibleOptions = options
		.filter((option) => option.label.toLowerCase().includes(normalized))
		.slice(0, 40);
	const selectedValueSet = new Set(selectedValues.map((option) => option.value));
	const FieldIcon =
		FILTER_FIELDS.find((item) => item.id === field)?.icon ?? Filter;
	return (
		<div>
			{onBack ? (
				<button
					type="button"
					className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm font-medium hover:bg-muted"
					onClick={onBack}
				>
					<ChevronRight className="h-4 w-4 rotate-180 text-muted-foreground" />
					<FieldIcon className="h-4 w-4 text-muted-foreground" />
					{fieldLabel(field)}
				</button>
			) : null}
			<FilterSearchBox
				value={query}
				onChange={onQueryChange}
				onEnter={onAddText}
				placeholder={
					field === "user"
						? "Type user id or email..."
						: `Search ${fieldLabel(field).toLowerCase()}...`
				}
			/>
			<div className="max-h-72 overflow-y-auto p-1">
				{visibleOptions.map((option) => (
					<button
						key={option.value}
						type="button"
						className={cn(
							"flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
							selectedValueSet.has(option.value) ? "bg-muted" : null,
						)}
						onClick={() => onSelect(option)}
					>
						<span className="flex min-w-0 items-center gap-2">
							{field === "model" && option.logoId ? (
								<span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-background">
									<Logo
										id={option.logoId}
										alt={option.label}
										width={16}
										height={16}
										className="h-4 w-4 object-contain"
										fallbackToColor
									/>
								</span>
							) : null}
							<span className="min-w-0 truncate">{option.label}</span>
						</span>
						{selectedValueSet.has(option.value) ? (
							<Check className="h-4 w-4 text-foreground" />
						) : null}
					</button>
				))}
				{visibleOptions.length === 0 ? (
					<button
						type="button"
						className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
						onClick={onAddText}
					>
						<span className="min-w-0 truncate">
							{query.trim()
								? `Add "${query.trim()}"`
								: `No ${fieldLabel(field).toLowerCase()} options`}
						</span>
						{query.trim() ? (
							<Plus className="h-3.5 w-3.5 text-muted-foreground" />
						) : null}
					</button>
				) : null}
			</div>
		</div>
	);
}

function AppliedFilterChip({
	filter,
	options,
	onUpdate,
	onRemove,
}: {
	filter: ObservabilityFilter;
	options: Record<ObservabilityFilterField, ObservabilityFilterOption[]>;
	onUpdate: (filter: Partial<ObservabilityFilter>) => void;
	onRemove: () => void;
}) {
	const [valueOpen, setValueOpen] = React.useState(false);
	const [valueQuery, setValueQuery] = React.useState("");
	const FieldIcon =
		FILTER_FIELDS.find((item) => item.id === filter.field)?.icon ?? Filter;
	return (
		<div className="inline-flex h-9 max-w-full items-center overflow-hidden rounded-md border bg-background text-sm">
			<div className="flex h-full items-center gap-1.5 border-r px-2 font-medium">
				<FieldIcon className="h-3.5 w-3.5 text-muted-foreground" />
				{fieldLabel(filter.field)}
			</div>
			<button
				type="button"
				className="h-full border-r px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
				onClick={() =>
					onUpdate({
						operator: filter.operator === "include" ? "exclude" : "include",
					})
				}
			>
				{operatorLabel(filter.operator, filter.values.length)}
			</button>
			<Popover open={valueOpen} onOpenChange={setValueOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="h-full max-w-[220px] truncate border-r px-2 font-medium hover:bg-muted"
					>
						{filterValueLabel(filter)}
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-[280px] p-0">
					<FilterValueMenu
						field={filter.field}
						query={valueQuery}
						options={options[filter.field]}
						selectedValues={filter.values}
						onQueryChange={setValueQuery}
						onSelect={(option) => {
							const selected = filter.values.some(
								(item) => item.value === option.value,
							);
							onUpdate({
								values: selected
									? filter.values.filter((item) => item.value !== option.value)
									: [...filter.values, option],
							});
						}}
						onAddText={() => {
							const value = valueQuery.trim();
							if (!value) return;
							const nextOption = { value, label: value };
							onUpdate({
								values: filter.values.some((item) => item.value === value)
									? filter.values
									: [...filter.values, nextOption],
							});
							setValueQuery("");
						}}
					/>
				</PopoverContent>
			</Popover>
			<button
				type="button"
				className="flex h-full w-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
				onClick={onRemove}
			>
				<X className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}

function Sparkline({
	data,
	height = 42,
	formatValue = formatNumber,
	onHoverPoint,
}: {
	data: ObservabilitySeriesPoint[];
	height?: number;
	formatValue?: (value: number) => string;
	onHoverPoint?: (point: ObservabilitySeriesPoint | null) => void;
}) {
	const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
	const width = 92;
	const values = data.map((point) => point.value);
	const min = Math.min(...values, 0);
	const max = Math.max(...values, 1);
	const range = max - min || 1;
	const coordinates = data.map((point, index) => {
		const x = data.length <= 1 ? width : (index / (data.length - 1)) * width;
		const y = height - ((point.value - min) / range) * (height - 6) - 3;
		return { point, x, y };
	});
	const points = coordinates
		.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
		.join(" ");
	const latest = data[data.length - 1];
	const hovered =
		hoveredIndex === null ? null : coordinates[hoveredIndex] ?? null;
	const titlePoint = hovered?.point ?? latest;
	const handlePointerMove = React.useCallback(
		(event: React.PointerEvent<SVGSVGElement>) => {
			if (data.length === 0) return;
			const rect = event.currentTarget.getBoundingClientRect();
			const relativeX =
				rect.width > 0
					? ((event.clientX - rect.left) / rect.width) * width
					: width;
			const index =
				data.length <= 1
					? 0
					: Math.max(
							0,
							Math.min(
								data.length - 1,
								Math.round((relativeX / width) * (data.length - 1)),
							),
						);
			setHoveredIndex(index);
			onHoverPoint?.(data[index] ?? null);
		},
		[data, onHoverPoint],
	);
	const handlePointerLeave = React.useCallback(() => {
		setHoveredIndex(null);
		onHoverPoint?.(null);
	}, [onHoverPoint]);

	if (data.length === 0) {
		return (
			<svg
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label="No trend data"
				className="h-full min-h-[34px] w-full min-w-[72px] overflow-visible text-blue-500"
			/>
		);
	}

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label={
				titlePoint
					? `${titlePoint.label}: ${formatValue(titlePoint.value)}`
					: "No trend data"
			}
			className="h-full min-h-[34px] w-full min-w-[72px] overflow-visible text-blue-500"
			onPointerMove={handlePointerMove}
			onPointerLeave={handlePointerLeave}
		>
			<title>
				{titlePoint
					? `${titlePoint.label}: ${formatValue(titlePoint.value)}`
					: "No trend data"}
			</title>
			<polyline
				points={points}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{hovered ? (
				<circle
					cx={hovered.x}
					cy={hovered.y}
					r={3.1}
					fill="hsl(var(--background))"
					stroke="currentColor"
					strokeWidth={2}
					pointerEvents="none"
				/>
			) : null}
			<rect width={width} height={height} fill="transparent" />
		</svg>
	);
}

function KpiMetric({
	kpi,
	index,
	total,
}: {
	kpi: ObservabilityKpi;
	index: number;
	total: number;
}) {
	const [hoveredPoint, setHoveredPoint] =
		React.useState<ObservabilitySeriesPoint | null>(null);
	const positive = (kpi.deltaPercent ?? 0) >= 0;
	const DeltaIcon = positive ? ChevronUp : ChevronDown;
	const displayValue = hoveredPoint?.value ?? kpi.value;
	const showTwoColumnHorizontalSeparator = total > 1;
	const showDesktopVerticalSeparator = index < total - 1;
	return (
		<Link
			href="/settings/usage/explore"
			className="group relative block min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			{total > 0 ? (
				<span className="pointer-events-none absolute inset-x-4 bottom-0 h-0.5 bg-border/90 sm:hidden" />
			) : null}
			{showTwoColumnHorizontalSeparator ? (
				<span className="pointer-events-none absolute inset-x-4 bottom-0 hidden h-0.5 bg-border/90 sm:block lg:hidden" />
			) : null}
			{showDesktopVerticalSeparator ? (
				<span className="pointer-events-none absolute right-0 top-4 hidden h-[calc(100%-2rem)] w-0.5 bg-border/90 lg:block" />
			) : null}
			<div className="grid min-h-[96px] grid-cols-[1fr_92px] items-center gap-4 px-4 py-3 transition-colors group-hover:bg-muted/20">
				<div className="min-w-0">
					<CardTitle className="text-xs font-medium text-muted-foreground">
						{kpi.label}
					</CardTitle>
					<div className="mt-1 text-2xl font-semibold tracking-tight">
						{formatKpiValue(kpi, displayValue)}
					</div>
					<div
						className={cn(
							"mt-2 inline-flex items-center gap-1 text-xs font-medium",
							hoveredPoint
								? "text-muted-foreground"
								: positive
									? "text-emerald-600"
									: "text-rose-600",
						)}
					>
						{hoveredPoint ? (
							<span>{hoveredPoint.label}</span>
						) : (
							<UiTooltip delayDuration={750}>
								<UiTooltipTrigger asChild>
									<span className="inline-flex items-center gap-1">
										{kpi.deltaPercent !== null ? (
											<DeltaIcon className="h-3 w-3" />
										) : null}
										<span>{formatCompactDelta(kpi.deltaPercent)}</span>
									</span>
								</UiTooltipTrigger>
								<UiTooltipContent side="bottom" sideOffset={6}>
									Compared with previous period
								</UiTooltipContent>
							</UiTooltip>
						)}
					</div>
				</div>
				<div className="min-w-0 text-right">
					<Sparkline
						data={kpi.sparkline}
						height={38}
						formatValue={(value) => formatKpiValue(kpi, value)}
						onHoverPoint={setHoveredPoint}
					/>
				</div>
			</div>
		</Link>
	);
}

function ExploreButton() {
	return (
		<Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
			<Link href="/settings/usage/explore">
				Explore
				<ArrowUpRight className="h-3.5 w-3.5" />
			</Link>
		</Button>
	);
}

function ChartCard({
	title,
	subtitle,
	children,
	className,
}: {
	title: string;
	subtitle?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<Card className={cn("rounded-lg", className)}>
			<CardHeader className="flex-row items-start justify-between gap-3 pb-2">
				<div className="min-w-0">
					<CardTitle className="text-base">{title}</CardTitle>
					{subtitle ? (
						<p className="text-sm text-muted-foreground">{subtitle}</p>
					) : null}
				</div>
				<ExploreButton />
			</CardHeader>
			<CardContent>
				{children}
			</CardContent>
		</Card>
	);
}

function BarBreakdownChart({
	data,
	label,
	height = 300,
}: {
	data: ObservabilityBreakdownItem[];
	label: string;
	height?: number;
}) {
	const chartConfig = {
		value: { label, color: CHART_COLORS[0] },
	} satisfies ChartConfig;
	return (
		<ChartContainer
			config={chartConfig}
			className="w-full min-w-0 [aspect-ratio:auto]"
			style={{ width: "100%", height, minHeight: height }}
		>
			<BarChart data={data} margin={{ top: 12, right: 12, bottom: 48, left: 0 }}>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="label"
					angle={-28}
					textAnchor="end"
					interval={0}
					height={64}
					tickLine={false}
					axisLine={false}
				/>
				<YAxis tickLine={false} axisLine={false} width={44} />
				<Tooltip content={<ChartTooltipContent />} />
				<Bar
					dataKey="value"
					fill="var(--color-value)"
					radius={[4, 4, 0, 0]}
					isAnimationActive={false}
				/>
			</BarChart>
		</ChartContainer>
	);
}

function DonutBreakdownChart({
	data,
	height = 300,
}: {
	data: ObservabilityBreakdownItem[];
	height?: number;
}) {
	return <BarBreakdownChart data={data} label="value" height={height} />;
}

function timeSeriesChartConfig(data: ObservabilityTimeSeriesChart) {
	return Object.fromEntries(
		data.series.map((item, index) => [
			item.id,
			{
				label: item.label,
				color: item.color ?? CHART_COLORS[index % CHART_COLORS.length],
			},
		]),
	) satisfies ChartConfig;
}

function timeSeriesYAxisDomain(max: number) {
	return [0, max > 0 ? max : 1];
}

type TimeSeriesValueKind = "number" | "currency";

function formatAxisValue(value: number, kind: TimeSeriesValueKind) {
	if (kind === "currency") {
		if (value > 0 && value < 0.01) return `$${value.toFixed(3)}`;
		return formatCurrency(value);
	}
	return formatNumber(value);
}

function timeSeriesXAxisTicks(data: ObservabilityTimeSeriesChart) {
	const labels = data.data.map((point) => String(point.label));
	if (labels.length <= 7) return labels;
	const step = Math.ceil((labels.length - 1) / 6);
	const ticks = labels.filter((_, index) => index % step === 0);
	const last = labels[labels.length - 1];
	if (last && ticks[ticks.length - 1] !== last) ticks.push(last);
	return ticks;
}

function topVisibleSeriesId(
	point: Record<string, string | number>,
	series: ObservabilityTimeSeriesChart["series"],
) {
	for (let index = series.length - 1; index >= 0; index -= 1) {
		const item = series[index];
		if (item && Number(point[item.id] ?? 0) > 0) return item.id;
	}
	return null;
}

function TimeSeriesLegend({
	data,
	activeSeries,
	onActiveSeriesChange,
}: {
	data: ObservabilityTimeSeriesChart;
	activeSeries: string | null;
	onActiveSeriesChange: (seriesId: string | null) => void;
}) {
	return (
		<div className="flex flex-wrap gap-x-4 gap-y-2">
			{data.series.map((item, index) => (
				<button
					key={item.id}
					type="button"
					className={cn(
						"flex min-w-0 items-center gap-2 rounded-sm outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring",
						activeSeries && activeSeries !== item.id ? "opacity-45" : "opacity-100",
					)}
					onMouseEnter={() => onActiveSeriesChange(item.id)}
					onMouseLeave={() => onActiveSeriesChange(null)}
					onFocus={() => onActiveSeriesChange(item.id)}
					onBlur={() => onActiveSeriesChange(null)}
				>
					<span
						className="h-2.5 w-2.5 shrink-0 rounded-sm"
						style={{
							backgroundColor:
								item.color ?? CHART_COLORS[index % CHART_COLORS.length],
						}}
					/>
					<span className="truncate text-xs text-muted-foreground">
						{item.label}
					</span>
				</button>
			))}
		</div>
	);
}

function TimeSeriesTooltip({
	active,
	label,
	payload,
	activeSeries,
	showPercent = false,
}: {
	active?: boolean;
	label?: string | number;
	payload?: readonly any[];
	activeSeries: string | null;
	showPercent?: boolean;
}) {
	if (!active || !payload?.length) return null;
	const visiblePayload = [...payload]
		.sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0));
	const total = visiblePayload.reduce(
		(sum, item) => sum + Number(item?.value ?? 0),
		0,
	);
	return (
		<div className="min-w-44 rounded-md border bg-popover p-2.5 text-popover-foreground shadow-md">
			<div className="mb-2 flex items-center justify-between gap-4 text-xs font-medium">
				<span>{label}</span>
				<span className="font-mono text-muted-foreground">
					{total > 0 ? formatNumber(total) : "No activity"}
				</span>
			</div>
			<div className="space-y-1.5">
				{visiblePayload.map((item) => {
					const focused = activeSeries === item.dataKey;
					const value = Number(item.value ?? 0);
					const percent = total > 0 ? value / total : 0;
					return (
						<div
							key={String(item.dataKey)}
							className={cn(
								"flex items-center justify-between gap-4 rounded-md px-1.5 py-0.5 text-xs",
								focused ? "font-semibold text-foreground" : "text-muted-foreground",
								focused ? "bg-zinc-200/70 dark:bg-zinc-800/70" : null,
							)}
						>
							<span className="flex min-w-0 items-center gap-2">
								<span
									className="h-2.5 w-2.5 shrink-0 rounded-sm"
									style={{ backgroundColor: item.color }}
								/>
								<span className="truncate">{item.name}</span>
							</span>
							<span className="font-mono text-foreground">
								{formatNumber(value)}
								{showPercent ? (
									<span className="ml-1 text-muted-foreground">
										{formatPercent(percent)}
									</span>
								) : null}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function StackedTimeSeriesBarChart({
	data,
	height = 300,
	showTooltipPercent = false,
	valueKind = "number",
}: {
	data: ObservabilityTimeSeriesChart;
	height?: number;
	showTooltipPercent?: boolean;
	valueKind?: TimeSeriesValueKind;
}) {
	const chartConfig = timeSeriesChartConfig(data);
	const [activeSeries, setActiveSeries] = React.useState<string | null>(null);
	const xAxisTicks = timeSeriesXAxisTicks(data);
	const maxDailyTotal = Math.max(
		0,
		...data.data.map((point) =>
			data.series.reduce(
				(total, series) => total + Number(point[series.id] ?? 0),
				0,
			),
		),
	);
	return (
		<div className="space-y-3">
			<ChartContainer
				config={chartConfig}
				className="w-full min-w-0 [aspect-ratio:auto]"
				style={{ width: "100%", height, minHeight: height }}
			>
				<BarChart
					data={data.data}
					margin={{ top: 12, right: 12, bottom: 8, left: 0 }}
				>
					<CartesianGrid vertical={false} />
					<XAxis
						dataKey="label"
						tickLine={false}
						axisLine={false}
						ticks={xAxisTicks}
						minTickGap={18}
						interval="preserveStartEnd"
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={56}
						tickCount={4}
						domain={timeSeriesYAxisDomain(maxDailyTotal)}
						tickFormatter={(value) =>
							formatAxisValue(Number(value), valueKind)
						}
					/>
					<Tooltip
						cursor={{ fill: "hsl(var(--muted))", opacity: 0.32 }}
						content={(props) => (
							<TimeSeriesTooltip
								{...props}
								activeSeries={activeSeries}
								showPercent={showTooltipPercent}
							/>
						)}
					/>
					{data.series.map((item) => (
						<Bar
							key={item.id}
							dataKey={item.id}
							name={item.label}
							stackId="total"
							fill={`var(--color-${item.id})`}
							fillOpacity={
								activeSeries && activeSeries !== item.id ? 0.28 : 1
							}
							isAnimationActive={false}
						>
							{data.data.map((point) => (
								<Cell
									key={`${item.id}-${String(point.bucket ?? point.label)}`}
									radius={
										topVisibleSeriesId(point, data.series) === item.id
											? 4
											: 0
									}
								/>
							))}
						</Bar>
					))}
				</BarChart>
			</ChartContainer>
			<TimeSeriesLegend
				data={data}
				activeSeries={activeSeries}
				onActiveSeriesChange={setActiveSeries}
			/>
		</div>
	);
}

function StackedTimeSeriesAreaChart({
	data,
	height = 300,
	valueKind = "number",
}: {
	data: ObservabilityTimeSeriesChart;
	height?: number;
	valueKind?: TimeSeriesValueKind;
}) {
	const chartConfig = timeSeriesChartConfig(data);
	const [activeSeries, setActiveSeries] = React.useState<string | null>(null);
	const xAxisTicks = timeSeriesXAxisTicks(data);
	const maxDailyTotal = Math.max(
		0,
		...data.data.map((point) =>
			data.series.reduce(
				(total, series) => total + Number(point[series.id] ?? 0),
				0,
			),
		),
	);
	return (
		<div className="space-y-3">
			<ChartContainer
				config={chartConfig}
				className="w-full min-w-0 [aspect-ratio:auto]"
				style={{ width: "100%", height, minHeight: height }}
			>
				<AreaChart
					data={data.data}
					margin={{ top: 12, right: 12, bottom: 8, left: 0 }}
				>
					<CartesianGrid vertical={false} />
					<XAxis
						dataKey="label"
						tickLine={false}
						axisLine={false}
						ticks={xAxisTicks}
						minTickGap={18}
						interval="preserveStartEnd"
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={56}
						tickCount={4}
						domain={timeSeriesYAxisDomain(maxDailyTotal)}
						tickFormatter={(value) =>
							formatAxisValue(Number(value), valueKind)
						}
					/>
					<Tooltip
						cursor={{ stroke: "hsl(var(--muted-foreground))", opacity: 0.28 }}
						content={(props) => (
							<TimeSeriesTooltip {...props} activeSeries={activeSeries} />
						)}
					/>
					{data.series.map((item) => (
						<Area
							key={item.id}
							type="monotone"
							dataKey={item.id}
							name={item.label}
							stackId="total"
							stroke={`var(--color-${item.id})`}
							fill={`var(--color-${item.id})`}
							fillOpacity={
								activeSeries && activeSeries !== item.id ? 0.07 : 0.2
							}
							strokeOpacity={
								activeSeries && activeSeries !== item.id ? 0.35 : 1
							}
							strokeWidth={activeSeries === item.id ? 3 : 2}
							isAnimationActive={false}
						/>
					))}
				</AreaChart>
			</ChartContainer>
			<TimeSeriesLegend
				data={data}
				activeSeries={activeSeries}
				onActiveSeriesChange={setActiveSeries}
			/>
		</div>
	);
}

type TrendMetric = "spend" | "requests" | "tokens";
type TrendChartType = "bar" | "line" | "dot";

const TREND_METRICS: Array<{
	id: TrendMetric;
	label: string;
	valueKind: TimeSeriesValueKind;
	icon: React.ComponentType<{ className?: string }>;
}> = [
	{
		id: "spend",
		label: "Spend",
		valueKind: "currency",
		icon: CircleDollarSign,
	},
	{ id: "requests", label: "Requests", valueKind: "number", icon: Hash },
	{ id: "tokens", label: "Tokens", valueKind: "number", icon: Coins },
];

function trendMetricLabel(metric: TrendMetric) {
	return TREND_METRICS.find((item) => item.id === metric)?.label ?? metric;
}

function trendMetricValueKind(metric: TrendMetric): TimeSeriesValueKind {
	return TREND_METRICS.find((item) => item.id === metric)?.valueKind ?? "number";
}

function prepareTrendChartData(
	data: ObservabilityTimeSeriesChart,
	options: { showOther: boolean; cumulative: boolean },
): ObservabilityTimeSeriesChart {
	const series = options.showOther
		? data.series
		: data.series.filter((item) => item.id !== "other");
	if (!options.cumulative) {
		return {
			series,
			data: data.data.map((point) => {
				const next: Record<string, string | number> = {
					bucket: point.bucket ?? "",
					label: point.label ?? "",
				};
				for (const item of series) next[item.id] = Number(point[item.id] ?? 0);
				return next;
			}),
		};
	}
	const running = new Map(series.map((item) => [item.id, 0]));
	return {
		series,
		data: data.data.map((point) => {
			const next: Record<string, string | number> = {
				bucket: point.bucket ?? "",
				label: point.label ?? "",
			};
			for (const item of series) {
				const value = (running.get(item.id) ?? 0) + Number(point[item.id] ?? 0);
				running.set(item.id, value);
				next[item.id] = value;
			}
			return next;
		}),
	};
}

function MultiSeriesLineChart({
	data,
	height = 300,
	valueKind = "number",
	dotsOnly = false,
}: {
	data: ObservabilityTimeSeriesChart;
	height?: number;
	valueKind?: TimeSeriesValueKind;
	dotsOnly?: boolean;
}) {
	const chartConfig = timeSeriesChartConfig(data);
	const [activeSeries, setActiveSeries] = React.useState<string | null>(null);
	const xAxisTicks = timeSeriesXAxisTicks(data);
	const maxValue = Math.max(
		0,
		...data.data.flatMap((point) =>
			data.series.map((series) => Number(point[series.id] ?? 0)),
		),
	);
	return (
		<div className="space-y-3">
			<ChartContainer
				config={chartConfig}
				className="w-full min-w-0 [aspect-ratio:auto]"
				style={{ width: "100%", height, minHeight: height }}
			>
				<LineChart
					data={data.data}
					margin={{ top: 12, right: 12, bottom: 8, left: 0 }}
				>
					<CartesianGrid vertical={false} />
					<XAxis
						dataKey="label"
						tickLine={false}
						axisLine={false}
						ticks={xAxisTicks}
						minTickGap={18}
						interval="preserveStartEnd"
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={56}
						tickCount={4}
						domain={timeSeriesYAxisDomain(maxValue)}
						tickFormatter={(value) =>
							formatAxisValue(Number(value), valueKind)
						}
					/>
					<Tooltip
						cursor={{ stroke: "hsl(var(--muted-foreground))", opacity: 0.28 }}
						content={(props) => (
							<TimeSeriesTooltip {...props} activeSeries={activeSeries} />
						)}
					/>
					{data.series.map((item) => (
						<Line
							key={item.id}
							type="monotone"
							dataKey={item.id}
							name={item.label}
							stroke={`var(--color-${item.id})`}
							strokeWidth={dotsOnly ? 0 : activeSeries === item.id ? 3 : 2}
							strokeOpacity={
								activeSeries && activeSeries !== item.id ? 0.28 : 1
							}
							dot={
								dotsOnly
									? {
											r: activeSeries === item.id ? 4 : 3,
											fill: `var(--color-${item.id})`,
											strokeWidth: 0,
										}
									: false
							}
							activeDot={{
								r: 4,
								fill: `var(--color-${item.id})`,
								strokeWidth: 0,
							}}
							isAnimationActive={false}
						/>
					))}
				</LineChart>
			</ChartContainer>
			<TimeSeriesLegend
				data={data}
				activeSeries={activeSeries}
				onActiveSeriesChange={setActiveSeries}
			/>
		</div>
	);
}

function LineTrendChart({
	data,
	label,
	height = 300,
}: {
	data: Array<{ label: string; value: number }>;
	label: string;
	height?: number;
}) {
	const chartConfig = {
		value: { label, color: CHART_COLORS[0] },
	} satisfies ChartConfig;
	const maxValue = Math.max(0, ...data.map((point) => point.value));
	const xAxisTicks =
		data.length <= 7
			? data.map((point) => point.label)
			: data
					.filter((_, index) => index % Math.ceil((data.length - 1) / 6) === 0)
					.map((point) => point.label);
	const lastLabel = data[data.length - 1]?.label;
	if (lastLabel && xAxisTicks[xAxisTicks.length - 1] !== lastLabel) {
		xAxisTicks.push(lastLabel);
	}
	return (
		<ChartContainer
			config={chartConfig}
			className="w-full min-w-0 [aspect-ratio:auto]"
			style={{ width: "100%", height, minHeight: height }}
		>
			<LineChart data={data} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="label"
					tickLine={false}
					axisLine={false}
					ticks={xAxisTicks}
					minTickGap={18}
					interval="preserveStartEnd"
				/>
				<YAxis
					tickLine={false}
					axisLine={false}
					width={56}
					tickCount={4}
					domain={timeSeriesYAxisDomain(maxValue)}
					tickFormatter={(value) => formatAxisValue(Number(value), "currency")}
				/>
				<Tooltip content={<ChartTooltipContent />} />
				<Line
					type="monotone"
					dataKey="value"
					stroke="var(--color-value)"
					strokeWidth={3}
					dot={false}
					isAnimationActive={false}
				/>
			</LineChart>
		</ChartContainer>
	);
}

function RankedList({
	title,
	items,
	showDelta = false,
}: {
	title: string;
	items: ObservabilityRankedItem[];
	showDelta?: boolean;
}) {
	return (
		<Card className="rounded-lg">
			<CardHeader className="flex-row items-center justify-between gap-3">
				<CardTitle className="text-base">{title}</CardTitle>
				<ExploreButton />
			</CardHeader>
			<CardContent className="space-y-4">
				{items.length === 0 ? (
					<p className="text-sm text-muted-foreground">No usage in this period.</p>
				) : null}
				{items.map((item, index) => (
					<RankedListItem
						key={item.id}
						item={item}
						color={CHART_COLORS[index % CHART_COLORS.length]}
						showDelta={showDelta}
					/>
				))}
			</CardContent>
		</Card>
	);
}

function RankedListItem({
	item,
	color,
	showDelta,
}: {
	item: ObservabilityRankedItem;
	color: string;
	showDelta: boolean;
}) {
	const positive = (item.deltaPercent ?? 0) >= 0;
	const DeltaIcon = positive ? ChevronUp : ChevronDown;
	return (
		<div className="grid grid-cols-[1fr_120px] items-center gap-3">
			<div className="min-w-0">
				<div className="flex min-w-0 items-center gap-2">
					<span
						className="h-2.5 w-2.5 shrink-0 rounded-sm"
						style={{ backgroundColor: color }}
					/>
					<div className="truncate text-sm font-medium">{item.label}</div>
				</div>
				<div className="text-xs text-muted-foreground">
					{item.subtitle ?? `${item.requests} requests`}
				</div>
			</div>
			<div className="text-right">
				<div className="font-mono text-sm">
					{formatNumber(item.tokens)}{" "}
					<span className="font-sans text-xs text-muted-foreground">toks</span>
				</div>
				{showDelta ? (
					<div
						className={cn(
							"inline-flex items-center justify-end gap-1 text-xs font-medium",
							positive ? "text-emerald-600" : "text-rose-600",
						)}
					>
						{item.deltaPercent !== null ? (
							<DeltaIcon className="h-3 w-3" />
						) : null}
						<span>{formatDelta(item.deltaPercent)}</span>
					</div>
				) : null}
			</div>
		</div>
	);
}

function TrendChartOptions({
	showOther,
	cumulative,
	chartType,
	showCumulative = true,
	onShowOtherChange,
	onCumulativeChange,
	onChartTypeChange,
}: {
	showOther: boolean;
	cumulative: boolean;
	chartType: TrendChartType;
	showCumulative?: boolean;
	onShowOtherChange: (value: boolean) => void;
	onCumulativeChange: (value: boolean) => void;
	onChartTypeChange: (value: TrendChartType) => void;
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="icon" className="h-8 w-8">
					<Settings2 className="h-4 w-4" />
					<span className="sr-only">Chart options</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 space-y-4 p-3">
				<div className="flex items-center justify-between gap-3">
					<div className="text-sm">Show Other</div>
					<Switch
						checked={showOther}
						onCheckedChange={onShowOtherChange}
					/>
				</div>
				{showCumulative ? (
					<div className="flex items-center justify-between gap-3">
						<div className="text-sm">Cumulative sum</div>
						<Switch checked={cumulative} onCheckedChange={onCumulativeChange} />
					</div>
				) : null}
				<div className="flex items-center justify-between gap-3">
					<div className="text-sm">Chart type</div>
					<ToggleGroup
						type="single"
						value={chartType}
						onValueChange={(value) => {
							if (value === "bar" || value === "line" || value === "dot") {
								onChartTypeChange(value);
							}
						}}
						variant="outline"
						size="sm"
					>
						<ToggleGroupItem value="bar" aria-label="Bar chart">
							<BarChart3 className="h-3.5 w-3.5" />
						</ToggleGroupItem>
						<ToggleGroupItem value="line" aria-label="Line chart">
							<LineChartIcon className="h-3.5 w-3.5" />
						</ToggleGroupItem>
						<ToggleGroupItem value="dot" aria-label="Dot plot">
							<CircleDot className="h-3.5 w-3.5" />
						</ToggleGroupItem>
					</ToggleGroup>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function TrendChartPanel({
	title,
	charts,
	metric,
}: {
	title: string;
	charts: ObservabilityTrendMetricCharts;
	metric: TrendMetric;
}) {
	const [showOther, setShowOther] = React.useState(true);
	const [cumulative, setCumulative] = React.useState(false);
	const [chartType, setChartType] = React.useState<TrendChartType>("bar");
	const [displayChartType, setDisplayChartType] =
		React.useState<TrendChartType>("bar");
	const [isChartFading, setIsChartFading] = React.useState(false);
	const router = useRouter();
	const rawChart = charts[metric];
	const chart = React.useMemo(
		() => prepareTrendChartData(rawChart, { showOther, cumulative }),
		[rawChart, showOther, cumulative],
	);
	const valueKind = trendMetricValueKind(metric);
	React.useEffect(() => {
		if (chartType === displayChartType) return;
		setIsChartFading(true);
		const swapTimer = window.setTimeout(() => {
			setDisplayChartType(chartType);
			window.requestAnimationFrame(() => setIsChartFading(false));
		}, 120);
		return () => window.clearTimeout(swapTimer);
	}, [chartType, displayChartType]);
	const openExplore = (event: React.MouseEvent<HTMLElement>) => {
		const target = event.target as HTMLElement;
		if (
			target.closest(
				"a,button,[role='switch'],[role='menuitem'],[data-radix-popper-content-wrapper]",
			)
		) {
			return;
		}
		router.push("/settings/usage/explore");
	};
	return (
		<Card
			className="cursor-pointer rounded-lg xl:col-span-3"
			onClick={openExplore}
		>
			<CardHeader className="flex-row items-start justify-between gap-3 pb-2">
				<div>
					<CardTitle className="text-base">
						{trendMetricLabel(metric)} over time
					</CardTitle>
					<p className="mt-1 text-sm text-muted-foreground">
						{title} {trendMetricLabel(metric).toLowerCase()} by day.
					</p>
				</div>
				<div className="flex items-center gap-1">
					<TrendChartOptions
						showOther={showOther}
						cumulative={cumulative}
						chartType={chartType}
						onShowOtherChange={setShowOther}
						onCumulativeChange={setCumulative}
						onChartTypeChange={setChartType}
					/>
					<ExploreButton />
				</div>
			</CardHeader>
			<CardContent>
				<div
					className={cn(
						"transition-opacity duration-150 ease-out",
						isChartFading ? "opacity-20" : "opacity-100",
					)}
				>
					{displayChartType === "bar" ? (
						<StackedTimeSeriesBarChart data={chart} valueKind={valueKind} />
					) : (
						<MultiSeriesLineChart
							data={chart}
							valueKind={valueKind}
							dotsOnly={displayChartType === "dot"}
						/>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function TrendDelta({ item }: { item: ObservabilityRankedItem }) {
	if (item.previousTokens <= 0 && item.tokens > 0) {
		return <span className="text-emerald-600">New</span>;
	}
	const positive = (item.deltaPercent ?? 0) >= 0;
	const Icon = positive ? ChevronUp : ChevronDown;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1",
				positive ? "text-emerald-600" : "text-rose-600",
			)}
		>
			{item.deltaPercent !== null ? <Icon className="h-3 w-3" /> : null}
			{item.deltaPercent === null
				? "No prior"
				: `${Math.abs(item.deltaPercent).toFixed(1)}%`}
		</span>
	);
}

function TrendingPanel({
	title,
	items,
}: {
	title: string;
	items: ObservabilityRankedItem[];
}) {
	return (
		<Card className="rounded-lg">
			<CardHeader className="flex-row items-center justify-between gap-3 pb-2">
				<CardTitle className="text-base">Trending</CardTitle>
				<ExploreButton />
			</CardHeader>
			<CardContent className="space-y-3">
				{items.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No {title.toLowerCase()} usage in this period.
					</p>
				) : null}
				{items.slice(0, 6).map((item, index) => (
					<Link
						key={item.id}
						href="/settings/usage/explore"
						className="grid grid-cols-[1fr_86px_72px] items-center gap-3 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/40"
					>
						<div className="min-w-0">
							<div className="flex min-w-0 items-center gap-2">
								<span
									className="h-2.5 w-2.5 shrink-0 rounded-sm"
									style={{
										backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
									}}
								/>
								<span className="truncate text-sm font-medium">{item.label}</span>
							</div>
							<div className="truncate pl-4 text-xs text-muted-foreground">
								{item.subtitle ?? `${formatNumber(item.tokens)} toks`}
							</div>
						</div>
						<div className="text-emerald-600">
							<Sparkline data={item.sparkline} height={28} />
						</div>
						<div className="text-right text-xs font-medium">
							<TrendDelta item={item} />
						</div>
					</Link>
				))}
			</CardContent>
		</Card>
	);
}

function TrendSection({
	title,
	charts,
	items,
}: {
	title: string;
	charts: ObservabilityTrendMetricCharts;
	items: ObservabilityRankedItem[];
}) {
	const [metric, setMetric] = React.useState<TrendMetric>("spend");
	return (
		<section className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-lg font-semibold">{title}</h2>
				<Select
					value={metric}
					onValueChange={(value) => {
						if (
							value === "spend" ||
							value === "requests" ||
							value === "tokens"
						) {
							setMetric(value);
						}
					}}
				>
					<SelectTrigger className="h-9 w-32 rounded-xl">
						<SelectValue />
					</SelectTrigger>
					<SelectContent align="end">
						{TREND_METRICS.map((item) => {
							const Icon = item.icon;
							return (
								<SelectItem key={item.id} value={item.id}>
									<span className="flex items-center gap-2">
										<Icon className="h-4 w-4 text-muted-foreground" />
										{item.label}
									</span>
								</SelectItem>
							);
						})}
					</SelectContent>
				</Select>
			</div>
			<div className="grid gap-4 xl:grid-cols-4">
				<TrendChartPanel title={title} charts={charts} metric={metric} />
				<TrendingPanel title={title} items={items} />
			</div>
		</section>
	);
}

function Overview({ data }: { data: ObservabilityData }) {
	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
				{data.kpis.map((kpi, index) => (
					<KpiMetric
						key={kpi.id}
						kpi={kpi}
						index={index}
						total={data.kpis.length}
					/>
				))}
			</div>
			<div className="grid gap-4 xl:grid-cols-2">
				<RankedList title="Top API keys by tokens" items={data.topApiKeys} />
				<RankedList title="Top apps by tokens" items={data.topApps} />
			</div>
			<div className="grid gap-4 xl:grid-cols-2">
				<ChartCard
					title="Usage by model"
					subtitle="Daily spend in USD by model."
					className="xl:col-span-2"
				>
					<StackedTimeSeriesBarChart
						data={data.charts.usageByModelCost}
						valueKind="currency"
					/>
				</ChartCard>
				<ChartCard
					title="Usage type"
					subtitle="Daily AI Stats Credits versus BYOK spend."
				>
					<StackedTimeSeriesAreaChart
						data={data.charts.usageTypeCost}
						valueKind="currency"
					/>
				</ChartCard>
				<ChartCard title="Request volume by model">
					<StackedTimeSeriesBarChart data={data.charts.requestVolumeByModel} />
				</ChartCard>
				<ChartCard
					title="Token split"
					subtitle="Daily input, output, and reasoning tokens."
				>
					<StackedTimeSeriesBarChart data={data.charts.tokenSplit} />
				</ChartCard>
				<ChartCard
					title="Cached and uncached tokens"
					subtitle="Daily cached and uncached token volume."
				>
					<StackedTimeSeriesBarChart
						data={data.charts.cacheSplit}
						showTooltipPercent
					/>
				</ChartCard>
			</div>
		</div>
	);
}

function Trends({ data }: { data: ObservabilityData }) {
	return (
		<div className="space-y-6">
			<TrendSection
				title="Models"
				charts={data.charts.trends.models}
				items={data.trendingModels}
			/>
			<TrendSection
				title="API Keys"
				charts={data.charts.trends.keys}
				items={data.trendingKeys}
			/>
			<TrendSection
				title="Apps"
				charts={data.charts.trends.apps}
				items={data.trendingApps}
			/>
		</div>
	);
}

type ExploreDimension = "model" | "apiKey" | "app" | "provider";
type ExploreMetric =
	| "cost"
	| "requests"
	| "tokens"
	| "inputTokens"
	| "outputTokens"
	| "cachedTokens"
	| "errors";
type ExploreRollup = "total" | "average";
type ExploreSort = "desc" | "asc";
type ExploreTableSortKey =
	| "label"
	| "value"
	| "share"
	| "requests"
	| "tokens"
	| "cost";
type ExploreTableSort = {
	key: ExploreTableSortKey;
	direction: ExploreSort;
} | null;

const EXPLORE_DIMENSIONS: Array<{
	id: ExploreDimension;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
}> = [
	{ id: "model", label: "Model", icon: Blocks },
	{ id: "apiKey", label: "API Key", icon: KeyRound },
	{ id: "app", label: "App", icon: Workflow },
	{ id: "provider", label: "Provider", icon: UserRound },
];

const EXPLORE_METRICS: Array<{
	id: ExploreMetric;
	label: string;
	valueKind: TimeSeriesValueKind;
	icon: React.ComponentType<{ className?: string }>;
}> = [
	{ id: "cost", label: "Total Usage ($)", valueKind: "currency", icon: CircleDollarSign },
	{ id: "requests", label: "Requests", valueKind: "number", icon: Hash },
	{ id: "tokens", label: "Tokens", valueKind: "number", icon: Coins },
	{ id: "inputTokens", label: "Input Tokens", valueKind: "number", icon: Coins },
	{ id: "outputTokens", label: "Output Tokens", valueKind: "number", icon: Coins },
	{ id: "cachedTokens", label: "Cached Tokens", valueKind: "number", icon: Coins },
	{ id: "errors", label: "Errors", valueKind: "number", icon: CircleDot },
];

function selectExploreOption<T extends string>(
	items: Array<{ id: T; label: string; icon?: React.ComponentType<{ className?: string }> }>,
	value: T,
) {
	return items.find((item) => item.id === value) ?? items[0];
}

function metricDisplayValue(value: number, kind: TimeSeriesValueKind) {
	return kind === "currency" ? formatCurrency(value) : formatNumber(value);
}

function aggregateExploreRows(args: {
	rows: ObservabilityExploreRow[];
	dimension: ExploreDimension;
	metric: ExploreMetric;
	rollup: ExploreRollup;
	sort: ExploreSort;
	limit: number;
	showOther: boolean;
}) {
	const totals = new Map<string, { value: number; count: number; requests: number; tokens: number; cost: number; errors: number }>();
	for (const row of args.rows) {
		const key = String(row[args.dimension] || "Unknown");
		const current =
			totals.get(key) ?? { value: 0, count: 0, requests: 0, tokens: 0, cost: 0, errors: 0 };
		current.value += Number(row[args.metric] ?? 0);
		current.count += 1;
		current.requests += row.requests;
		current.tokens += row.tokens;
		current.cost += row.cost;
		current.errors += row.errors;
		totals.set(key, current);
	}
	const allRows = Array.from(totals.entries()).map(([id, values]) => ({
		id,
		label: id,
		value: args.rollup === "average" && values.count > 0 ? values.value / values.count : values.value,
		requests: values.requests,
		tokens: values.tokens,
		cost: values.cost,
		errors: values.errors,
		count: values.count,
	}));
	allRows.sort((a, b) =>
		args.sort === "desc" ? b.value - a.value : a.value - b.value,
	);
	const visible = allRows.slice(0, args.limit);
	const hidden = allRows.slice(args.limit);
	if (args.showOther && hidden.length > 0) {
		visible.push({
			id: "other",
			label: "Other",
			value: hidden.reduce((sum, row) => sum + row.value, 0),
			requests: hidden.reduce((sum, row) => sum + row.requests, 0),
			tokens: hidden.reduce((sum, row) => sum + row.tokens, 0),
			cost: hidden.reduce((sum, row) => sum + row.cost, 0),
			errors: hidden.reduce((sum, row) => sum + row.errors, 0),
			count: hidden.reduce((sum, row) => sum + row.count, 0),
		});
	}
	const total = visible.reduce((sum, row) => sum + row.value, 0);
	return {
		rows: visible.map((row, index) => ({
			...row,
			share: total > 0 ? row.value / total : 0,
			color: CHART_COLORS[index % CHART_COLORS.length],
		})),
		total,
		allCount: allRows.length,
	};
}

function ExploreSelect<T extends string>({
	value,
	options,
	onValueChange,
	className,
	grouped = false,
}: {
	value: T;
	options: Array<{
		id: T;
		label: string;
		icon?: React.ComponentType<{ className?: string }>;
	}>;
	onValueChange: (value: T) => void;
	className?: string;
	grouped?: boolean;
}) {
	return (
		<Select value={value} onValueChange={(next) => onValueChange(next as T)}>
			<SelectTrigger
				className={cn(
					"h-9 rounded-xl shadow-none",
					grouped && "rounded-none border-0 focus:ring-0",
					className,
				)}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent align="start">
				{options.map((item) => {
					const Icon = item.icon;
					return (
						<SelectItem key={item.id} value={item.id}>
							<span className="flex items-center gap-2">
								{Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
								{item.label}
							</span>
						</SelectItem>
					);
				})}
			</SelectContent>
		</Select>
	);
}

function ExploreBarChart({
	rows,
	valueKind,
	chartType,
	height = 300,
}: {
	rows: Array<{ id: string; label: string; value: number; color: string }>;
	valueKind: TimeSeriesValueKind;
	chartType: TrendChartType;
	height?: number;
}) {
	const chartConfig = Object.fromEntries(
		rows.map((row) => [row.id, { label: row.label, color: row.color }]),
	) satisfies ChartConfig;
	const chartRows = rows.map((row) => ({ ...row, valueLabel: row.label }));
	const maxValue = Math.max(0, ...rows.map((row) => row.value));
	return (
		<ChartContainer
			config={chartConfig}
			className="w-full min-w-0 [aspect-ratio:auto]"
			style={{ width: "100%", height, minHeight: height }}
		>
			<BarChart
				data={chartRows}
				layout="vertical"
				margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
			>
				<CartesianGrid horizontal={false} strokeDasharray="3 3" />
				<XAxis
					type="number"
					tickLine={false}
					axisLine={false}
					tickFormatter={(value) => formatAxisValue(Number(value), valueKind)}
					domain={timeSeriesYAxisDomain(maxValue)}
				/>
				<YAxis
					type="category"
					dataKey="label"
					tickLine={false}
					axisLine={false}
					width={132}
				/>
				<Tooltip
					cursor={{ fill: "hsl(var(--muted))", opacity: 0.32 }}
					content={(props) => {
						const item = props.payload?.[0]?.payload;
						if (!props.active || !item) return null;
						return (
							<div className="min-w-44 rounded-md border bg-popover p-2.5 text-popover-foreground shadow-md">
								<div className="text-xs font-medium">{item.label}</div>
								<div className="mt-1 font-mono text-sm">
									{metricDisplayValue(Number(item.value ?? 0), valueKind)}
								</div>
							</div>
						);
					}}
				/>
				<Bar
					dataKey="value"
					fill={CHART_COLORS[0]}
					radius={chartType === "bar" ? 4 : 999}
					barSize={chartType === "dot" ? 8 : 14}
					isAnimationActive
					animationDuration={220}
				>
					{chartRows.map((row) => (
						<Cell key={row.id} fill={row.color} />
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}

function SortableTableHead({
	label,
	sortKey,
	activeSort,
	onSortChange,
	className,
}: {
	label: string;
	sortKey: ExploreTableSortKey;
	activeSort: ExploreTableSort;
	onSortChange: (key: ExploreTableSortKey) => void;
	className?: string;
}) {
	const active = activeSort?.key === sortKey;
	const Icon = !active
		? ChevronsUpDown
		: activeSort.direction === "desc"
			? ChevronDown
			: ChevronUp;
	return (
		<TableHead className={cn("group", className)}>
			<button
				type="button"
				className={cn(
					"inline-flex w-full items-center gap-1 text-left",
					className?.includes("text-right") ? "justify-end" : "justify-start",
				)}
				onClick={() => onSortChange(sortKey)}
			>
				<span>{label}</span>
				<Icon
					className={cn(
						"h-3.5 w-3.5 transition-opacity",
						active
							? "opacity-100"
							: "opacity-0 group-hover:opacity-60 group-focus-within:opacity-60",
					)}
				/>
			</button>
		</TableHead>
	);
}

function Explore({ data }: { data: ObservabilityData }) {
	const [dimension, setDimension] = React.useState<ExploreDimension>("model");
	const [metric, setMetric] = React.useState<ExploreMetric>("cost");
	const [rollup, setRollup] = React.useState<ExploreRollup>("total");
	const [sort, setSort] = React.useState<ExploreSort>("desc");
	const [limit, setLimit] = React.useState("10");
	const [showOther, setShowOther] = React.useState(true);
	const [chartType, setChartType] = React.useState<TrendChartType>("bar");
	const [showChart, setShowChart] = React.useState(false);
	const [tableSort, setTableSort] = React.useState<ExploreTableSort>(null);
	const metricOption =
		EXPLORE_METRICS.find((item) => item.id === metric) ?? EXPLORE_METRICS[0];
	const dimensionOption =
		EXPLORE_DIMENSIONS.find((item) => item.id === dimension) ??
		EXPLORE_DIMENSIONS[0];
	const modelLogoByLabel = React.useMemo(
		() =>
			new Map(
				(data.filterOptions?.models ?? []).map((option) => [
					option.label,
					option.logoId,
				]),
			),
		[data.filterOptions?.models],
	);
	const aggregated = React.useMemo(
		() =>
			aggregateExploreRows({
				rows: data.exploreRows,
				dimension,
				metric,
				rollup,
				sort,
				limit: Number(limit),
				showOther,
			}),
		[data.exploreRows, dimension, metric, rollup, sort, limit, showOther],
	);
	const sortedRows = React.useMemo(() => {
		if (!tableSort) return aggregated.rows;
		return [...aggregated.rows].sort((a, b) => {
			const left =
				tableSort.key === "label" ? a.label : Number(a[tableSort.key] ?? 0);
			const right =
				tableSort.key === "label" ? b.label : Number(b[tableSort.key] ?? 0);
			const result =
				typeof left === "string" && typeof right === "string"
					? left.localeCompare(right)
					: Number(left) - Number(right);
			return tableSort.direction === "asc" ? result : -result;
		});
	}, [aggregated.rows, tableSort]);
	const cycleTableSort = (key: ExploreTableSortKey) => {
		setTableSort((current) => {
			if (!current || current.key !== key) return { key, direction: "desc" };
			if (current.direction === "desc") return { key, direction: "asc" };
			return null;
		});
	};
	return (
		<div className="flex h-[calc(100dvh-18rem)] min-h-0 flex-col gap-4 overflow-hidden">
			<div className="shrink-0 space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<ButtonGroup className="overflow-hidden rounded-md border">
						<ExploreSelect
							value={metric}
							options={EXPLORE_METRICS}
							onValueChange={setMetric}
							className="w-44"
							grouped
						/>
						<span className="flex h-9 items-center border-l border-r bg-muted/30 px-2 text-xs text-muted-foreground">
							by
						</span>
						<ExploreSelect
							value={dimension}
							options={EXPLORE_DIMENSIONS}
							onValueChange={setDimension}
							className="w-36"
							grouped
						/>
					</ButtonGroup>
					<ButtonGroup className="overflow-hidden rounded-md border">
						<Select
							value={sort}
							onValueChange={(value) => setSort(value as ExploreSort)}
						>
							<SelectTrigger className="h-9 w-24 rounded-none border-0 shadow-none focus:ring-0">
								<SelectValue />
							</SelectTrigger>
							<SelectContent align="start">
								<SelectItem value="desc">Top</SelectItem>
								<SelectItem value="asc">Bottom</SelectItem>
							</SelectContent>
						</Select>
						<Select value={limit} onValueChange={setLimit}>
							<SelectTrigger className="h-9 w-20 rounded-none border-y-0 border-r-0 shadow-none focus:ring-0">
								<SelectValue />
							</SelectTrigger>
							<SelectContent align="start">
								{["5", "10", "15", "25"].map((value) => (
									<SelectItem key={value} value={value}>
										{value}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select
							value={rollup}
							onValueChange={(value) => setRollup(value as ExploreRollup)}
						>
							<SelectTrigger className="h-9 w-36 rounded-none border-y-0 border-r-0 shadow-none focus:ring-0">
								<SelectValue />
							</SelectTrigger>
							<SelectContent align="start">
								<SelectItem value="total">Rollup: Total</SelectItem>
								<SelectItem value="average">Rollup: Average</SelectItem>
							</SelectContent>
						</Select>
					</ButtonGroup>
					<ButtonGroup className="overflow-hidden rounded-md border">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-9 gap-2 rounded-none"
						>
							<ListFilter className="h-4 w-4" />
							Filters
						</Button>
					</ButtonGroup>
					<ButtonGroup className="overflow-hidden rounded-md border">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-9 gap-2 rounded-none"
							onClick={() => setShowChart((current) => !current)}
						>
							<BarChart3 className="h-4 w-4" />
							{showChart ? "Hide chart" : "Show chart"}
						</Button>
					</ButtonGroup>
					<div className="ml-auto flex items-center gap-2">
						<TrendChartOptions
							showOther={showOther}
							cumulative={false}
							chartType={chartType}
							showCumulative={false}
							onShowOtherChange={setShowOther}
							onCumulativeChange={() => undefined}
							onChartTypeChange={setChartType}
						/>
					</div>
				</div>
				<div className="text-xs text-muted-foreground">
					Showing {aggregated.rows.length} of {aggregated.allCount} groups.
				</div>
			</div>

			{showChart ? (
				<div className="shrink-0 border-b pb-3">
					<ExploreBarChart
						rows={aggregated.rows}
						valueKind={metricOption.valueKind}
						chartType={chartType}
						height={260}
					/>
				</div>
			) : null}

			<div className="flex min-h-0 flex-1 flex-col border-t">
				<div className="shrink-0 py-3">
					<div>
						<CardTitle className="flex items-center gap-2 text-base">
							<Table2 className="h-4 w-4 text-muted-foreground" />
							Breakdown
						</CardTitle>
						<p className="mt-1 text-sm text-muted-foreground">
							{metricOption.label} by {dimensionOption.label}.
						</p>
					</div>
				</div>
				<ScrollArea
					className="min-h-0 flex-1 border-t"
					scrollBarOrientation="both"
					viewportClassName="h-full"
				>
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-card">
							<TableRow>
								<SortableTableHead
									label={dimensionOption.label}
									sortKey="label"
									activeSort={tableSort}
									onSortChange={cycleTableSort}
								/>
								<SortableTableHead
									label="Value"
									sortKey="value"
									activeSort={tableSort}
									onSortChange={cycleTableSort}
									className="text-right"
								/>
								<SortableTableHead
									label="% of total"
									sortKey="share"
									activeSort={tableSort}
									onSortChange={cycleTableSort}
									className="w-[220px] text-right"
								/>
								<SortableTableHead
									label="Requests"
									sortKey="requests"
									activeSort={tableSort}
									onSortChange={cycleTableSort}
									className="text-right"
								/>
								<SortableTableHead
									label="Tokens"
									sortKey="tokens"
									activeSort={tableSort}
									onSortChange={cycleTableSort}
									className="text-right"
								/>
								<SortableTableHead
									label="Cost"
									sortKey="cost"
									activeSort={tableSort}
									onSortChange={cycleTableSort}
									className="text-right"
								/>
							</TableRow>
						</TableHeader>
						<TableBody>
							{sortedRows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="max-w-[320px] truncate font-medium">
										<span className="inline-flex min-w-0 items-center gap-2">
											{dimension === "model" && modelLogoByLabel.get(row.label) ? (
												<span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-background">
													<Logo
														id={modelLogoByLabel.get(row.label) ?? ""}
														alt={row.label}
														width={16}
														height={16}
														className="h-4 w-4 object-contain"
														fallbackToColor
													/>
												</span>
											) : (
												<span
													className="h-2.5 w-2.5 shrink-0 rounded-sm"
													style={{ backgroundColor: row.color }}
												/>
											)}
											<span className="min-w-0 truncate">{row.label}</span>
										</span>
									</TableCell>
									<TableCell className="text-right font-mono">
										{metricDisplayValue(row.value, metricOption.valueKind)}
									</TableCell>
									<TableCell>
										<div className="flex items-center justify-end gap-3">
											<Progress value={row.share * 100} className="h-1.5 w-20" />
											<span className="w-12 text-right font-mono text-xs">
												{formatPercent(row.share)}
											</span>
										</div>
									</TableCell>
									<TableCell className="text-right font-mono">
										{formatNumber(row.requests)}
									</TableCell>
									<TableCell className="text-right font-mono">
										{formatNumber(row.tokens)}
									</TableCell>
									<TableCell className="text-right font-mono">
										{formatCurrency(row.cost)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</ScrollArea>
			</div>
		</div>
	);
}

function Guardrails({
	metrics,
}: {
	metrics: GuardrailEnforcementMetricsResult;
}) {
	const breakdown = [
		{ id: "blocked", label: "Blocked", value: metrics.totals.blocked },
		{ id: "redacted", label: "Redacted", value: metrics.totals.redacted },
		{ id: "flagged", label: "Flagged", value: metrics.totals.flagged },
	];
	const timeline = metrics.buckets.map((bucket) => ({
		id: bucket.bucket,
		label: bucket.label,
		value: bucket.total,
	}));
	return (
		<div className="space-y-6">
			<div className="grid gap-3 md:grid-cols-3">
				{breakdown.map((item) => (
					<Card key={item.id} className="rounded-lg">
						<CardHeader className="pb-2">
							<CardTitle className="text-sm text-muted-foreground">
								{item.label} requests
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-semibold">{formatNumber(item.value)}</div>
						</CardContent>
					</Card>
				))}
			</div>
			<div className="grid gap-4 xl:grid-cols-2">
				<ChartCard
					title="Guardrail breakdown"
				>
					<DonutBreakdownChart data={breakdown} />
				</ChartCard>
				<ChartCard
					title="Guardrail events over time"
				>
					<BarBreakdownChart data={timeline} label="events" />
				</ChartCard>
			</div>
			<Card className="rounded-lg">
				<CardHeader>
					<CardTitle className="text-base">Top guardrails</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{metrics.topGuardrails.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No guardrail events in this period.
						</p>
					) : null}
					{metrics.topGuardrails.map((guardrail) => (
						<div
							key={guardrail.id}
							className="flex items-center justify-between rounded-md border px-3 py-2"
						>
							<code className="text-xs">{guardrail.id}</code>
							<Badge variant="outline">{guardrail.count}</Badge>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}

export default function ObservabilityHub({
	data,
	guardrailMetrics,
	initialTab,
	preset,
	customFrom,
	customTo,
	requestsTable,
}: {
	data: ObservabilityData;
	guardrailMetrics: GuardrailEnforcementMetricsResult;
	initialTab: ObservabilityTab;
	preset: UsageRangePreset;
	customFrom?: string | null;
	customTo?: string | null;
	requestsTable: React.ReactNode;
}) {
	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
				<ObservabilityFilters data={data} />
				<div className="flex shrink-0 justify-end">
					<UsageLogsToolbar
						view="logs"
						preset={preset}
						customFrom={customFrom}
						customTo={customTo}
						showRefresh={false}
					/>
				</div>
			</div>

			{initialTab === "overview" ? <Overview data={data} /> : null}
			{initialTab === "trends" ? <Trends data={data} /> : null}
			{initialTab === "explore" ? (
				<Explore data={data} />
			) : null}
			{initialTab === "guardrails" ? (
				<Guardrails metrics={guardrailMetrics} />
			) : null}
		</div>
	);
}
