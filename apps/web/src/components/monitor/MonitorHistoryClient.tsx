"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
	Activity,
	AlertTriangle,
	ArrowRight,
	Ban,
	CircleHelp,
	Check,
	CheckCircle2,
	ChevronsUpDown,
	Clock3,
	GitCommitHorizontal,
	ListFilter,
	Search,
	TrendingDown,
	TrendingUp,
	XCircle,
	type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
	MonitorHistoryDbPage,
	MonitorHistoryFilterOption,
} from "@/lib/fetchers/monitor/getMonitorHistory";
import { loadMonitorHistoryPageAction } from "@/app/(dashboard)/monitor/actions";
import { resolveLogo } from "@/lib/logos";

const DEFAULT_NOW = Date.now();
const GITHUB_REPO = "https://github.com/AI-Stats/AI-Stats";
const DEFAULT_VISIBLE_COMMITS = 18;
const LOAD_MORE_COMMITS = 18;
const INITIAL_COMBOBOX_OPTIONS = 80;
const SEARCHED_COMBOBOX_OPTIONS = 120;
const COMBOBOX_OPTION_CHUNK = 80;

const PROVIDER_NAME_OVERRIDES: Record<string, string> = {
	ai21: "AI21",
	anthropic: "Anthropic",
	"anthropic-aws": "Anthropic AWS",
	"anthropic-aws-us": "Anthropic AWS US",
	"anthropic-us": "Anthropic US",
	cohere: "Cohere",
	google: "Google",
	meta: "Meta",
	microsoft: "Microsoft",
	mistral: "Mistral",
	openai: "OpenAI",
	"x-ai": "xAI",
	xai: "xAI",
	"z-ai": "Z.ai",
};

const METER_LABELS: Record<string, string> = {
	cached_read_text_tokens: "Cache read",
	cached_write_text_tokens: "Cache write",
	cached_write_text_tokens_5m: "Cache write (5 min TTL)",
	cached_write_text_tokens_1h: "Cache write (1 hour TTL)",
	input_audio_tokens: "Audio input",
	input_image_tokens: "Image input",
	input_text_tokens: "Text input",
	input_tokens: "Text input",
	input_video_tokens: "Video input",
	output_audio_tokens: "Audio output",
	output_image_tokens: "Image output",
	output_tokens: "Text output",
	output_text_tokens: "Text output",
	output_video_seconds: "Video output",
	requests: "Requests",
	total_tokens: "Total tokens",
};

const METER_ORDER: Record<string, number> = {
	input_text_tokens: 0,
	input_tokens: 0,
	cached_read_text_tokens: 1,
	cached_write_text_tokens: 2,
	cached_write_text_tokens_5m: 2,
	cached_write_text_tokens_1h: 3,
	output_text_tokens: 4,
	output_tokens: 4,
	input_audio_tokens: 10,
	input_image_tokens: 11,
	input_video_tokens: 12,
	output_audio_tokens: 20,
	output_image_tokens: 21,
	output_video_seconds: 22,
	requests: 30,
	total_tokens: 31,
};

const PLAN_ORDER: Record<string, number> = {
	standard: 0,
	free: 1,
	batch: 2,
	flex: 3,
	priority: 4,
};

const PROVIDER_STATUS_META: Record<
	string,
	{ color: string; icon: LucideIcon; label: string }
> = {
	active: { color: "text-green-600 dark:text-green-400", icon: CheckCircle2, label: "Active" },
	coming_soon: { color: "text-sky-600 dark:text-sky-400", icon: Clock3, label: "Coming Soon" },
	deranked_lvl1: {
		color: "text-amber-500 dark:text-amber-400",
		icon: AlertTriangle,
		label: "Deranked L1",
	},
	deranked_lvl2: {
		color: "text-amber-600 dark:text-amber-300",
		icon: AlertTriangle,
		label: "Deranked L2",
	},
	deranked_lvl3: {
		color: "text-red-500 dark:text-red-400",
		icon: AlertTriangle,
		label: "Deranked L3",
	},
	disabled: { color: "text-red-600 dark:text-red-400", icon: Ban, label: "Disabled" },
	inactive: { color: "text-zinc-500 dark:text-zinc-400", icon: XCircle, label: "Not Active" },
	internal_testing: {
		color: "text-violet-600 dark:text-violet-400",
		icon: Activity,
		label: "Internal Testing",
	},
	not_listed: { color: "text-zinc-500 dark:text-zinc-400", icon: XCircle, label: "Not Listed" },
};

type BadgeKind = "added" | "removed";
type DisplayRowKind =
	| "benchmark"
	| "description"
	| "link"
	| "pricing"
	| "status";
type ChangeFilter = "all" | DisplayRowKind;

const CHANGE_FILTER_OPTIONS: Array<{ label: string; value: ChangeFilter }> = [
	{ label: "All", value: "all" },
	{ label: "Status", value: "status" },
	{ label: "Pricing", value: "pricing" },
	{ label: "Description", value: "description" },
	{ label: "Links", value: "link" },
	{ label: "Benchmark results", value: "benchmark" },
];

export type ChangeHistory = {
	id: string;
	timestamp: string;
	provider: string;
	model: string;
	endpoint: string | null;
	field: string;
	oldValue: unknown;
	newValue: unknown;
	percentChange?: number;
	action?: "added" | "changed" | "removed";
	commit?: string;
	entityId?: string;
	entityType?: string;
	orgId?: string | null;
	file?: string;
};

export type CompactChangeHistory = [
	id: string,
	timestamp: string,
	provider: string,
	model: string,
	endpoint: string | null,
	field: string,
	oldValue: unknown,
	newValue: unknown,
	percentChange: number | null,
	action: "added" | "changed" | "removed" | null,
	commit: string | null,
	entityId: string | null,
	entityType: string | null,
	orgId: string | null,
];

export type HistoryMeta = {
	base?: string;
	head?: string;
	generatedAt?: string;
	commitCount?: number;
	lastSha?: string;
};

type DisplayRow = {
	entityType?: string;
	id: string;
	field: string;
	kind: DisplayRowKind;
	label: string;
	labelDetail?: string;
	oldValue: unknown;
	newValue: unknown;
	percentChange?: number;
};

type MonitorCard = {
	actionKind: BadgeKind | null;
	categories: Set<DisplayRowKind>;
	commit?: string;
	endpoint: string | null;
	id: string;
	isOfficialModelRecord: boolean;
	model: ReturnType<typeof getModelDetails>;
	primaryEntityType?: string;
	provider: ReturnType<typeof getProviderDetails>;
	rows: DisplayRow[];
	timestamp: string;
};

type CommitGroup = {
	absoluteLabel: string;
	cards: MonitorCard[];
	commit?: string;
	id: string;
	relativeLabel: string;
	timestamp: string;
};

type DiffSegment = {
	text: string;
	type: "added" | "removed" | "unchanged";
};

type FilterOption = MonitorHistoryFilterOption;

type FilterOptionGroup = {
	heading?: string;
	options: FilterOption[];
};

function inflateChangeHistory(change: ChangeHistory | CompactChangeHistory): ChangeHistory {
	if (!Array.isArray(change)) return change;

	return {
		id: change[0],
		timestamp: change[1],
		provider: change[2],
		model: change[3],
		endpoint: change[4],
		field: change[5],
		oldValue: change[6],
		newValue: change[7],
		percentChange: change[8] ?? undefined,
		action: change[9] ?? undefined,
		commit: change[10] ?? undefined,
		entityId: change[11] ?? undefined,
		entityType: change[12] ?? undefined,
		orgId: change[13] ?? undefined,
	};
}

function humanizeSlug(value: string | null | undefined) {
	const raw = String(value ?? "").trim();
	if (!raw) return "Unknown";

	const override = PROVIDER_NAME_OVERRIDES[raw.toLowerCase()];
	if (override) return override;

	return raw
		.split(/[/_-]+/g)
		.filter(Boolean)
		.map((part) => {
			if (part.length <= 3 && /[a-z]/i.test(part) && /\d/.test(part)) {
				return part.toUpperCase();
			}

			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join(" ");
}

function humanizeModelSlug(value: string | null | undefined) {
	const raw = String(value ?? "").trim();
	if (!raw) return "Unknown";

	// Preserve common version slugs like 1-0, 4-1, and 2-5 as 1.0, 4.1, and 2.5.
	const normalized = raw.replace(/(\d)-(?=\d(?:\b|-))/g, "$1.");
	return humanizeSlug(normalized);
}

function formatAbsoluteTime(timestamp: string) {
	return new Intl.DateTimeFormat("en-US", {
		day: "numeric",
		hour: "2-digit",
		hour12: false,
		minute: "2-digit",
		month: "short",
	}).format(new Date(timestamp));
}

function formatUtcTime(timestamp: string) {
	return new Intl.DateTimeFormat("en-US", {
		day: "numeric",
		hour: "2-digit",
		hour12: false,
		minute: "2-digit",
		month: "short",
		timeZone: "UTC",
		timeZoneName: "short",
	}).format(new Date(timestamp));
}

function formatShortCommit(commit: string | null | undefined) {
	const value = String(commit ?? "").trim();
	return value ? value.slice(0, 7) : null;
}

function formatRelativeTime(timestamp: string, now: number) {
	const deltaMs = Math.max(0, now - new Date(timestamp).getTime());
	const minutes = Math.floor(deltaMs / 60000);
	const hours = Math.floor(deltaMs / 3600000);
	const days = Math.floor(deltaMs / 86400000);

	if (minutes < 1) return "just now";
	if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
	if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
	if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;

	const months = Math.floor(days / 30);
	return months === 1 ? "1 month ago" : `${months} months ago`;
}

function formatNumber(value: number) {
	if (!Number.isFinite(value)) return String(value);
	if (Math.abs(value) < 1) return value.toFixed(4);
	return value.toLocaleString();
}

function formatPriceValue(value: unknown): string {
	if (typeof value === "number" && Number.isFinite(value)) {
		const absolute = Math.abs(value);
		const maximumFractionDigits =
			absolute >= 1 ? 2 : absolute >= 0.1 ? 3 : absolute >= 0.01 ? 4 : 6;
		return `$${value.toLocaleString("en-US", {
			maximumFractionDigits,
			minimumFractionDigits: 2,
		})} /MTOK`;
	}

	if (value == null) return "Unavailable";
	return String(value);
}

function formatGenericValue(value: unknown): string {
	if (Array.isArray(value)) {
		return value.map((entry) => formatGenericValue(entry)).join(", ");
	}
	if (typeof value === "number") return formatNumber(value);
	if (typeof value === "boolean") return value ? "true" : "false";
	if (value == null) return "None";
	return String(value);
}

function isDateOnlyMonitorField(field: string) {
	return field === "deprecation_date" || field === "retirement_date";
}

function formatMonitorDateValue(value: unknown): string {
	if (value == null) return "None";
	const text = String(value).trim();
	if (!text) return "None";
	const normalizedText = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)
		? `${text}Z`
		: text;
	const parsed = new Date(normalizedText);
	if (Number.isNaN(parsed.getTime())) return text;
	return new Intl.DateTimeFormat("en-US", {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
		year: "numeric",
	}).format(parsed);
}

function renderMonitorLinkValue(
	value: unknown,
	variant: "current" | "previous" = "current",
) {
	if (value == null) return null;
	const href = String(value).trim();
	if (!href) return null;
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className={[
				"min-w-0 break-all transition-colors hover:text-zinc-700 hover:underline dark:hover:text-zinc-200",
				variant === "previous"
					? "text-zinc-500 line-through decoration-zinc-400/80 dark:text-zinc-500 dark:decoration-zinc-600/80"
					: "font-medium text-zinc-950 dark:text-zinc-50",
			].join(" ")}
		>
			{href}
		</a>
	);
}

function normalizeProviderStatusValue(value: unknown): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	if (!normalized) return "";
	if (normalized === "not_active") return "inactive";
	if (normalized === "deranked" || normalized === "de_ranked") {
		return "deranked_lvl1";
	}
	if (normalized === "deranked_lvl_1") return "deranked_lvl1";
	if (normalized === "deranked_lvl_2") return "deranked_lvl2";
	if (normalized === "deranked_lvl_3") return "deranked_lvl3";
	return normalized;
}

function getProviderStatusMeta(value: unknown) {
	const normalized = normalizeProviderStatusValue(value);
	if (!normalized) return null;
	return (
		PROVIDER_STATUS_META[normalized] ?? {
			color: "text-zinc-700 dark:text-zinc-300",
			icon: Activity,
			label: humanizeSlug(normalized),
		}
	);
}

function renderProviderStatusValue(
	value: unknown,
	style: "current" | "previous" = "current",
) {
	const meta = getProviderStatusMeta(value);
	if (!meta) {
		return (
			<span
				className={
					style === "previous"
						? "font-mono text-zinc-500 line-through decoration-zinc-400/80 dark:text-zinc-500 dark:decoration-zinc-600/80"
						: "font-mono font-medium text-zinc-950 dark:text-zinc-50"
				}
			>
				{formatGenericValue(value)}
			</span>
		);
	}

	const Icon = meta.icon;
	return (
		<span
			className={[
				"inline-flex items-center gap-1.5 font-medium",
				meta.color,
				style === "previous"
					? "line-through decoration-zinc-400/80 dark:decoration-zinc-600/80"
					: null,
			]
				.filter(Boolean)
				.join(" ")}
		>
			<Icon className="h-3.5 w-3.5 shrink-0" />
			<span>{meta.label}</span>
		</span>
	);
}

function isProviderStatusRow(row: DisplayRow) {
	return row.kind === "status" && row.entityType === "api-provider";
}

function getCardBadgeKind(change: ChangeHistory): BadgeKind | null {
	if (change.field) return null;
	if (
		change.entityType !== "model" &&
		change.entityType !== "pricing" &&
		change.entityType !== "api-provider"
	) {
		return null;
	}
	if (change.action === "added") return "added";
	if (change.action === "removed") return "removed";
	return null;
}

function mergeBadgeKinds(current: BadgeKind | null, next: BadgeKind | null): BadgeKind | null {
	if (current === "removed" || next === "removed") return "removed";
	if (current === "added" || next === "added") return "added";
	return null;
}

function isTrackedChange(change: ChangeHistory) {
	if (change.entityType === "api-provider" && !change.field) return true;
	if (change.entityType === "pricing" && !change.field) return true;
	if (change.entityType === "model" && !change.field) return true;
	if (change.field === "description") return true;
	if (change.field === "status") return true;
	if (change.field === "deprecation_date") return true;
	if (change.field === "retirement_date") return true;
	if (change.field.startsWith("benchmarks.")) return true;
	if (change.field.startsWith("links.")) return true;
	if (change.field.startsWith("pricing.")) return true;
	return false;
}

function isAmbiguousBenchmarkCarryover(change: ChangeHistory) {
	if (!change.field.startsWith("benchmarks.")) return false;

	const oldValues = Array.isArray(change.oldValue) ? change.oldValue : null;
	const newValues = Array.isArray(change.newValue) ? change.newValue : null;

	if (oldValues && typeof change.newValue === "number" && oldValues.includes(change.newValue)) {
		return true;
	}

	if (newValues && typeof change.oldValue === "number" && newValues.includes(change.oldValue)) {
		return true;
	}

	return false;
}

function getHref(change: ChangeHistory) {
	if (change.provider === "model") {
		const parsedModel = parseModelVariant(change.model);
		return `/models/${parsedModel?.baseModelId ?? change.model}`;
	}
	if (change.provider === "api-provider" && change.model.includes("/")) {
		const parsedModel = parseModelVariant(change.model);
		return `/models/${parsedModel?.baseModelId ?? change.model}`;
	}
	if (change.provider === "organisation") {
		return change.entityId
			? `/organisations/${change.entityId}`
			: `/organisations/${change.model}`;
	}
	if (change.provider === "api-provider") return `/api-providers/${change.model}`;
	if (change.provider === "benchmark") return `/benchmarks/${change.model}`;
	if (change.provider === "family") return change.entityId ? `/families/${change.entityId}` : null;
	if (change.provider === "subscription-plan") {
		return change.entityId ? `/subscription-plans/${change.entityId}` : null;
	}
	return null;
}

function getProviderSlug(change: ChangeHistory) {
	if (change.entityType === "pricing" && change.entityId?.includes(":")) {
		return change.entityId.split(":")[0] ?? null;
	}
	if (change.orgId) return change.orgId;
	if (change.provider === "organisation" || change.provider === "api-provider") {
		return change.entityId ?? change.model;
	}
	if (change.model.includes("/")) return change.model.split("/")[0] ?? null;
	return null;
}

function getBaseModelId(change: ChangeHistory) {
	return parseModelVariant(change.model)?.baseModelId ?? change.model;
}

function getModelOwnerSlug(change: ChangeHistory) {
	const baseModelId = getBaseModelId(change);
	if (!baseModelId.includes("/")) return null;
	return baseModelId.split("/")[0] ?? null;
}

function isModelScopedCardChange(change: ChangeHistory) {
	return (
		change.model.includes("/") &&
		(
			change.entityType === "model" ||
			change.entityType === "pricing" ||
			change.entityType === "api-provider"
		)
	);
}

function isOfficialModelChange(change: ChangeHistory) {
	const providerSlug = getProviderSlug(change);
	const modelOwnerSlug = getModelOwnerSlug(change);
	return Boolean(providerSlug && modelOwnerSlug && providerSlug === modelOwnerSlug);
}

function parseModelVariant(modelId: string) {
	const [providerSlug, rawModelId] = modelId.split("/", 2);
	if (!providerSlug || !rawModelId) return null;

	const separatorIndex = rawModelId.indexOf(":");
	if (separatorIndex === -1) {
		return {
			baseModelId: modelId,
			variant: null,
		};
	}

	const baseModelPart = rawModelId.slice(0, separatorIndex).trim();
	const variant = rawModelId.slice(separatorIndex + 1).trim() || null;

	return {
		baseModelId: `${providerSlug}/${baseModelPart}`,
		variant,
	};
}

function getModelDetails(change: ChangeHistory) {
	const href = getHref(change);
	const parsedModel = parseModelVariant(change.model);
	const slug = parsedModel?.baseModelId ?? change.model;
	const nameSource = slug.includes("/") ? slug.split("/").slice(1).join("/") : slug;
	const variantLabel = parsedModel?.variant ? `${humanizeSlug(parsedModel.variant)} tier` : null;

	return {
		href,
		primary: humanizeModelSlug(nameSource),
		secondary: variantLabel ? `${slug} - ${variantLabel.toLowerCase()}` : slug,
	};
}

function getCardModelDetails(change: ChangeHistory) {
	if (!change.model.includes("/")) return getModelDetails(change);

	const baseModelId = getBaseModelId(change);
	const nameSource = baseModelId.split("/").slice(1).join("/");

	return {
		href: `/models/${baseModelId}`,
		primary: humanizeModelSlug(nameSource),
		secondary: baseModelId,
	};
}

function getProviderDetails(change: ChangeHistory) {
	const providerSlug = getProviderSlug(change);
	const providerLogoId = getProviderLogoId(providerSlug ?? change.provider);

	return {
		logoId: providerLogoId,
		primary: humanizeSlug(providerSlug ?? change.provider),
		secondary: providerSlug ?? change.provider,
	};
}

function getProviderLogoId(value: string | null | undefined) {
	const raw = String(value ?? "").trim();
	if (!raw) return null;

	const candidates = Array.from(
		new Set(
			[
				raw,
				raw.replace(/-(us|uk|eu|apac)$/i, ""),
				raw.replace(/-(aws|azure|vertex)(-(us|uk|eu|apac))?$/i, ""),
			].filter(Boolean),
		),
	);

	for (const candidate of candidates) {
		if (resolveLogo(candidate, { theme: "light" }).src) {
			return candidate;
		}
	}

	return raw;
}

function getBenchmarkLabelParts(field: string) {
	const benchmarkId = field.replace(/^benchmarks\./, "").replace(/\.score$/, "");
	const match = benchmarkId.match(/^(.*?)(\[[^\]]+\])$/);
	const baseId = match?.[1] ?? benchmarkId;
	const detail = match?.[2]?.slice(1, -1).trim() || undefined;

	return {
		label: humanizeSlug(baseId),
		labelDetail: detail,
	};
}

function formatPricingConditionLabel(encodedCondition: string) {
	const [path, op, value] = encodedCondition.split("~");

	if (path === "cache_ttl" && op === "eq" && value) {
		return `${value} cache`;
	}

	if (path === "effective_from" && op === "eq" && value) {
		return `From ${formatUtcTime(value)}`;
	}

	if (path === "effective_to" && op === "eq" && value) {
		return `Until ${formatUtcTime(value)}`;
	}

	if (path === "priority" && op === "eq" && value) {
		return `Priority ${value}`;
	}

	const prettyPath = humanizeSlug(path || encodedCondition);
	const operatorLabels: Record<string, string> = {
		eq: "",
		gt: ">",
		gte: ">=",
		lt: "<",
		lte: "<=",
	};
	const operatorLabel = operatorLabels[op ?? ""] ?? op;

	if (op === "eq" && path && value) {
		return `${prettyPath} ${value}`;
	}

	if (operatorLabel && value) {
		return `${prettyPath} ${operatorLabel} ${value}`;
	}

	return prettyPath;
}

function parsePricingField(field: string) {
	if (!field.startsWith("pricing.")) return null;

	const encoded = field.replace(/^pricing\./, "");
	const [meter, plan = "default", ...conditions] = encoded.split("::");

	return { conditions, meter, plan };
}

function getPricingMeterOrder(meter: string) {
	if (meter in METER_ORDER) return METER_ORDER[meter];
	if (meter.includes("cache")) return 3;
	if (meter.startsWith("output_")) return 20;
	if (meter.startsWith("input_")) return 10;
	return 40;
}

function getPricingConditionOrder(condition: string) {
	if (condition.startsWith("effective_from~")) return 0;
	if (condition.startsWith("effective_to~")) return 1;
	if (condition.startsWith("input_tokens~")) return 2;
	if (condition.startsWith("cache_ttl~")) return 3;
	if (condition.startsWith("priority~")) return 4;
	return 5;
}

function getPricingDisplayParts(field: string) {
	const parsed = parsePricingField(field);
	if (!parsed) return null;

	const { conditions, meter, plan } = parsed;
	const label = METER_LABELS[meter] ?? humanizeSlug(meter);
	const sortedConditions = [...conditions].sort((a, b) => {
		const orderDiff = getPricingConditionOrder(a) - getPricingConditionOrder(b);
		if (orderDiff !== 0) return orderDiff;
		return formatPricingConditionLabel(a).localeCompare(formatPricingConditionLabel(b));
	});
	const conditionLabels = sortedConditions.map((condition) => formatPricingConditionLabel(condition));
	const schedule = conditionLabels.filter(
		(part) => part.startsWith("From ") || part.startsWith("Until "),
	);
	const qualifiers = [
		plan && plan !== "default" ? humanizeSlug(plan) : null,
		...conditionLabels.filter(
			(part) => !part.startsWith("From ") && !part.startsWith("Until "),
		),
	].filter(Boolean);

	return {
		label,
		labelDetail:
			qualifiers.length > 0 || schedule.length > 0
				? [...qualifiers, ...schedule].join(" / ")
				: undefined,
		qualifiers,
		schedule,
	};
}

function getPricingLabelParts(field: string): { label: string; labelDetail?: string } {
	const parsed = parsePricingField(field);
	if (!parsed) return { label: humanizeSlug(field) };

	const { conditions, meter, plan } = parsed;
	const label = METER_LABELS[meter] ?? humanizeSlug(meter);
	const sortedConditions = [...conditions].sort((a, b) => {
		const orderDiff = getPricingConditionOrder(a) - getPricingConditionOrder(b);
		if (orderDiff !== 0) return orderDiff;
		return formatPricingConditionLabel(a).localeCompare(formatPricingConditionLabel(b));
	});
	const qualifierParts = [
		plan && plan !== "default" ? humanizeSlug(plan) : null,
		...sortedConditions.map((condition) => formatPricingConditionLabel(condition)),
	].filter(Boolean);
	const qualifiers = qualifierParts.length > 0 ? [qualifierParts.join(" / ")] : [];
	return qualifierParts.length > 0
		? { label, labelDetail: qualifiers.join(" / ") }
		: { label };
}

function getPricingPlan(field: string) {
	return parsePricingField(field)?.plan ?? "default";
}

function getPricingPlanLabel(plan: string) {
	return plan === "default" ? "Default" : humanizeSlug(plan);
}

function getPricingPlansForRows(rows: DisplayRow[]) {
	const plans = Array.from(
		new Set(rows.filter((row) => row.kind === "pricing").map((row) => getPricingPlan(row.field))),
	);

	return plans.sort((a, b) => {
		const planDiff = (PLAN_ORDER[a] ?? 99) - (PLAN_ORDER[b] ?? 99);
		if (planDiff !== 0) return planDiff;
		return getPricingPlanLabel(a).localeCompare(getPricingPlanLabel(b));
	});
}

function getRowKind(change: ChangeHistory): DisplayRowKind {
	if (change.field === "description") return "description";
	if (
		change.field === "status" ||
		change.field === "deprecation_date" ||
		change.field === "retirement_date" ||
		!change.field
	)
		return "status";
	if (change.field.startsWith("benchmarks.")) return "benchmark";
	if (change.field.startsWith("links.")) return "link";
	return "pricing";
}

function getLinkLabel(field: string): { label: string; labelDetail?: string } {
	const match = field.match(/^links\.([^.[]+)(?:\[[^\]]+\])?\.url$/);
	const platform = match?.[1] ?? "";
	return { label: `${humanizeSlug(platform || "link")} link` };
}

function getRowLabel(change: ChangeHistory): { label: string; labelDetail?: string } {
	if (change.entityType === "api-provider" && !change.field) {
		return { label: "Provider listing" };
	}
	if (change.entityType === "pricing" && !change.field) {
		const variant = parseModelVariant(change.model)?.variant;
		return {
			label: variant ? `${humanizeSlug(variant)} tier availability` : "Provider availability",
		};
	}
	if (change.entityType === "model" && !change.field) {
		return { label: "Status" };
	}
	if (change.field === "description") return { label: "Description" };
	if (change.field === "status") return { label: "Status" };
	if (change.field === "deprecation_date") return { label: "Deprecation date" };
	if (change.field === "retirement_date") return { label: "Retirement date" };
	if (change.field.startsWith("benchmarks.")) {
		return getBenchmarkLabelParts(change.field);
	}
	if (change.field.startsWith("links.")) return getLinkLabel(change.field);
	if (change.field.startsWith("pricing.")) return getPricingLabelParts(change.field);
	return { label: humanizeSlug(change.field || "change") };
}

function getRowValues(change: ChangeHistory): Pick<DisplayRow, "oldValue" | "newValue"> {
	if (change.entityType === "api-provider" && !change.field) {
		return change.action === "added"
			? { oldValue: null, newValue: "Listed" }
			: { oldValue: "Listed", newValue: null };
	}

	if (change.entityType === "pricing" && !change.field) {
		return change.action === "added"
			? { oldValue: "Unavailable", newValue: "Available" }
			: { oldValue: "Available", newValue: "Unavailable" };
	}

	if (change.entityType === "model" && !change.field) {
		return change.action === "added"
			? { oldValue: null, newValue: change.newValue ?? "Listed" }
			: { oldValue: change.oldValue ?? "Listed", newValue: null };
	}

	return {
		oldValue: change.oldValue,
		newValue: change.newValue,
	};
}

function toDisplayRow(change: ChangeHistory): DisplayRow {
	const values = getRowValues(change);
	const labelParts = getRowLabel(change);

	return {
		entityType: change.entityType,
		id: change.id,
		field: change.field,
		kind: getRowKind(change),
		label: labelParts.label,
		labelDetail: labelParts.labelDetail,
		oldValue: values.oldValue,
		newValue: values.newValue,
		percentChange: change.percentChange,
	};
}

function shouldHideRowForCard(card: MonitorCard, row: DisplayRow) {
	if (card.primaryEntityType === "api-provider" && card.actionKind === "added") {
		return row.entityType === "api-provider" && row.field === "";
	}

	return false;
}

function getRowWeight(row: DisplayRow) {
	if (row.kind === "status") return 0;
	if (row.kind === "pricing") return 1;
	if (row.kind === "link") return 2;
	if (row.kind === "description") return 3;
	if (row.kind === "benchmark") return 4;
	return 5;
}

function getStatusRowPriority(row: DisplayRow) {
	if (row.entityType === "model") return 0;
	if (row.entityType === "api-provider" && row.field === "status") return 1;
	if (row.entityType === "api-provider") return 2;
	if (row.entityType === "pricing") return 3;
	return 4;
}

function compareDisplayRows(a: DisplayRow, b: DisplayRow) {
	const rowWeightDiff = getRowWeight(a) - getRowWeight(b);
	if (rowWeightDiff !== 0) return rowWeightDiff;

	if (a.kind === "status" && b.kind === "status") {
		const statusPriorityDiff = getStatusRowPriority(a) - getStatusRowPriority(b);
		if (statusPriorityDiff !== 0) return statusPriorityDiff;
	}

	if (a.kind === "pricing" && b.kind === "pricing") {
		const pricingA = parsePricingField(a.field);
		const pricingB = parsePricingField(b.field);

		if (pricingA && pricingB) {
			const meterDiff =
				getPricingMeterOrder(pricingA.meter) - getPricingMeterOrder(pricingB.meter);
			if (meterDiff !== 0) return meterDiff;

			const planDiff =
				(PLAN_ORDER[pricingA.plan] ?? 99) - (PLAN_ORDER[pricingB.plan] ?? 99);
			if (planDiff !== 0) return planDiff;

			const conditionCountDiff = pricingA.conditions.length - pricingB.conditions.length;
			if (conditionCountDiff !== 0) return conditionCountDiff;

			for (
				let index = 0;
				index < Math.max(pricingA.conditions.length, pricingB.conditions.length);
				index += 1
			) {
				const conditionA = pricingA.conditions[index];
				const conditionB = pricingB.conditions[index];

				if (!conditionA || !conditionB) continue;

				const conditionOrderDiff =
					getPricingConditionOrder(conditionA) - getPricingConditionOrder(conditionB);
				if (conditionOrderDiff !== 0) return conditionOrderDiff;

				const conditionLabelDiff = formatPricingConditionLabel(conditionA).localeCompare(
					formatPricingConditionLabel(conditionB),
				);
				if (conditionLabelDiff !== 0) return conditionLabelDiff;
			}
		}
	}

	return a.label.localeCompare(b.label);
}

function getDisplayValueLines(
	value: unknown,
	formatter: (value: unknown) => string,
): string[] {
	if (!Array.isArray(value)) return [formatter(value)];

	const lines = value.flatMap((entry) => getDisplayValueLines(entry, formatter));
	return Array.from(new Set(lines));
}

function getCardKey(change: ChangeHistory) {
	if (change.entityType === "model" && isModelScopedCardChange(change)) {
		return `${change.commit ?? "unknown"}:model:${getBaseModelId(change)}`;
	}

	if (change.entityType === "api-provider" && isModelScopedCardChange(change)) {
		const providerSlug = getProviderSlug(change);
		return `${change.commit ?? "unknown"}:api-provider:${getBaseModelId(change)}:${providerSlug ?? change.entityId ?? change.model}`;
	}

	if (change.entityType === "pricing" && isModelScopedCardChange(change)) {
		const providerSlug = getProviderSlug(change);
		if (providerSlug) {
			return `${change.commit ?? "unknown"}:pricing:${getBaseModelId(change)}:${providerSlug}`;
		}
	}

	if (change.entityType === "pricing") {
		return `${change.commit ?? "unknown"}:${change.entityType}:${change.entityId ?? change.model}`;
	}

	return `${change.commit ?? "unknown"}:${change.entityType}:${change.entityId ?? change.model}:${change.endpoint ?? "catalogue"}`;
}

function getCardContextLabel(card: MonitorCard) {
	if (card.primaryEntityType === "model") return "Model";
	if (card.primaryEntityType === "api-provider") return "Provider";
	if (card.primaryEntityType === "pricing") return "Pricing update";
	return card.isOfficialModelRecord ? "Model" : "Provider";
}

function getCardSortPriority(card: MonitorCard) {
	if (card.primaryEntityType === "api-provider") return 0;
	if (card.primaryEntityType === "model") return 1;
	if (card.primaryEntityType === "pricing") return 2;
	return 3;
}

function buildCommitGroups(data: ChangeHistory[], now: number): CommitGroup[] {
	const sorted = [...data].sort(
		(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
	);
	const groups = new Map<string, CommitGroup>();

	for (const change of sorted) {
		const groupId = change.commit ?? `${change.timestamp}:${change.file ?? change.id}`;
		const existingGroup = groups.get(groupId);
		let group = existingGroup;

		if (!group) {
			group = {
				absoluteLabel: formatAbsoluteTime(change.timestamp),
				cards: [],
				commit: change.commit,
				id: groupId,
				relativeLabel: formatRelativeTime(change.timestamp, now),
				timestamp: change.timestamp,
			};
			groups.set(groupId, group);
		}

		const cardId = getCardKey(change);
		let card = group.cards.find((entry) => entry.id === cardId);

		if (!card) {
			card = {
				actionKind: getCardBadgeKind(change),
				categories: new Set<DisplayRowKind>(),
				commit: change.commit,
				endpoint: change.endpoint,
				id: cardId,
				isOfficialModelRecord: isOfficialModelChange(change),
				model: getCardModelDetails(change),
				primaryEntityType: change.entityType,
				provider: getProviderDetails(change),
				rows: [],
				timestamp: change.timestamp,
			};
			group.cards.push(card);
		} else {
			card.actionKind = mergeBadgeKinds(card.actionKind, getCardBadgeKind(change));
			card.isOfficialModelRecord = card.isOfficialModelRecord || isOfficialModelChange(change);
			card.primaryEntityType ??= change.entityType;
		}

		const row = toDisplayRow(change);
		card.categories.add(row.kind);
		card.rows.push(row);
	}

	for (const group of groups.values()) {
		group.cards = group.cards.filter((card) => {
			card.rows = card.rows.filter((row) => !shouldHideRowForCard(card, row));
			card.rows.sort(compareDisplayRows);
			return card.rows.length > 0;
		});

		group.cards.sort((a, b) => {
			const priorityDiff = getCardSortPriority(a) - getCardSortPriority(b);
			if (priorityDiff !== 0) return priorityDiff;
			const modelDiff = a.model.primary.localeCompare(b.model.primary);
			if (modelDiff !== 0) return modelDiff;
			const providerDiff = a.provider.primary.localeCompare(b.provider.primary);
			if (providerDiff !== 0) return providerDiff;
			return a.id.localeCompare(b.id);
		});
	}

	return Array.from(groups.values()).sort(
		(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
	);
}

function getActionBadgeClasses(kind: BadgeKind) {
	if (kind === "added") {
		return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-950/60 dark:bg-emerald-950/30 dark:text-emerald-300";
	}
	if (kind === "removed") {
		return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-950/60 dark:bg-rose-950/30 dark:text-rose-300";
	}
	return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-950/60 dark:bg-sky-950/30 dark:text-sky-300";
}

function renderValueTransition(row: DisplayRow) {
	if (row.kind === "description") {
		const removedSegments = diffTextSegments(
			String(row.oldValue ?? ""),
			String(row.newValue ?? ""),
		).filter((segment) => segment.type !== "added");
		const addedSegments = diffTextSegments(
			String(row.oldValue ?? ""),
			String(row.newValue ?? ""),
		).filter((segment) => segment.type !== "removed");

		return (
			<div className="grid gap-2 text-sm leading-6">
				<div className="flex items-start gap-2">
					<span className="mt-0.5 font-mono text-xs text-rose-500">-</span>
					<p className="whitespace-pre-wrap text-zinc-500 dark:text-zinc-500">
						{renderDiffSegments(removedSegments, "removed")}
					</p>
				</div>
				<div className="flex items-start gap-2">
					<span className="mt-0.5 font-mono text-xs text-emerald-500">+</span>
					<p className="whitespace-pre-wrap text-zinc-900 dark:text-zinc-100">
						{renderDiffSegments(addedSegments, "added")}
					</p>
				</div>
			</div>
		);
	}

	if (isProviderStatusRow(row)) {
		if (row.oldValue == null && row.newValue != null) {
			return <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">{renderProviderStatusValue(row.newValue)}</div>;
		}

		if (row.oldValue != null && row.newValue == null) {
			return (
				<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
					{renderProviderStatusValue(row.oldValue, "previous")}
				</div>
			);
		}

		return (
			<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
				{renderProviderStatusValue(row.oldValue, "previous")}
				<ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-600" />
				{renderProviderStatusValue(row.newValue)}
			</div>
		);
	}

	if (row.kind === "link") {
		if (row.oldValue == null && row.newValue != null) {
			return (
				<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
					{renderMonitorLinkValue(row.newValue)}
				</div>
			);
		}

		if (row.oldValue != null && row.newValue == null) {
			return (
				<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
					{renderMonitorLinkValue(row.oldValue, "previous")}
				</div>
			);
		}

		return (
			<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
				{renderMonitorLinkValue(row.oldValue, "previous")}
				<ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-600" />
				{renderMonitorLinkValue(row.newValue)}
			</div>
		);
	}

	const formatValue =
		row.kind === "pricing"
			? formatPriceValue
			: isDateOnlyMonitorField(row.field)
				? formatMonitorDateValue
				: formatGenericValue;
	if (row.oldValue == null && row.newValue != null) {
		return (
			<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
				<span className="font-mono font-medium text-zinc-950 dark:text-zinc-50">
					{formatValue(row.newValue)}
				</span>
			</div>
		);
	}

	if (row.oldValue != null && row.newValue == null) {
		return (
			<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
				<span className="font-mono text-zinc-500 line-through decoration-zinc-400/80 dark:text-zinc-500 dark:decoration-zinc-600/80">
					{formatValue(row.oldValue)}
				</span>
			</div>
		);
	}

	const oldValues = getDisplayValueLines(row.oldValue, formatValue);
	const newValues = getDisplayValueLines(row.newValue, formatValue);
	const usesStackedValues = oldValues.length > 1 || newValues.length > 1;

	if (usesStackedValues) {
		return (
			<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 text-sm">
				<div className="space-y-1">
					{oldValues.map((value) => (
						<div
							key={`old-${value}`}
							className="font-mono text-zinc-500 line-through decoration-zinc-400/80 dark:text-zinc-500 dark:decoration-zinc-600/80"
						>
							{value}
						</div>
					))}
				</div>
				<ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-600" />
				<div className="space-y-1">
					{newValues.map((value) => (
						<div
							key={`new-${value}`}
							className="font-mono font-medium text-zinc-950 dark:text-zinc-50"
						>
							{value}
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
			<span className="font-mono text-zinc-500 line-through decoration-zinc-400/80 dark:text-zinc-500 dark:decoration-zinc-600/80">
				{oldValues[0]}
			</span>
			<ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-600" />
			<span className="font-mono font-medium text-zinc-950 dark:text-zinc-50">
				{newValues[0]}
			</span>
		</div>
	);
}

function parsePricingLabelDetail(detail: string, field?: string) {
	const pricingDisplay = field ? getPricingDisplayParts(field) : null;
	if (pricingDisplay) {
		return {
			label: pricingDisplay.label,
			meta: pricingDisplay.qualifiers.join(" • "),
			schedule: pricingDisplay.schedule.join(" / "),
		};
	}

	const parts = detail
		.split(" / ")
		.map((part) => part.trim())
		.filter(Boolean);
	const scheduleParts = parts.filter(
		(part) => part.startsWith("From ") || part.startsWith("Until "),
	);
	const metaParts = parts.filter(
		(part) => !part.startsWith("From ") && !part.startsWith("Until "),
	);

	return {
		label: "",
		meta: metaParts.join(" / "),
		schedule: scheduleParts.join(" / "),
	};
}

function renderRow(row: DisplayRow) {
	const isPositive = (row.percentChange ?? 0) > 0;
	const trendClasses = isPositive
		? "text-emerald-600 dark:text-emerald-400"
		: "text-rose-600 dark:text-rose-400";
	const isDateOnlyRow = isDateOnlyMonitorField(row.field);
	const isLinkRow = row.kind === "link";
	const isBenchmarkRow = row.kind === "benchmark";
	const usesCompactStatusLayout = row.kind === "status" && !isDateOnlyRow;
	const rowGridClass =
		usesCompactStatusLayout
			? "sm:grid-cols-[72px_minmax(0,1fr)]"
			: isDateOnlyRow
				? "sm:grid-cols-[auto_minmax(0,1fr)_auto]"
				: isLinkRow
					? "sm:grid-cols-[auto_minmax(0,1fr)_auto]"
					: isBenchmarkRow
						? "sm:grid-cols-[minmax(0,1fr)_auto_auto]"
			: row.kind === "pricing"
				? "sm:grid-cols-[minmax(0,1fr)_auto_auto]"
			: "sm:grid-cols-[minmax(160px,220px)_minmax(0,1fr)_auto]";
	const rowGapClass = usesCompactStatusLayout ? "gap-x-1.5" : "gap-x-2";
	const rowPaddingClass = row.kind === "pricing" ? "pt-2" : "pt-2.5";
	const pricingDetail =
		row.kind === "pricing" ? parsePricingLabelDetail(row.labelDetail ?? "", row.field) : null;

	return (
		<div
			key={row.id}
			className={[
				"grid gap-y-1.5 border-t border-zinc-100 first:border-t-0 first:pt-0 dark:border-zinc-900",
				rowGapClass,
				rowGridClass,
				rowPaddingClass,
			].join(" ")}
		>
			<div
				className={
					row.kind === "pricing"
						? "min-w-0 sm:pr-4"
						: isDateOnlyRow || isLinkRow || isBenchmarkRow
							? "space-y-0.5 sm:mr-4"
							: "space-y-0.5"
				}
			>
				{row.kind === "pricing" && pricingDetail ? (
					<div className="grid min-w-0 gap-1">
						<div className="flex min-w-0 items-center gap-1.5">
							<span className="text-sm leading-5 text-zinc-700 dark:text-zinc-200">
								{pricingDetail.label || row.label}
							</span>
							{pricingDetail.schedule ? (
								<Tooltip delayDuration={150}>
									<TooltipTrigger asChild>
										<button
											type="button"
											aria-label={pricingDetail.schedule}
											title={pricingDetail.schedule}
											className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-zinc-400 transition-colors hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 dark:text-zinc-500 dark:hover:text-zinc-300 dark:focus-visible:ring-zinc-700"
										>
											<Clock3 className="h-3 w-3 shrink-0" />
										</button>
									</TooltipTrigger>
									<TooltipContent side="top" sideOffset={6}>
										{pricingDetail.schedule}
									</TooltipContent>
								</Tooltip>
							) : null}
						</div>
						{pricingDetail.meta ? (
							<p className="text-xs leading-4 text-zinc-500 dark:text-zinc-400">
								{pricingDetail.meta}
							</p>
						) : null}
					</div>
				) : (
					<>
						<p
							className={[
								"text-sm leading-5 text-zinc-600 dark:text-zinc-300",
								isDateOnlyRow || isLinkRow ? "sm:whitespace-nowrap" : "",
							].join(" ")}
						>
							{row.label}
							{isBenchmarkRow && row.labelDetail ? (
								<Tooltip delayDuration={150}>
									<TooltipTrigger asChild>
										<button
											type="button"
											aria-label={row.labelDetail}
											title={row.labelDetail}
											className="ml-1 inline-flex h-4 w-4 translate-y-[1px] items-center justify-center rounded-sm text-zinc-400 transition-colors hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 dark:text-zinc-500 dark:hover:text-zinc-300 dark:focus-visible:ring-zinc-700"
										>
											<CircleHelp className="h-3.5 w-3.5 shrink-0" />
										</button>
									</TooltipTrigger>
									<TooltipContent side="top" sideOffset={6} className="max-w-xs text-pretty">
										{row.labelDetail}
									</TooltipContent>
								</Tooltip>
							) : null}
						</p>
						{row.labelDetail && !isBenchmarkRow ? (
							<p className="text-xs leading-4 text-zinc-400 dark:text-zinc-500">
								{row.labelDetail}
							</p>
						) : null}
					</>
				)}
			</div>
			{renderValueTransition(row)}
			{typeof row.percentChange === "number" && Number.isFinite(row.percentChange) ? (
				<div
					className={[
						"inline-flex items-center gap-1 self-start rounded-full text-sm font-medium",
						trendClasses,
					].join(" ")}
				>
					{isPositive ? (
						<TrendingUp className="h-3.5 w-3.5" />
					) : (
						<TrendingDown className="h-3.5 w-3.5" />
					)}
					{row.percentChange > 0 ? "+" : ""}
					{row.percentChange.toFixed(1)}%
				</div>
			) : null}
		</div>
	);
}

function tokenizeDiffText(value: string) {
	return value.trim().match(/\S+|\s+/g) ?? [];
}

function diffTextSegments(before: string, after: string): DiffSegment[] {
	const beforeTokens = tokenizeDiffText(before);
	const afterTokens = tokenizeDiffText(after);
	const lengths = Array.from({ length: beforeTokens.length + 1 }, () =>
		Array(afterTokens.length + 1).fill(0),
	);

	for (let i = beforeTokens.length - 1; i >= 0; i -= 1) {
		for (let j = afterTokens.length - 1; j >= 0; j -= 1) {
			if (beforeTokens[i] === afterTokens[j]) {
				lengths[i][j] = lengths[i + 1][j + 1] + 1;
			} else {
				lengths[i][j] = Math.max(lengths[i + 1][j], lengths[i][j + 1]);
			}
		}
	}

	const segments: DiffSegment[] = [];
	let i = 0;
	let j = 0;

	const pushSegment = (text: string, type: DiffSegment["type"]) => {
		if (!text) return;
		const previous = segments[segments.length - 1];
		if (previous?.type === type) {
			previous.text += text;
			return;
		}
		segments.push({ text, type });
	};

	while (i < beforeTokens.length && j < afterTokens.length) {
		if (beforeTokens[i] === afterTokens[j]) {
			pushSegment(beforeTokens[i], "unchanged");
			i += 1;
			j += 1;
			continue;
		}

		if (lengths[i + 1][j] >= lengths[i][j + 1]) {
			pushSegment(beforeTokens[i], "removed");
			i += 1;
		} else {
			pushSegment(afterTokens[j], "added");
			j += 1;
		}
	}

	while (i < beforeTokens.length) {
		pushSegment(beforeTokens[i], "removed");
		i += 1;
	}

	while (j < afterTokens.length) {
		pushSegment(afterTokens[j], "added");
		j += 1;
	}

	return segments;
}

function renderDiffSegments(
	segments: DiffSegment[],
	focus: "added" | "removed",
) {
	return segments.map((segment, index) => {
		if (segment.type === "unchanged") {
			return <span key={`${segment.type}-${index}`}>{segment.text}</span>;
		}

		if (segment.type !== focus) return null;

		const className =
			focus === "added"
				? "bg-emerald-100/80 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"
				: "bg-rose-100/80 text-rose-950 dark:bg-rose-950/40 dark:text-rose-100";

		return (
			<span
				key={`${segment.type}-${index}`}
				className={["rounded-md px-0.5", className].join(" ")}
			>
				{segment.text}
			</span>
		);
	});
}

function renderCard(
	card: MonitorCard,
	selectedPricingPlan: string | undefined,
	onSelectPricingPlan: ((plan: string) => void) | null,
) {
	const actionLabel =
		card.actionKind === "added"
			? "Added"
			: card.actionKind === "removed"
				? "Removed"
				: null;
	const contextLabel = getCardContextLabel(card);
	const pricingPlans = getPricingPlansForRows(card.rows);
	const activePricingPlan =
		pricingPlans.length > 0
			? pricingPlans.includes(selectedPricingPlan ?? "")
				? selectedPricingPlan ?? pricingPlans[0]
				: pricingPlans[0]
			: null;
	const visibleRows =
		activePricingPlan == null
			? card.rows
			: card.rows.filter(
					(row) => row.kind !== "pricing" || getPricingPlan(row.field) === activePricingPlan,
				);

	return (
		<article
			key={card.id}
			className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/80"
		>
			<div className="grid border-b border-zinc-200/80 dark:border-zinc-800 sm:grid-cols-[minmax(0,1fr)_220px]">
				<div className="flex min-w-0 items-start gap-3 bg-white/95 p-4 dark:bg-zinc-950/80 sm:px-5 sm:py-4.5">
					<div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
						{card.provider.logoId ? (
							<div className="relative h-5 w-5">
								<Logo
									id={card.provider.logoId}
									alt={card.provider.primary}
									className="object-contain"
									fill
								/>
							</div>
						) : (
							<Activity className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
						)}
					</div>

					<div className="min-w-0 space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
								{contextLabel}
							</span>
							{card.model.href ? (
								<Link
									href={card.model.href}
									className="truncate text-[15px] font-semibold text-zinc-950 transition-colors hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-white"
								>
									{card.model.primary}
								</Link>
							) : (
								<p className="truncate text-[15px] font-semibold text-zinc-950 dark:text-zinc-50">
									{card.model.primary}
								</p>
							)}

							{actionLabel && card.actionKind ? (
								<span
									className={[
										"inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
										getActionBadgeClasses(card.actionKind),
									].join(" ")}
								>
									{actionLabel}
								</span>
							) : null}
						</div>

						<p className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
							{card.model.secondary}
						</p>
					</div>
				</div>

				<div className="flex items-center border-t border-zinc-200/80 bg-zinc-50/95 p-4 dark:border-zinc-800 dark:bg-zinc-900/80 sm:border-l sm:border-t-0 sm:px-5 sm:py-4.5">
					<div className="ml-auto flex items-center gap-2.5">
						<div className="min-w-0 text-right">
						<p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
							{card.provider.primary}
						</p>
						</div>

						{card.provider.logoId ? (
							<div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
								<div className="relative h-5 w-5">
									<Logo
										id={card.provider.logoId}
										alt={card.provider.primary}
										className="object-contain"
										fill
									/>
								</div>
							</div>
						) : null}
					</div>
				</div>
			</div>

			<div
				className="space-y-2.5 bg-white/95 px-4 py-3.5 dark:bg-zinc-950/80 sm:px-5 sm:py-4"
			>
				{pricingPlans.length > 1 && onSelectPricingPlan ? (
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
							Tier
						</span>
						<div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
							{pricingPlans.map((plan) => {
								const isActive = plan === activePricingPlan;
								return (
									<button
										key={plan}
										type="button"
										onClick={() => onSelectPricingPlan(plan)}
										className={[
											"rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
											isActive
												? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
												: "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
										].join(" ")}
									>
										{getPricingPlanLabel(plan)}
									</button>
								);
							})}
						</div>
					</div>
				) : null}
				{visibleRows.map((row) => renderRow(row))}
			</div>
		</article>
	);
}

function FilterCombobox({
	anyLabel,
	emptyLabel,
	groups,
	icon: Icon,
	onSelect,
	placeholder,
	searchPlaceholder,
	selectedQuery,
	selectedLabel,
}: {
	anyLabel: string;
	emptyLabel: string;
	groups: FilterOptionGroup[];
	icon: typeof Search;
	onSelect: (option: { label?: string; value: string }) => void;
	placeholder: string;
	searchPlaceholder: string;
	selectedQuery: string;
	selectedLabel?: string;
}) {
	const [open, setOpen] = useState(false);
	const [searchValue, setSearchValue] = useState("");
	const [visibleOptionLimit, setVisibleOptionLimit] = useState(INITIAL_COMBOBOX_OPTIONS);
	const normalizedSearch = searchValue.trim().toLowerCase();
	const { hasMoreOptions, visibleGroups } = useMemo(() => {
		const result = groups.reduce<{
			filteredGroups: FilterOptionGroup[];
			remaining: number;
			totalCount: number;
		}>(
			(accumulator, group) => {
				const matchingOptions = normalizedSearch
					? group.options.filter((option) =>
							`${option.label} ${option.query}`.toLowerCase().includes(normalizedSearch),
						)
					: group.options;
				const nextTotalCount = accumulator.totalCount + matchingOptions.length;

				if (accumulator.remaining <= 0) {
					return {
						...accumulator,
						totalCount: nextTotalCount,
					};
				}

				const options = matchingOptions.slice(0, accumulator.remaining);

				if (options.length === 0) {
					return {
						...accumulator,
						totalCount: nextTotalCount,
					};
				}

				return {
					filteredGroups: [...accumulator.filteredGroups, { ...group, options }],
					remaining: accumulator.remaining - options.length,
					totalCount: nextTotalCount,
				};
			},
			{
				filteredGroups: [],
				remaining: visibleOptionLimit,
				totalCount: 0,
			},
		);

		const renderedCount = result.filteredGroups.reduce(
			(count, group) => count + group.options.length,
			0,
		);

		return {
			hasMoreOptions: result.totalCount > renderedCount,
			visibleGroups: result.filteredGroups,
		};
	}, [groups, normalizedSearch, visibleOptionLimit]);
	const hasVisibleOptions = visibleGroups.length > 0;

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen && searchValue) {
					setSearchValue("");
				}
				if (!nextOpen) {
					setVisibleOptionLimit(INITIAL_COMBOBOX_OPTIONS);
				}
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-expanded={open}
					className="flex h-11 w-full items-center gap-3 rounded-[1.1rem] border border-zinc-200 bg-white/90 px-4 text-left text-sm text-zinc-900 outline-none transition-colors hover:border-zinc-300 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-white dark:hover:border-zinc-700 dark:focus:border-zinc-600"
				>
					<Icon className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
					<span
						className={[
							"min-w-0 flex-1 truncate",
							selectedLabel
								? "text-zinc-900 dark:text-zinc-100"
								: "text-zinc-400 dark:text-zinc-500",
						].join(" ")}
					>
						{selectedLabel ?? placeholder}
					</span>
					<ChevronsUpDown className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={searchPlaceholder}
						value={searchValue}
						onValueChange={(value) => {
							setSearchValue(value);
							setVisibleOptionLimit(
								value.trim() ? SEARCHED_COMBOBOX_OPTIONS : INITIAL_COMBOBOX_OPTIONS,
							);
						}}
					/>
					<CommandList
						onScroll={(event) => {
							if (!hasMoreOptions) return;
							const element = event.currentTarget;
							const remainingScroll =
								element.scrollHeight - element.scrollTop - element.clientHeight;
							if (remainingScroll < 96) {
								setVisibleOptionLimit((current) => current + COMBOBOX_OPTION_CHUNK);
							}
						}}
					>
						<CommandGroup>
							<CommandItem
								value={anyLabel}
								onSelect={() => {
									onSelect({ value: "" });
									setOpen(false);
								}}
							>
								<Check
									className={[
										"h-4 w-4",
										selectedQuery ? "opacity-0" : "opacity-100",
									].join(" ")}
								/>
								{anyLabel}
							</CommandItem>
						</CommandGroup>
						{hasVisibleOptions ? (
							visibleGroups.map((group) => (
								<CommandGroup key={group.heading ?? "options"} heading={group.heading}>
									{group.options.map((option) => {
										const isSelected = selectedQuery === option.value;
										return (
											<CommandItem
												key={option.value}
												value={`${option.label} ${option.query}`}
												onSelect={() => {
													onSelect({
														label: option.label,
														value: option.value,
													});
													setOpen(false);
												}}
											>
												<Check
													className={[
														"h-4 w-4",
														isSelected ? "opacity-100" : "opacity-0",
													].join(" ")}
												/>
												<span className="truncate">{option.label}</span>
											</CommandItem>
										);
									})}
								</CommandGroup>
							))
						) : (
							<CommandEmpty>{emptyLabel}</CommandEmpty>
						)}
						{hasMoreOptions ? (
							<div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
								Scroll for more
							</div>
						) : null}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

export function MonitorHistoryClient({
	data = [],
	initialPage,
	meta,
	modelOptions,
	now = DEFAULT_NOW,
	providerOptions,
}: {
	data?: Array<ChangeHistory | CompactChangeHistory>;
	initialPage?: MonitorHistoryDbPage;
	meta?: HistoryMeta;
	modelOptions?: MonitorHistoryFilterOption[];
	now?: number;
	providerOptions?: MonitorHistoryFilterOption[];
}) {
	const isRemoteMode = Boolean(initialPage && modelOptions && providerOptions);
	const [modelQuery, setModelQuery] = useState("");
	const [modelLabel, setModelLabel] = useState<string | undefined>();
	const [providerQuery, setProviderQuery] = useState("");
	const [providerLabel, setProviderLabel] = useState<string | undefined>();
	const [typeFilter, setTypeFilter] = useState<ChangeFilter>("all");
	const [pricingPlanSelections, setPricingPlanSelections] = useState<Record<string, string>>({});
	const [visibleCommitCount, setVisibleCommitCount] = useState(DEFAULT_VISIBLE_COMMITS);
	const [remoteEntries, setRemoteEntries] = useState<Array<ChangeHistory | CompactChangeHistory>>(
		initialPage?.entries ?? [],
	);
	const [remotePage, setRemotePage] = useState<MonitorHistoryDbPage | null>(
		initialPage ?? null,
	);
	const [remoteError, setRemoteError] = useState<string | null>(null);
	const [isLoadingRemote, setIsLoadingRemote] = useState(false);
	const skipInitialRemoteFetchRef = useRef(Boolean(initialPage));
	const remoteRequestIdRef = useRef(0);
	const deferredModelQuery = useDeferredValue(modelQuery.trim().toLowerCase());
	const deferredProviderQuery = useDeferredValue(providerQuery.trim().toLowerCase());

	useEffect(() => {
		if (!isRemoteMode) return;
		if (skipInitialRemoteFetchRef.current) {
			skipInitialRemoteFetchRef.current = false;
			return;
		}

		const requestId = remoteRequestIdRef.current + 1;
		remoteRequestIdRef.current = requestId;
		setIsLoadingRemote(true);
		setRemoteError(null);

		void loadMonitorHistoryPageAction({
			changeType: typeFilter !== "all" ? typeFilter : undefined,
			commitLimit: DEFAULT_VISIBLE_COMMITS,
			commitOffset: 0,
			model: modelQuery || undefined,
			provider: providerQuery || undefined,
		})
			.then((result) => {
				if (requestId !== remoteRequestIdRef.current) return;
				if (!result.ok) {
					setRemoteError(result.error);
					return;
				}
				setRemoteEntries(result.page.entries);
				setRemotePage(result.page);
			})
			.catch((error: unknown) => {
				if (requestId !== remoteRequestIdRef.current) return;
				setRemoteError(
					error instanceof Error ? error.message : "Failed to load monitor history.",
				);
			})
			.finally(() => {
				if (requestId === remoteRequestIdRef.current) {
					setIsLoadingRemote(false);
				}
			});
	}, [
		isRemoteMode,
		modelQuery,
		providerQuery,
		typeFilter,
	]);

	const sourceData = isRemoteMode ? remoteEntries : data;

	const trackedData = useMemo(
		() =>
			sourceData
				.map((change) => inflateChangeHistory(change))
				.filter(
					(change) => isTrackedChange(change) && !isAmbiguousBenchmarkCarryover(change),
				),
		[sourceData],
	);
	const { modelOptionGroups, providerOptionGroups } = useMemo(() => {
		if (isRemoteMode) {
			return {
				modelOptionGroups: [
					{
						heading: "Models",
						options: [...(modelOptions ?? [])].sort((a, b) =>
							a.label.localeCompare(b.label),
						),
					},
				] satisfies FilterOptionGroup[],
				providerOptionGroups: [
					{
						heading: "Providers",
						options: [...(providerOptions ?? [])].sort((a, b) =>
							a.label.localeCompare(b.label),
						),
					},
				] satisfies FilterOptionGroup[],
			};
		}

		const modelOptionsMap = new Map<string, FilterOption>();
		const providerOptionsMap = new Map<string, FilterOption>();

		for (const change of trackedData) {
			if (change.model.includes("/")) {
				const modelKey = change.model.toLowerCase();
				if (!modelOptionsMap.has(modelKey)) {
					const modelDetails = getModelDetails(change);
					modelOptionsMap.set(modelKey, {
						label: modelDetails.primary,
						query: `${modelDetails.primary} ${change.model}`,
						value: change.model,
					});
				}
			}

			const providerSlug = getProviderSlug(change);
			if (providerSlug) {
				const providerKey = providerSlug.toLowerCase();
				if (!providerOptionsMap.has(providerKey)) {
					const providerName = humanizeSlug(providerSlug);
					providerOptionsMap.set(providerKey, {
						label: providerName,
						query: `${providerName} ${providerSlug}`,
						value: providerSlug,
					});
				}
			}
		}

		return {
			modelOptionGroups: [
				{
					heading: "Models",
					options: Array.from(modelOptionsMap.values()).sort((a, b) =>
						a.label.localeCompare(b.label),
					),
				},
			] satisfies FilterOptionGroup[],
			providerOptionGroups: [
				{
					heading: "Providers",
					options: Array.from(providerOptionsMap.values()).sort((a, b) =>
						a.label.localeCompare(b.label),
					),
				},
			] satisfies FilterOptionGroup[],
		};
	}, [isRemoteMode, modelOptions, providerOptions, trackedData]);
	const typeOptionGroups: FilterOptionGroup[] = [
		{
			heading: "Change type",
			options: CHANGE_FILTER_OPTIONS.filter((option) => option.value !== "all").map((option) => ({
				label: option.label,
				query: option.value,
				value: option.value,
			})),
		},
	];
	const filteredData = useMemo(
		() => {
			if (isRemoteMode) {
				return trackedData;
			}

			return trackedData.filter((change) => {
				const modelSlug = change.model.includes("/") ? change.model : null;
				const providerSlug = getProviderSlug(change);
				const matchesModel = deferredModelQuery
					? modelSlug?.toLowerCase() === deferredModelQuery
					: true;
				const matchesProvider = deferredProviderQuery
					? providerSlug?.toLowerCase() === deferredProviderQuery
					: true;
				const rowKind = getRowKind(change);
				const matchesType = typeFilter === "all" ? true : rowKind === typeFilter;

				return matchesModel && matchesProvider && matchesType;
			});
		},
		[deferredModelQuery, deferredProviderQuery, isRemoteMode, trackedData, typeFilter],
	);

	const groupedCommits = useMemo(() => buildCommitGroups(filteredData, now), [filteredData, now]);
	const visibleGroups = isRemoteMode
		? groupedCommits
		: groupedCommits.slice(0, visibleCommitCount);
	const generatedAt = isRemoteMode
		? remotePage?.generatedAt
			? new Date(remotePage.generatedAt)
			: null
		: meta?.generatedAt
			? new Date(meta.generatedAt)
			: null;
	const staleDays = generatedAt
		? Math.floor((now - generatedAt.getTime()) / 86400000)
		: null;
	const lastSyncedCommit = isRemoteMode ? remotePage?.lastSha : meta?.lastSha;
	const shortLastSyncedCommit = formatShortCommit(lastSyncedCommit);
	const selectedTypeLabel =
		typeFilter === "all"
			? undefined
			: CHANGE_FILTER_OPTIONS.find((option) => option.value === typeFilter)?.label;
	const totalCommits = isRemoteMode
		? remotePage?.totalCommits ?? groupedCommits.length
		: meta?.commitCount ?? groupedCommits.length;

	const loadMoreRemoteCommits = async () => {
		if (!isRemoteMode || !remotePage?.hasMore || isLoadingRemote) return;

		const requestId = remoteRequestIdRef.current + 1;
		remoteRequestIdRef.current = requestId;
		setIsLoadingRemote(true);
		setRemoteError(null);

		try {
			const result = await loadMonitorHistoryPageAction({
				changeType: typeFilter !== "all" ? typeFilter : undefined,
				commitLimit: DEFAULT_VISIBLE_COMMITS,
				commitOffset: remotePage.nextCommitOffset,
				model: modelQuery || undefined,
				provider: providerQuery || undefined,
			});
			if (requestId !== remoteRequestIdRef.current) return;
			if (!result.ok) {
				setRemoteError(result.error);
				return;
			}
			setRemoteEntries((current) => [...current, ...result.page.entries]);
			setRemotePage(result.page);
		} catch (error) {
			if (requestId !== remoteRequestIdRef.current) return;
			setRemoteError(
				error instanceof Error ? error.message : "Failed to load more monitor history.",
			);
		} finally {
			if (requestId === remoteRequestIdRef.current) {
				setIsLoadingRemote(false);
			}
		}
	};

	return (
		<div className="space-y-6 text-zinc-900 dark:text-zinc-100">
			<section className="space-y-3 border-b border-zinc-200/80 pb-6 dark:border-zinc-800/80">
				<h1 className="text-3xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50 sm:text-4xl">
					Monitor
				</h1>

				<p className="max-w-4xl text-sm leading-6 text-zinc-600 dark:text-zinc-400 sm:text-base">
					Track model availability, pricing shifts, benchmark score changes, and
					description updates from the catalog history in one compact feed.
				</p>

				<div className="grid overflow-hidden rounded-[1.5rem] border border-zinc-200/80 bg-white/70 dark:border-zinc-800/80 dark:bg-zinc-950/50 sm:grid-cols-3 sm:divide-x sm:divide-zinc-200/80 dark:sm:divide-zinc-800/80">
					<div className="px-4 py-4">
						<p className="text-sm text-zinc-500 dark:text-zinc-400">Last synced commit</p>
						<p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
							{shortLastSyncedCommit ? (
								<Link
									href={`${GITHUB_REPO}/commit/${lastSyncedCommit}`}
									target="_blank"
									rel="noreferrer"
									className="font-mono text-[1.35rem] hover:text-zinc-700 dark:hover:text-zinc-200"
								>
									{shortLastSyncedCommit}
								</Link>
							) : (
								"Unknown"
							)}
						</p>
					</div>

					<div className="border-t border-zinc-200/80 px-4 py-4 sm:border-t-0 dark:border-zinc-800/80">
						<p className="text-sm text-zinc-500 dark:text-zinc-400">Generated</p>
						<p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
							{generatedAt ? formatAbsoluteTime(generatedAt.toISOString()) : "Unknown"}
						</p>
					</div>

					<div className="border-t border-zinc-200/80 px-4 py-4 sm:border-t-0 dark:border-zinc-800/80">
						<p className="text-sm text-zinc-500 dark:text-zinc-400">Commits covered</p>
						<p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
							{totalCommits.toLocaleString()}
						</p>
					</div>
				</div>

				{staleDays !== null && staleDays > 7 ? (
					<p className="text-sm text-amber-700 dark:text-amber-300">
						This history is {staleDays} day{staleDays === 1 ? "" : "s"} old. Rerun
						<span className="mx-1 font-mono">scripts/update-monitor-history.ts</span>
						before publishing if fresher catalog changes should be visible.
					</p>
				) : null}
			</section>

			<section className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
				<div className="grid gap-3 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1.1fr)_220px]">
					<FilterCombobox
						anyLabel="Any model"
						icon={Search}
						placeholder="Filter by model"
						searchPlaceholder="Search models..."
						selectedQuery={modelQuery}
						selectedLabel={modelLabel}
						groups={modelOptionGroups}
						emptyLabel="No model found."
						onSelect={({ label, value }) =>
							startTransition(() => {
								setVisibleCommitCount(DEFAULT_VISIBLE_COMMITS);
								setModelLabel(label);
								setModelQuery(value);
							})
						}
					/>

					<FilterCombobox
						anyLabel="Any provider"
						icon={Search}
						placeholder="Filter by provider"
						searchPlaceholder="Search providers..."
						selectedQuery={providerQuery}
						selectedLabel={providerLabel}
						groups={providerOptionGroups}
						emptyLabel="No provider found."
						onSelect={({ label, value }) =>
							startTransition(() => {
								setVisibleCommitCount(DEFAULT_VISIBLE_COMMITS);
								setProviderLabel(label);
								setProviderQuery(value);
							})
						}
					/>

					<FilterCombobox
						anyLabel="All change types"
						icon={ListFilter}
						placeholder="All change types"
						searchPlaceholder="Search change types..."
						selectedQuery={typeFilter === "all" ? "" : typeFilter}
						selectedLabel={selectedTypeLabel}
						groups={typeOptionGroups}
						emptyLabel="No change type found."
						onSelect={({ value }) =>
							startTransition(() => {
								setVisibleCommitCount(DEFAULT_VISIBLE_COMMITS);
								setTypeFilter((value as ChangeFilter) || "all");
							})
						}
					/>
				</div>
			</section>

			<section className="space-y-5">
				{remoteError ? (
					<div className="rounded-[1.25rem] border border-amber-300/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
						{remoteError}
					</div>
				) : null}

				{visibleGroups.length === 0 ? (
					<div className="rounded-[1.5rem] border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-800">
						<p className="text-lg font-medium text-zinc-950 dark:text-white">
							No changes match these filters.
						</p>
						<p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
							Try a broader model or provider search to bring entries back into view.
						</p>
					</div>
				) : (
					visibleGroups.map((group) => {
						const commitUrl = group.commit ? `${GITHUB_REPO}/commit/${group.commit}` : null;
						const commitSha = group.commit?.slice(0, 7);

						return (
							<div key={group.id} className="space-y-3">
								<div className="flex items-center gap-4">
									<div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
										<time className="font-medium text-zinc-900 dark:text-zinc-100">
											{group.absoluteLabel}
										</time>
										<span>{group.relativeLabel}</span>
										{commitUrl && commitSha ? (
											<a
												href={commitUrl}
												target="_blank"
												rel="noreferrer"
												className="inline-flex items-center gap-1 text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
											>
												<GitCommitHorizontal className="h-3.5 w-3.5" />
												{commitSha}
											</a>
										) : null}
									</div>
									<div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
								</div>

								<div className="mx-auto max-w-4xl space-y-3">
									{group.cards.map((card) =>
										renderCard(
											card,
											pricingPlanSelections[card.id],
											getPricingPlansForRows(card.rows).length > 1
												? (plan) =>
														setPricingPlanSelections((current) => ({
															...current,
															[card.id]: plan,
														}))
												: null,
										),
									)}
								</div>
							</div>
						);
					})
				)}

				{isRemoteMode ? (
					remotePage?.hasMore ? (
						<div className="flex justify-center pt-2">
							<button
								type="button"
								onClick={() => void loadMoreRemoteCommits()}
								disabled={isLoadingRemote}
								className="inline-flex items-center gap-2 rounded-[1.1rem] border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
							>
								{isLoadingRemote ? "Loading commits..." : "Load more commits"}
							</button>
						</div>
					) : null
				) : visibleGroups.length < groupedCommits.length ? (
					<div className="flex justify-center pt-2">
						<button
							type="button"
							onClick={() =>
								setVisibleCommitCount((count) => count + LOAD_MORE_COMMITS)
							}
							className="inline-flex items-center gap-2 rounded-[1.1rem] border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
						>
							Load more commits
							<span className="text-zinc-400 dark:text-zinc-500">
								({Math.min(LOAD_MORE_COMMITS, groupedCommits.length - visibleGroups.length)})
							</span>
						</button>
					</div>
				) : null}
			</section>
		</div>
	);
}
