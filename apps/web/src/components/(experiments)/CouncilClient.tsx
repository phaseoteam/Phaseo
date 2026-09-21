"use client";

import { chatLocalStorage } from "@/lib/chat/userStorage";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { useRouter } from "next/navigation";
import {
	AlertCircle,
	ChevronDown,
	ArrowRight,
	Check,
	CheckCircle2,
	ChevronsUpDown,
	Clock3,
	Expand,
	Loader2,
	Plus,
	RotateCcw,
	Save,
	Search,
	SendHorizontal,
	SquarePen,
	Sparkles,
	Star,
	Trash2,
	X,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { Logo } from "@/components/Logo";
import { AIGeneratedNotice } from "@/components/(chat)/AIGeneratedNotice";
import { ChatRoomSwitcher } from "@/components/(chat)/ChatRoomSwitcher";
import { useInitialChatAuth } from "@/components/(chat)/ChatAuthProvider";
import { RoomWorkingIndicator } from "@/components/(chat)/RoomWorkingIndicator";
import { RoomSearchDialog } from "@/components/(chat)/RoomSearchDialog";
import { RoomModelSelector } from "@/components/(chat)/RoomModelSelector";
import { VirtualizedModelCatalog } from "@/components/(chat)/VirtualizedModelCatalog";
import {
	compareByReleaseDateDesc,
	getDefaultFavoriteModelIds,
	groupModelsByReleaseMonth,
	MODEL_SELECTOR_FAVORITES_STORAGE_KEY,
	normalizeFavoriteModelId,
} from "@/components/(chat)/playgroundConfig";
import {
	RoomComposerFooter,
	RoomComposerSurface,
} from "@/components/(chat)/RoomComposer";
import {
	CHAT_SIDEBAR_ACTIONS_CLASS,
	CHAT_SIDEBAR_HISTORY_GROUP_CLASS,
} from "@/components/(chat)/chatSidebarStyles";
import { extractResponseText } from "@/components/(chat)/chatPayload";
import { fetchChatWebApi } from "@/lib/web-api/client";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	ProviderInspectorSheet,
	ProviderInspectorSheetContent,
	ProviderInspectorSheetDescription,
	ProviderInspectorSheetHeader,
	ProviderInspectorSheetTitle,
} from "@/components/(data)/model/pricing/ProviderInspectorSheet";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import {
	createExperimentsCouncilCustomPreset,
	createExperimentsCouncilRun,
	deleteExperimentsCouncilRun,
	deleteExperimentsCouncilCustomPreset,
	ensureExperimentsCouncilPresets,
	listExperimentsCouncilCustomPresets,
	listExperimentsCouncilRuns,
	saveExperimentsCouncilCustomPreset,
	saveExperimentsCouncilPreset,
	saveExperimentsCouncilRun,
	type ExperimentsCouncilCustomPresetRecord,
	type ExperimentsCouncilPresetRecord,
	type ExperimentsCouncilRunRecord,
} from "@/lib/indexeddb/experimentsCouncil";
import { buildDefaultCouncilPresets } from "@/lib/experiments/councilPresets";
import { resolveLogo } from "@/lib/logos";
import { cn } from "@/lib/utils";

type CouncilClientProps = {
	models: GatewaySupportedModel[];
	initialPresets?: ExperimentsCouncilPresetRecord[];
	initialSelectedRunId?: number | null;
	routeBasePath?: string;
};

type CouncilPresetOption = {
	id?: number;
	key: string;
	name: string;
	description: string;
	sourceModels: string[];
	synthesisModelSlug: string | null;
	isSystem: boolean;
	createdAt: string;
	updatedAt: string;
	sourceStore: "presets" | "custom_presets";
};

type CouncilAnalysis = {
	agreement: Array<{ point: string; supporting_models: string[]; confidence: "low" | "medium" | "high" | null }>;
	key_differences: Array<{ topic: string; stances: Array<{ model: string; stance: string }>; material: boolean }>;
	partial_coverage: Array<{ models: string[]; point: string }>;
	unique_insights: Array<{ model: string; insight: string }>;
	blind_spots: string[];
};

type CouncilRunStatus =
	| "local_pending"
	| "queued"
	| "running_sources"
	| "awaiting_synthesis"
	| "running_analysis"
	| "running_fusion"
	| "completed"
	| "partial"
	| "failed";

type AnalysisCategoryKey =
	| "agreement"
	| "key_differences"
	| "partial_coverage"
	| "unique_insights"
	| "blind_spots";

type CouncilRun = {
	id: string;
	status: CouncilRunStatus;
	original_prompt: string;
	source_model_ids: string[];
	analyser_model_id: string;
	fuser_model_id: string;
	source_results: ExperimentsCouncilRunRecord["sourceResults"];
	analysis_json: CouncilAnalysis | null;
	final_answer_markdown: string | null;
	error: string | null;
	total_input_tokens: number;
	total_output_tokens: number;
	updated_at: string;
};

const DEFAULT_MODEL_OPTIONS = [
	"anthropic/claude-opus-4.6",
	"openai/gpt-5.4",
	"google/gemini-3.1-pro-preview",
	"minimax/minimax-m3",
];

function clampModels(models: string[]) {
	const out: string[] = [];
	for (const model of models) {
		const next = model.trim();
		if (!next || out.includes(next)) continue;
		out.push(next);
		if (out.length >= 4) break;
	}
	return out;
}

function displayStatus(status: string) {
	switch (status) {
		case "running_sources":
			return "Running sources";
		case "awaiting_synthesis":
			return "Awaiting synthesis";
		case "running_analysis":
			return "Running analysis";
		case "running_fusion":
			return "Running fusion";
		case "local_pending":
			return "Starting";
		default:
			return status[0]?.toUpperCase() + status.slice(1);
	}
}

function getLogoId(value: string) {
	const provider = value.trim().toLowerCase();
	if (!provider) return "unknown";
	if (provider === "xai") return "spacex-ai";
	return provider;
}

function pickLogoId(organisationId: string | null, providerId: string) {
	if (organisationId) {
		const resolved = resolveLogo(organisationId, { fallbackToColor: false });
		if (resolved.src) return organisationId;
	}
	return providerId;
}

function extractOutputTokens(payload: any): number | null {
	const candidates = [
		payload?.usage?.output_tokens,
		payload?.response?.usage?.output_tokens,
		payload?.output_tokens,
		payload?.response?.output_tokens,
		payload?.usage?.completion_tokens,
		payload?.response?.usage?.completion_tokens,
	];
	for (const value of candidates) {
		if (typeof value === "number" && Number.isFinite(value)) {
			return Math.max(0, Math.round(value));
		}
	}
	return null;
}

async function callResponsesText(model: string, input: string) {
	try {
		const response = await fetchChatWebApi("/api/chat/text", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				requestBody: { model, input },
			}),
		});
		if (!response.ok) {
			const payload = (await response.json().catch(() => null)) as
				| { message?: string; error?: string }
				| null;
			return {
				ok: false as const,
				error: payload?.message || payload?.error || `Request failed (${response.status}).`,
			};
		}
		const payload = await response.json().catch(() => null);
		if (!payload) return { ok: true as const, text: "", outputTokens: null };
		return {
			ok: true as const,
			text: extractResponseText(payload),
			outputTokens: extractOutputTokens(payload),
		};
	} catch {
		return { ok: false as const, error: "Request failed." };
	}
}

async function callResponsesStream(
	model: string,
	input: string,
	onDelta: (delta: string) => void,
) {
	try {
		const response = await fetchChatWebApi("/api/chat/text", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				requestBody: { model, input, stream: true },
			}),
		});
		if (!response.ok) {
			const payload = (await response.json().catch(() => null)) as
				| { message?: string; error?: string }
				| null;
			return {
				ok: false as const,
				error: payload?.message || payload?.error || `Request failed (${response.status}).`,
			};
		}
		if (!response.body) {
			const payload = await response.json().catch(() => null);
			const text = payload ? extractResponseText(payload) : "";
			if (text) onDelta(text);
			return { ok: true as const, text };
		}
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let text = "";

		const append = (chunk: string) => {
			if (!chunk) return;
			text += chunk;
			onDelta(chunk);
		};

		const consumeFrame = (frame: string) => {
			const lines = frame.split(/\r?\n/);
			let frameEventType = "";
			const frameDataLines: string[] = [];
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				if (trimmed.startsWith("event:")) {
					frameEventType = trimmed.slice(6).trim();
					continue;
				}
				if (trimmed.startsWith("data:")) {
					frameDataLines.push(trimmed.slice(5).trimStart());
				}
			}
			const data = frameDataLines.join("").trim();
			if (!data || data === "[DONE]") return;
			try {
				const parsed = JSON.parse(data);
				const frameType = parsed?.type ?? frameEventType;
				if (frameType === "response.output_text.delta") {
					if (typeof parsed?.delta === "string") {
						append(parsed.delta);
					}
					return;
				}
				if (frameType === "response.output_text.done") {
					if (typeof parsed?.text === "string" && parsed.text.length > text.length) {
						append(parsed.text.slice(text.length));
					}
					return;
				}
				if (frameType === "response.completed") {
					const completed = extractResponseText(parsed?.response ?? parsed);
					if (completed && completed.length > text.length) {
						append(completed.slice(text.length));
					}
					return;
				}
				const fallbackDelta =
					parsed?.choices?.[0]?.delta?.content ??
					(typeof parsed?.delta === "string" ? parsed.delta : "");
				if (typeof fallbackDelta === "string") {
					append(fallbackDelta);
				}
			} catch {
				return;
			}
		};

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const frames = buffer.split(/\r?\n\r?\n/);
			buffer = frames.pop() ?? "";
			for (const frame of frames) consumeFrame(frame);
		}
		if (buffer.trim()) consumeFrame(buffer);

		return { ok: true as const, text };
	} catch {
		return { ok: false as const, error: "Request failed." };
	}
}

function parseAnalysis(raw: string): CouncilAnalysis {
	const empty: CouncilAnalysis = {
		agreement: [],
		key_differences: [],
		partial_coverage: [],
		unique_insights: [],
		blind_spots: [],
	};
	const trimmed = raw.trim();
	if (!trimmed) return empty;
	const tryParse = (value: string) => {
		try {
			return JSON.parse(value) as Record<string, unknown>;
		} catch {
			return null;
		}
	};
	const parsed =
		tryParse(trimmed) ??
		(() => {
			const first = trimmed.indexOf("{");
			const last = trimmed.lastIndexOf("}");
			if (first >= 0 && last > first) return tryParse(trimmed.slice(first, last + 1));
			return null;
		})();
	if (!parsed) return { ...empty, blind_spots: ["Analysis returned non-JSON output."] };

	const getArrayField = (keys: string[]): unknown[] => {
		for (const key of keys) {
			const value = parsed[key];
			if (Array.isArray(value)) return value;
		}
		return [];
	};

	const agreement = getArrayField(["agreement", "consensus"])
		.map((item) => {
			if (typeof item === "string") {
				const point = cleanText(item);
				if (!point) return null;
				return { point, supporting_models: [], confidence: null };
			}
			if (!item || typeof item !== "object") return null;
			const candidate = item as Record<string, unknown>;
			const point = cleanText(
				candidate.point ?? candidate.summary ?? candidate.text ?? candidate.agreement,
			);
			const supporting_models = Array.isArray(candidate.supporting_models)
				? candidate.supporting_models
						.map((model) => cleanText(model))
						.filter(Boolean)
				: Array.isArray(candidate.models)
					? candidate.models.map((model) => cleanText(model)).filter(Boolean)
					: [];
			const confidence = isConfidence(candidate.confidence) ? candidate.confidence : null;
			if (!point && supporting_models.length === 0 && !confidence) return null;
			return { point, supporting_models, confidence };
		})
		.filter(
			(item): item is CouncilAnalysis["agreement"][number] => item !== null,
		);

	const key_differences = getArrayField(["key_differences", "differences", "contradictions"])
		.map((item) => {
			if (typeof item === "string") {
				const topic = cleanText(item);
				if (!topic) return null;
				return { topic, stances: [], material: true };
			}
			if (!item || typeof item !== "object") return null;
			const candidate = item as Record<string, unknown>;
			const topic = cleanText(candidate.topic ?? candidate.point ?? candidate.difference);
			const stances = Array.isArray(candidate.stances)
				? candidate.stances
						.map((stance) => {
							if (typeof stance === "string") {
								const text = cleanText(stance);
								return text ? { model: "", stance: text } : null;
							}
							if (!stance || typeof stance !== "object") return null;
							const stanceRow = stance as Record<string, unknown>;
							const model = cleanText(stanceRow.model ?? stanceRow.source);
							const stanceText = cleanText(stanceRow.stance ?? stanceRow.position ?? stanceRow.text);
							if (!model && !stanceText) return null;
							return { model, stance: stanceText };
						})
						.filter(
							(stance): stance is CouncilAnalysis["key_differences"][number]["stances"][number] =>
								stance !== null,
						)
				: [];
			const material = typeof candidate.material === "boolean" ? candidate.material : true;
			if (!topic && stances.length === 0) return null;
			return { topic, stances, material };
		})
		.filter(
			(item): item is CouncilAnalysis["key_differences"][number] => item !== null,
		);

	const partial_coverage = getArrayField(["partial_coverage", "coverage_gaps", "partials"])
		.map((item) => {
			if (typeof item === "string") {
				const point = cleanText(item);
				if (!point) return null;
				return { models: [], point };
			}
			if (!item || typeof item !== "object") return null;
			const candidate = item as Record<string, unknown>;
			const point = cleanText(candidate.point ?? candidate.gap ?? candidate.text);
			const models = Array.isArray(candidate.models)
				? candidate.models.map((model) => cleanText(model)).filter(Boolean)
				: [];
			if (!point && models.length === 0) return null;
			return { models, point };
		})
		.filter(
			(item): item is CouncilAnalysis["partial_coverage"][number] => item !== null,
		);

	const unique_insights = getArrayField(["unique_insights", "insights"])
		.map((item) => {
			if (typeof item === "string") {
				const insight = cleanText(item);
				if (!insight) return null;
				return { model: "", insight };
			}
			if (!item || typeof item !== "object") return null;
			const candidate = item as Record<string, unknown>;
			const model = cleanText(candidate.model ?? candidate.source);
			const insight = cleanText(candidate.insight ?? candidate.point ?? candidate.text);
			if (!model && !insight) return null;
			return { model, insight };
		})
		.filter(
			(item): item is CouncilAnalysis["unique_insights"][number] => item !== null,
		);

	const blind_spots = getArrayField(["blind_spots", "blindspots", "gaps"])
		.map((item) => {
			if (typeof item === "string") return cleanText(item);
			if (!item || typeof item !== "object") return "";
			const candidate = item as Record<string, unknown>;
			return cleanText(candidate.point ?? candidate.text ?? candidate.blind_spot);
		})
		.filter(Boolean);

	return {
		agreement,
		key_differences,
		partial_coverage,
		unique_insights,
		blind_spots,
	};
}

function cleanText(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function isConfidence(value: unknown): value is "low" | "medium" | "high" {
	return value === "low" || value === "medium" || value === "high";
}

function isFreeModelLabel(modelId: string, label: string): boolean {
	if (modelId.endsWith(":free")) return true;
	return /\(free\)/i.test(label);
}

function hasAnalysisContent(analysis: CouncilAnalysis): boolean {
	return (
		analysis.agreement.length > 0 ||
		analysis.key_differences.length > 0 ||
		analysis.partial_coverage.length > 0 ||
		analysis.unique_insights.length > 0 ||
		analysis.blind_spots.length > 0
	);
}

async function runAnalysisWithRepair(
	model: string,
	analysisPrompt: string,
): Promise<{ ok: true; analysis: CouncilAnalysis } | { ok: false; error: string }> {
	const initial = await callResponsesText(model, analysisPrompt);
	if (!initial.ok) return initial;
	const parsed = parseAnalysis(initial.text);
	if (hasAnalysisContent(parsed)) {
		return { ok: true, analysis: parsed };
	}

	const repairPrompt = `You are repairing structured analysis JSON.

Task:
- Convert the following model output into valid JSON with exactly these top-level keys:
  agreement, key_differences, partial_coverage, unique_insights, blind_spots
- Keep only information present in the original output.
- Return JSON only.

Original output:
${initial.text}`;
	const repaired = await callResponsesText(model, repairPrompt);
	if (!repaired.ok) {
		return { ok: true, analysis: parsed };
	}
	const repairedParsed = parseAnalysis(repaired.text);
	return {
		ok: true,
		analysis: hasAnalysisContent(repairedParsed) ? repairedParsed : parsed,
	};
}

function ModelSearchSelect(props: {
	value: string;
	options: string[];
	onSelect: (value: string) => void;
	getLabel: (value: string) => string;
	getLogoIdForOption: (value: string) => string;
	placeholder?: string;
	showSelectedLogoInTrigger?: boolean;
	showChevron?: boolean;
	className?: string;
	isFavorite?: (value: string) => boolean;
	getReleaseDate?: (value: string) => string | null;
}) {
	const newModelWindowMs = 14 * 24 * 60 * 60 * 1000;
	const {
		value,
		options,
		onSelect,
		getLabel,
		getLogoIdForOption,
		placeholder = "Select model",
		showSelectedLogoInTrigger = false,
		showChevron = true,
		className,
		isFavorite = () => false,
		getReleaseDate = () => null,
	} = props;
	const [open, setOpen] = useState(false);
	const [searchValue, setSearchValue] = useState("");
	const [quickFilters, setQuickFilters] = useState({ free: false, new: false });
	const [nowMs] = useState(() => Date.now());
	const filteredOptions = useMemo(() => {
		const query = searchValue.trim().toLowerCase();
		return options.filter((option) => {
			if (quickFilters.free && !option.endsWith(":free")) return false;
			if (quickFilters.new) {
				const releaseDate = getReleaseDate(option);
				const releaseMs = releaseDate ? Date.parse(releaseDate) : Number.NaN;
				if (!Number.isFinite(releaseMs) || releaseMs < nowMs - newModelWindowMs) {
					return false;
				}
			}
			return !query || `${option} ${getLabel(option)}`.toLowerCase().includes(query);
		});
	}, [getLabel, getReleaseDate, newModelWindowMs, nowMs, options, quickFilters, searchValue]);
	const favoriteOptions = filteredOptions.filter(isFavorite);
	const otherOptions = filteredOptions.filter((option) => !isFavorite(option));
	const groupedOptions = useMemo(
		() => groupModelsByReleaseMonth(otherOptions.map((option) => ({
			option,
			releaseDate: getReleaseDate(option),
		}))).map(({ heading, items }) => ({
			key: `group-${heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
			heading,
			items: items.map(({ option }) => option),
			separatorBefore: true,
		})),
		[getReleaseDate, otherOptions],
	);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					role="combobox"
					className={cn(
						"h-7 min-w-[220px] justify-between px-1 text-xs font-normal",
						!showChevron && "min-w-0 justify-start px-0",
						className,
					)}
				>
					<span className="flex min-w-0 items-center gap-2">
						{showSelectedLogoInTrigger && value ? (
							<span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-background">
								<Logo
									id={getLogoId(getLogoIdForOption(value))}
									alt={value}
									width={12}
									height={12}
								className="h-3 w-3 rounded-none object-contain"
								/>
							</span>
						) : null}
						<span className="truncate text-left">{value ? getLabel(value) : placeholder}</span>
					</span>
					{showChevron ? <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-60" /> : null}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[min(92vw,460px)] rounded-md p-0">
				<Command>
					<CommandInput placeholder="Search models..." value={searchValue} onValueChange={setSearchValue} />
					<div className="flex items-center gap-1 border-b border-border px-3 py-2">
						{(["free", "new"] as const).map((filter) => (
							<Button
								key={filter}
								type="button"
								variant="outline"
								size="sm"
								aria-pressed={quickFilters[filter]}
								onClick={() => setQuickFilters((current) => ({
									...current,
									[filter]: !current[filter],
								}))}
								className={cn(
									"h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
									quickFilters[filter]
										? "border-sky-600 bg-sky-600 text-white hover:border-sky-700 hover:bg-sky-700 hover:text-white dark:border-sky-300 dark:bg-sky-300 dark:text-slate-950 dark:hover:border-sky-200 dark:hover:bg-sky-200 dark:hover:text-slate-950"
										: "border-border bg-transparent text-foreground hover:bg-muted",
								)}
							>
								{filter === "free" ? "Free" : "New"}
							</Button>
						))}
					</div>
					<VirtualizedModelCatalog
						sections={searchValue
							? [{ key: "results", heading: "Results", items: filteredOptions }]
							: [
								{ key: "favorites", heading: "Favourites", items: favoriteOptions },
								...groupedOptions,
							]}
						getItemKey={(option) => option}
						activeItemKey={value || null}
						isItemDisabled={() => false}
						onActiveItemChange={() => undefined}
						onSelectItem={(option) => {
							onSelect(option);
							setOpen(false);
							setSearchValue("");
						}}
						renderItem={(option) => (
							<>
									<span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-background">
										<Logo
											id={getLogoId(getLogoIdForOption(option))}
											alt={option}
											width={12}
											height={12}
											className="h-3 w-3 rounded-none object-contain"
										/>
									</span>
									<span className="min-w-0 flex-1 truncate text-sm">{getLabel(option)}</span>
									{isFavorite(option) ? <Star className="h-3.5 w-3.5 fill-current text-muted-foreground" /> : null}
									<Check className={cn("h-3.5 w-3.5", value === option ? "opacity-100" : "opacity-0")} />
							</>
						)}
						emptyContent="No models found."
						estimateItemSize={34}
						maxHeightPx={420}
					/>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function toSystemPresetOption(preset: ExperimentsCouncilPresetRecord): CouncilPresetOption {
	return {
		...preset,
		sourceStore: "presets",
	};
}

function toCustomPresetOption(
	preset: ExperimentsCouncilCustomPresetRecord,
): CouncilPresetOption {
	return {
		id: preset.id,
		key: `custom-${preset.id ?? "draft"}`,
		name: preset.name,
		description: preset.description,
		sourceModels: preset.sourceModels,
		synthesisModelSlug: preset.synthesisModelSlug,
		isSystem: false,
		createdAt: preset.createdAt,
		updatedAt: preset.updatedAt,
		sourceStore: "custom_presets",
	};
}

function getPresetRef(preset: Pick<CouncilPresetOption, "sourceStore" | "id" | "key">): string {
	return `${preset.sourceStore}:${preset.id ?? preset.key}`;
}

export default function CouncilClient({
	models,
	initialPresets = [],
	initialSelectedRunId = null,
	routeBasePath = "/experiments/council",
}: CouncilClientProps) {
	const format = useDisplayFormatters();
	const formatRunTime = format.dateTime;
	const router = useRouter();
	const initialAuth = useInitialChatAuth();
	const [dayPeriod, setDayPeriod] = useState("Morning");
	const [prompt, setPrompt] = useState("");
	const [presets, setPresets] = useState<CouncilPresetOption[]>(
		initialPresets.map(toSystemPresetOption),
	);
	const [runs, setRuns] = useState<ExperimentsCouncilRunRecord[]>([]);
	const [selectedPresetRef, setSelectedPresetRef] = useState<string | null>(
		initialPresets[0] ? getPresetRef(toSystemPresetOption(initialPresets[0])) : null,
	);
	const [selectedRunId, setSelectedRunId] = useState<number | null>(initialSelectedRunId);
	const [runsLoaded, setRunsLoaded] = useState(false);
	const [selectedSourceModelId, setSelectedSourceModelId] = useState<string | null>(null);
	const [creatingRun, setCreatingRun] = useState(false);
	const [synthesisingRunId, setSynthesisingRunId] = useState<number | null>(null);
	const [retryingRunId, setRetryingRunId] = useState<number | null>(null);
	const [streamedSynthesisByRunId, setStreamedSynthesisByRunId] = useState<Record<number, string>>({});
	const [pendingSynthesisModelByRunId, setPendingSynthesisModelByRunId] = useState<Record<number, string>>({});
	const [expandedAnalysisCategory, setExpandedAnalysisCategory] = useState<AnalysisCategoryKey | null>(null);
	const [isSavingPresetInline, setIsSavingPresetInline] = useState(false);
	const [presetNameDraft, setPresetNameDraft] = useState("");
	const [isCreatingCustomPreset, setIsCreatingCustomPreset] = useState(false);
	const [isUpdatingCustomPreset, setIsUpdatingCustomPreset] = useState(false);
	const [isDeletingCustomPreset, setIsDeletingCustomPreset] = useState(false);
	const [dirtyCustomPresetIds, setDirtyCustomPresetIds] = useState<number[]>([]);
	const [expandedSourceDialogOpen, setExpandedSourceDialogOpen] = useState(false);
	const [mobileRunPickerOpen, setMobileRunPickerOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [runEditMode, setRunEditMode] = useState(false);
	const [selectedRunIds, setSelectedRunIds] = useState<Set<number>>(() => new Set());
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const synthesisScrollRef = useRef<HTMLDivElement | null>(null);
	const [favoriteModelIdSet, setFavoriteModelIdSet] = useState<Set<string>>(
		() => new Set(getDefaultFavoriteModelIds()),
	);

	useEffect(() => {
		const hour = new Date().getHours();
		setDayPeriod(hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening");
	}, []);

	useEffect(() => {
		try {
			const stored = chatLocalStorage.getItem(MODEL_SELECTOR_FAVORITES_STORAGE_KEY);
			if (!stored) return;
			const parsed = JSON.parse(stored);
			if (!Array.isArray(parsed)) return;
			setFavoriteModelIdSet(
				new Set(parsed.map((value) => normalizeFavoriteModelId(String(value)))),
			);
		} catch {
			setFavoriteModelIdSet(new Set(getDefaultFavoriteModelIds()));
		}
	}, []);

	const displayName = initialAuth?.user?.displayName?.trim();
	const firstName = displayName?.split(/\s+/)[0] || undefined;

	const availableModels = useMemo(
		() =>
			models
				.filter((m) => m.isAvailable)
				.sort((a, b) =>
					compareByReleaseDateDesc(
						{ modelId: a.modelId, label: a.modelName ?? a.modelId, releaseDate: a.releaseDate ?? a.announcementDate ?? null },
						{ modelId: b.modelId, label: b.modelName ?? b.modelId, releaseDate: b.releaseDate ?? b.announcementDate ?? null },
					),
				),
		[models],
	);
	const modelOptions = useMemo(() => availableModels.map((m) => m.modelId), [availableModels]);
	const fallbackPresets = useMemo(
		() => buildDefaultCouncilPresets(modelOptions).map(toSystemPresetOption),
		[modelOptions],
	);
	const effectivePresets = presets.length > 0 ? presets : fallbackPresets;
	const corePresets = useMemo(
		() =>
			effectivePresets.filter(
				(preset) =>
					preset.sourceStore === "presets" &&
					(preset.key === "intelligence" || preset.key === "budget" || preset.key === "custom"),
			),
		[effectivePresets],
	);
	const customUserPresets = useMemo(
		() => effectivePresets.filter((preset) => preset.sourceStore === "custom_presets"),
		[effectivePresets],
	);
	const modelMetaById = useMemo(() => {
		const map = new Map<
			string,
			{
				label: string;
				providerId: string;
				organisationId: string | null;
				organisationName: string;
				releaseDate: string | null;
			}
		>();
		for (const m of availableModels) {
			map.set(m.modelId, {
				label: m.modelName ?? m.modelId,
				providerId: m.providerId,
				organisationId: m.organisationId ?? null,
				organisationName: m.organisationName ?? m.providerName ?? m.providerId,
				releaseDate: m.releaseDate ?? m.announcementDate ?? null,
			});
		}
		return map;
	}, [availableModels]);
	const getLabel = (id: string) => {
		const baseLabel = modelMetaById.get(id)?.label ?? id;
		if (isFreeModelLabel(id, baseLabel) && !/\(free\)/i.test(baseLabel)) {
			return `${baseLabel} (Free)`;
		}
		return baseLabel;
	};
	const getOptionLogoId = (id: string) =>
		pickLogoId(
			modelMetaById.get(id)?.organisationId ?? null,
			modelMetaById.get(id)?.providerId ?? "unknown",
		);
	const isFavoriteModel = (id: string) =>
		favoriteModelIdSet.has(normalizeFavoriteModelId(id));
	const getModelReleaseDate = (id: string) =>
		modelMetaById.get(id)?.releaseDate ?? null;

	useEffect(() => {
		let active = true;
		const init = async () => {
			const fallback = modelOptions.length > 0 ? modelOptions : DEFAULT_MODEL_OPTIONS;

			void listExperimentsCouncilRuns()
				.then((initialRuns) => {
					if (!active) return;
					setRuns(initialRuns);
					setRunsLoaded(true);
				})
				.catch(() => {
					if (!active) return;
					setRunsLoaded(true);
				});

			const initialPresets = await ensureExperimentsCouncilPresets(fallback, fallback);
			const initialCustomPresets = await listExperimentsCouncilCustomPresets();
			if (!active) return;

			const supported = new Set(modelOptions);
			const seed = modelOptions.slice(0, Math.min(3, modelOptions.length));
			const normalizedPresets: ExperimentsCouncilPresetRecord[] = [];
			for (const preset of initialPresets) {
				const filtered = clampModels(preset.sourceModels).filter((modelId) =>
					supported.has(modelId),
				);
				const normalizedModels =
					preset.sourceModels.length === 0 ? [] : filtered.length > 0 ? filtered : seed;
				const normalizedSynth =
					preset.synthesisModelSlug && supported.has(preset.synthesisModelSlug)
						? preset.synthesisModelSlug
						: normalizedModels[0] ?? null;
				const changed =
					normalizedModels.length !== preset.sourceModels.length ||
					normalizedModels.some((modelId, idx) => modelId !== preset.sourceModels[idx]) ||
					(preset.synthesisModelSlug ?? null) !== normalizedSynth;
				if (changed) {
					const saved = await saveExperimentsCouncilPreset({
						...preset,
						sourceModels: normalizedModels,
						synthesisModelSlug: normalizedSynth,
					});
					normalizedPresets.push(saved);
				} else {
					normalizedPresets.push(preset);
				}
			}
			const normalizedCustomPresets: ExperimentsCouncilCustomPresetRecord[] = [];
			for (const preset of initialCustomPresets) {
				const filtered = clampModels(preset.sourceModels).filter((modelId) =>
					supported.has(modelId),
				);
				const normalizedModels =
					preset.sourceModels.length === 0 ? [] : filtered.length > 0 ? filtered : seed;
				const normalizedSynth =
					preset.synthesisModelSlug && supported.has(preset.synthesisModelSlug)
						? preset.synthesisModelSlug
						: normalizedModels[0] ?? null;
				const changed =
					normalizedModels.length !== preset.sourceModels.length ||
					normalizedModels.some((modelId, idx) => modelId !== preset.sourceModels[idx]) ||
					(preset.synthesisModelSlug ?? null) !== normalizedSynth;
				if (changed) {
					const saved = await saveExperimentsCouncilCustomPreset({
						...preset,
						sourceModels: normalizedModels,
						synthesisModelSlug: normalizedSynth,
					});
					normalizedCustomPresets.push(saved);
				} else {
					normalizedCustomPresets.push(preset);
				}
			}

			const mergedPresets = [
				...normalizedPresets.map(toSystemPresetOption),
				...normalizedCustomPresets.map(toCustomPresetOption),
			];
			setPresets(mergedPresets);
			setSelectedPresetRef((current) => {
				if (current && mergedPresets.some((preset) => getPresetRef(preset) === current)) {
					return current;
				}
				return mergedPresets[0] ? getPresetRef(mergedPresets[0]) : current ?? null;
			});
		};
		void init();
		return () => {
			active = false;
		};
	}, [modelOptions]);

	useEffect(() => {
		setSelectedRunId(initialSelectedRunId ?? null);
	}, [initialSelectedRunId]);

	useEffect(() => {
		setSelectedSourceModelId(null);
		setExpandedAnalysisCategory(null);
		setExpandedSourceDialogOpen(false);
	}, [selectedRunId]);

	const selectedPreset = useMemo(() => {
		if (selectedPresetRef != null) {
			return (
				effectivePresets.find((preset) => getPresetRef(preset) === selectedPresetRef) ??
				effectivePresets[0] ??
				null
			);
		}
		return effectivePresets[0] ?? null;
	}, [effectivePresets, selectedPresetRef]);
	useEffect(() => {
		const selectedIsSystemCustom =
			selectedPreset?.sourceStore === "presets" && selectedPreset.key === "custom";
		if (!selectedIsSystemCustom) {
			setIsSavingPresetInline(false);
			setPresetNameDraft("");
		}
	}, [selectedPreset?.key, selectedPreset?.sourceStore]);
	const selectedRun = useMemo(() => runs.find((run) => run.id === selectedRunId) ?? null, [runs, selectedRunId]);
	const isHydratingInitialRun = initialSelectedRunId != null && !runsLoaded;
	const shouldCenterComposer = !selectedRun;
	const mobileRunTriggerLabel = selectedRun
		? selectedRun.originalPrompt
		: runsLoaded
			? "New Council Run"
			: "Loading runs...";
	const displayRun = (selectedRun?.runSnapshot as CouncilRun | undefined) ?? null;
	const runSourceResults = displayRun?.source_results ?? selectedRun?.sourceResults ?? [];
	const sourceModelForView =
		selectedSourceModelId && selectedRun?.modelSlugs.includes(selectedSourceModelId)
			? selectedSourceModelId
			: null;
	const sourceViewResult =
		sourceModelForView
			? runSourceResults.find((row) => row.model_id === sourceModelForView) ?? null
			: null;
	const selectedRunSynthesisModel =
		(selectedRun?.id ? pendingSynthesisModelByRunId[selectedRun.id] : null) ??
		selectedRun?.synthesisedModelSlug ??
		selectedRun?.modelSlugs[0] ??
		modelOptions[0] ??
		"";
	const streamedSynthesisText =
		(selectedRun?.id ? streamedSynthesisByRunId[selectedRun.id] : undefined) ?? "";
	const hasSettledAllSources =
		selectedRun?.modelSlugs.every((modelId) =>
			runSourceResults.some((row) => row.model_id === modelId),
		) ?? false;
	const step1InFlight =
		selectedRun?.status === "running_sources" ||
		(selectedRun?.id != null && selectedRun.id === retryingRunId);
	const showStep2 = hasSettledAllSources && !step1InFlight;
	const successfulSourceCount = runSourceResults.filter(
		(result) => result.status === "completed" && Boolean(result.output_text),
	).length;
	const failedSourceCount = runSourceResults.filter((result) => result.status === "failed").length;
	const totalSourceOutputTokens = runSourceResults.reduce((sum, result) => {
		return sum + (typeof result.output_tokens === "number" ? result.output_tokens : 0);
	}, 0);
	const runReadyForSynthesis =
		Boolean(selectedRun) &&
		selectedRun?.status !== "running_sources" &&
		successfulSourceCount >= 2 &&
		!selectedRun?.isSynthesised;
	const synthesisNeedsQuorum = successfulSourceCount < 2;
	const showSynthesisError =
		synthesisNeedsQuorum &&
		selectedRun?.status !== "running_sources" &&
		selectedRun?.status !== "local_pending";
	const runIsSynthesising =
		selectedRun?.id != null && selectedRun.id === synthesisingRunId;
	const runIsRetryingSources =
		selectedRun?.id != null && selectedRun.id === retryingRunId;
	const synthesisBusy =
		runIsSynthesising ||
		selectedRun?.status === "running_analysis" ||
		selectedRun?.status === "running_fusion";
	const displayedSynthesis =
		streamedSynthesisText || selectedRun?.synthesisedContent || "";
	useEffect(() => {
		const viewport = synthesisScrollRef.current;
		if (!viewport || !displayedSynthesis) return;
		viewport.scrollTo({ top: viewport.scrollHeight, behavior: synthesisBusy ? "auto" : "smooth" });
	}, [displayedSynthesis, synthesisBusy]);
	const step3ModelId =
		selectedRun?.synthesisedModelSlug ??
		selectedRunSynthesisModel ??
		selectedRun?.modelSlugs[0] ??
		modelOptions[0] ??
		"";
	const step3ModelLabel = step3ModelId ? getLabel(step3ModelId) : "Synthesis model";
	const fusedSourceModelIds = (
		runSourceResults
			.filter((row) => row.status === "completed" && Boolean(row.output_text))
			.map((row) => row.model_id)
			.length > 0
			? runSourceResults
					.filter((row) => row.status === "completed" && Boolean(row.output_text))
					.map((row) => row.model_id)
			: selectedRun?.modelSlugs ?? []
	).slice(0, 4);
	const step3StatusLabel = synthesisBusy
		? "Fusing"
		: displayedSynthesis || selectedRun?.isSynthesised
			? "Fused"
			: "Selected";
	const analysisView =
		displayRun?.analysis_json ??
		((selectedRun?.analysisFindings as CouncilAnalysis | null) ?? null);
	const analysisSections = useMemo(() => {
		if (!analysisView) return null;

		const agreement = (Array.isArray(analysisView.agreement) ? analysisView.agreement : [])
			.map((item) => {
				const point = cleanText(item?.point);
				const supporting_models = Array.isArray(item?.supporting_models)
					? item.supporting_models
							.map((model) => cleanText(model))
							.filter(Boolean)
					: [];
				const confidence = isConfidence(item?.confidence) ? item.confidence : null;
				return { point, supporting_models, confidence };
			})
			.filter(
				(item) =>
					item.point.length > 0 ||
					item.supporting_models.length > 0 ||
					item.confidence !== null,
			);

		const key_differences = (
			Array.isArray(analysisView.key_differences) ? analysisView.key_differences : []
		)
			.map((item) => {
				const topic = cleanText(item?.topic);
				const stances = Array.isArray(item?.stances)
					? item.stances
							.map((stance) => ({
								model: cleanText(stance?.model),
								stance: cleanText(stance?.stance),
							}))
							.filter((stance) => stance.model.length > 0 || stance.stance.length > 0)
					: [];
				return { topic, stances };
			})
			.filter((item) => item.topic.length > 0 || item.stances.length > 0);

		const partial_coverage = (
			Array.isArray(analysisView.partial_coverage) ? analysisView.partial_coverage : []
		)
			.map((item) => {
				const point = cleanText(item?.point);
				const models = Array.isArray(item?.models)
					? item.models
							.map((model) => cleanText(model))
							.filter(Boolean)
					: [];
				return { point, models };
			})
			.filter((item) => item.point.length > 0 || item.models.length > 0);

		const unique_insights = (
			Array.isArray(analysisView.unique_insights) ? analysisView.unique_insights : []
		)
			.map((item) => ({
				model: cleanText(item?.model),
				insight: cleanText(item?.insight),
			}))
			.filter((item) => item.model.length > 0 || item.insight.length > 0);

		const blind_spots = (Array.isArray(analysisView.blind_spots) ? analysisView.blind_spots : [])
			.map((item) => cleanText(item))
			.filter(Boolean);

		return {
			agreement,
			key_differences,
			partial_coverage,
			unique_insights,
			blind_spots,
		};
	}, [analysisView]);
	const analysisCategoryRows = analysisSections
		? [
				{
					key: "agreement" as AnalysisCategoryKey,
					label: "Agreement",
					points: analysisSections.agreement
						.map((item) => item.point)
						.filter(Boolean),
				},
				{
					key: "key_differences" as AnalysisCategoryKey,
					label: "Key Differences",
					points: analysisSections.key_differences
						.map((item) => {
							if (item.topic) return item.topic;
							const stanceText = item.stances
								.map((stance) =>
									stance.model && stance.stance
										? `${stance.model}: ${stance.stance}`
										: stance.model || stance.stance,
								)
								.filter(Boolean)
								.join(" | ");
							return stanceText;
						})
						.filter(Boolean),
				},
				{
					key: "partial_coverage" as AnalysisCategoryKey,
					label: "Partial Coverage",
					points: analysisSections.partial_coverage
						.map((item) => item.point)
						.filter(Boolean),
				},
				{
					key: "unique_insights" as AnalysisCategoryKey,
					label: "Unique Insights",
					points: analysisSections.unique_insights
						.map((item) => item.insight)
						.filter(Boolean),
				},
				{
					key: "blind_spots" as AnalysisCategoryKey,
					label: "Blind Spots",
					points: analysisSections.blind_spots.filter(Boolean),
				},
			]
		: [];
	const analysisHasRenderableContent = analysisCategoryRows.some(
		(section) => section.points.length > 0,
	);
	const hasStructuredAnalysis = Boolean(analysisView);
	const showStep3 =
		hasStructuredAnalysis ||
		Boolean(displayedSynthesis) ||
		Boolean(selectedRun?.isSynthesised);
	const isSelectedSystemCustom =
		selectedPreset?.sourceStore === "presets" && selectedPreset.key === "custom";
	const selectedCustomPresetId =
		selectedPreset?.sourceStore === "custom_presets" && typeof selectedPreset.id === "number"
			? selectedPreset.id
			: null;
	const isSelectedCustomPresetDirty =
		selectedCustomPresetId != null && dirtyCustomPresetIds.includes(selectedCustomPresetId);
	const canSaveCustomPreset =
		isSelectedSystemCustom && (selectedPreset?.sourceModels.length ?? 0) >= 2;
	const canUpdateSelectedCustomPreset =
		selectedCustomPresetId != null &&
		isSelectedCustomPresetDirty &&
		(selectedPreset?.sourceModels.length ?? 0) > 0;
	const canDeleteSelectedCustomPreset = selectedCustomPresetId != null;
	const updatePresetModels = async (nextModels: string[]) => {
		if (!selectedPreset || !selectedPreset.id) return;
		const normalized = clampModels(nextModels);
		if (selectedPreset.sourceStore === "presets" && selectedPreset.key === "custom") {
			const updated = await saveExperimentsCouncilPreset({
				id: selectedPreset.id,
				key: selectedPreset.key,
				name: selectedPreset.name,
				description: selectedPreset.description,
				sourceModels: normalized,
				synthesisModelSlug: normalized[0] ?? null,
				isSystem: selectedPreset.isSystem,
				createdAt: selectedPreset.createdAt,
				updatedAt: selectedPreset.updatedAt,
			});
			setPresets((current) =>
				current.map((row) =>
					row.sourceStore === "presets" && row.id === updated.id
						? toSystemPresetOption(updated)
						: row,
				),
			);
			return;
		}
		if (selectedPreset.sourceStore === "custom_presets") {
			setPresets((current) =>
				current.map((row) =>
					row.sourceStore === "custom_presets" && row.id === selectedPreset.id
						? {
								...row,
								sourceModels: normalized,
								synthesisModelSlug: normalized[0] ?? null,
								updatedAt: new Date().toISOString(),
							}
						: row,
				),
			);
			setDirtyCustomPresetIds((current) =>
				current.includes(selectedPreset.id as number)
					? current
					: [...current, selectedPreset.id as number],
			);
			return;
		}
		const updated = await saveExperimentsCouncilPreset({
			id: selectedPreset.id,
			key: selectedPreset.key,
			name: selectedPreset.name,
			description: selectedPreset.description,
			sourceModels: normalized,
			synthesisModelSlug: normalized[0] ?? null,
			isSystem: selectedPreset.isSystem,
			createdAt: selectedPreset.createdAt,
			updatedAt: selectedPreset.updatedAt,
		});
		setPresets((current) =>
			current.map((row) =>
				row.sourceStore === "presets" && row.id === updated.id
					? toSystemPresetOption(updated)
					: row,
			),
		);
	};

	const removePresetModel = (index: number) => {
		if (!selectedPreset) return;
		const next = selectedPreset.sourceModels.filter((_, i) => i !== index);
		void updatePresetModels(next);
	};

	const createCustomPreset = async (name: string) => {
		if (!selectedPreset) return;
		if (selectedPreset.key !== "custom") {
			setErrorMessage("Select the Custom preset to save a new group.");
			return;
		}
		const sourceModels = clampModels(selectedPreset.sourceModels);
		if (sourceModels.length < 2) {
			setErrorMessage("Select at least two models before saving a custom preset.");
			return;
		}
		const normalizedName = name.trim();
		if (!normalizedName) {
			setErrorMessage("Enter a preset name.");
			return;
		}
		setIsCreatingCustomPreset(true);
		setErrorMessage(null);
		const createdAt = new Date().toISOString();
		try {
			const saved = await createExperimentsCouncilCustomPreset({
				name: normalizedName,
				description: "Custom user preset.",
				sourceModels,
				synthesisModelSlug: selectedPreset.synthesisModelSlug ?? sourceModels[0] ?? null,
				createdAt,
				updatedAt: createdAt,
			});
			const savedOption = toCustomPresetOption(saved);
			setPresets((current) => [...current, savedOption]);
			setSelectedPresetRef(getPresetRef(savedOption));
			setIsSavingPresetInline(false);
			setPresetNameDraft("");
		} catch {
			setErrorMessage("Failed to save custom preset.");
		} finally {
			setIsCreatingCustomPreset(false);
		}
	};

	const updateSelectedCustomPreset = async () => {
		if (!selectedPreset || selectedPreset.sourceStore !== "custom_presets" || !selectedPreset.id) {
			return;
		}
		const sourceModels = clampModels(selectedPreset.sourceModels);
		if (sourceModels.length === 0) {
			setErrorMessage("Select at least one model before saving this preset.");
			return;
		}
		setIsUpdatingCustomPreset(true);
		setErrorMessage(null);
		try {
			const saved = await saveExperimentsCouncilCustomPreset({
				id: selectedPreset.id,
				name: selectedPreset.name,
				description: selectedPreset.description,
				sourceModels,
				synthesisModelSlug: sourceModels[0] ?? null,
				createdAt: selectedPreset.createdAt,
				updatedAt: selectedPreset.updatedAt,
			});
			setPresets((current) =>
				current.map((row) =>
					row.sourceStore === "custom_presets" && row.id === saved.id
						? toCustomPresetOption(saved)
						: row,
				),
			);
			setDirtyCustomPresetIds((current) =>
				current.filter((id) => id !== (saved.id as number)),
			);
		} catch {
			setErrorMessage("Failed to update preset.");
		} finally {
			setIsUpdatingCustomPreset(false);
		}
	};

	const deleteSelectedCustomPreset = async () => {
		if (!selectedPreset || selectedPreset.sourceStore !== "custom_presets" || !selectedPreset.id) {
			return;
		}
		setIsDeletingCustomPreset(true);
		setErrorMessage(null);
		try {
			await deleteExperimentsCouncilCustomPreset(selectedPreset.id);
			const deletedId = selectedPreset.id;
			setDirtyCustomPresetIds((current) => current.filter((id) => id !== deletedId));
			const filtered = presets.filter(
				(row) => !(row.sourceStore === "custom_presets" && row.id === deletedId),
			);
			setPresets(filtered);
			const fallbackSelection = filtered.find(
				(row) => row.sourceStore === "presets" && row.key === "custom",
			);
			setSelectedPresetRef(
				fallbackSelection ? getPresetRef(fallbackSelection) : filtered[0] ? getPresetRef(filtered[0]) : null,
			);
		} catch {
			setErrorMessage("Failed to delete preset.");
		} finally {
			setIsDeletingCustomPreset(false);
		}
	};

	const updateRunSynthesisModel = async (
		run: ExperimentsCouncilRunRecord,
		modelId: string,
	) => {
		if (!run.id) return;
		setPendingSynthesisModelByRunId((current) => ({
			...current,
			[run.id as number]: modelId,
		}));
		const updated = await saveExperimentsCouncilRun({
			...run,
			synthesisedModelSlug: modelId,
			updatedAt: new Date().toISOString(),
		});
		setRuns((current) => current.map((row) => (row.id === updated.id ? updated : row)));
	};

	const openRunById = (runId: number | null) => {
		setSelectedRunId(runId);
		setSelectedSourceModelId(null);
		setErrorMessage(null);
		if (runId == null) {
			router.push(routeBasePath);
			return;
		}
		router.push(`${routeBasePath}/${runId}`);
	};

	const toggleRunSelection = (runId: number) => {
		setSelectedRunIds((current) => {
			const next = new Set(current);
			if (next.has(runId)) next.delete(runId);
			else next.add(runId);
			return next;
		});
	};

	const deleteSelectedRuns = async () => {
		const ids = [...selectedRunIds];
		await Promise.all(ids.map((id) => deleteExperimentsCouncilRun(id)));
		setRuns((current) => current.filter((run) => run.id == null || !selectedRunIds.has(run.id)));
		if (selectedRunId != null && selectedRunIds.has(selectedRunId)) openRunById(null);
		setSelectedRunIds(new Set());
		setRunEditMode(false);
	};

	const openInChat = (modelId: string, text: string) => {
		window.location.assign(
			`/chat?model=${encodeURIComponent(modelId)}&prompt=${encodeURIComponent(text)}`,
		);
	};

	const createRun = async () => {
		if (!selectedPreset) return;
		const sourceModels = clampModels(selectedPreset.sourceModels);
		if (prompt.trim().length === 0 || sourceModels.length === 0) return;
		setCreatingRun(true);
		setErrorMessage(null);

		const preferredSynthesisModel = selectedPreset.synthesisModelSlug ?? sourceModels[0] ?? null;

		const localDraft: Omit<ExperimentsCouncilRunRecord, "id"> = {
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			remoteRunId: null,
			isComplete: false,
			isSynthesised: false,
			modelSlugs: sourceModels,
			presetId: selectedPreset.sourceStore === "presets" ? (selectedPreset.id ?? null) : null,
			originalPrompt: prompt.trim(),
			responsesByModel: {},
			analysisFindings: null,
			synthesisedContent: null,
			synthesisedModelSlug: preferredSynthesisModel,
			sourceResults: [],
			status: "local_pending",
			error: null,
			runSnapshot: null,
		};

		let working = await createExperimentsCouncilRun(localDraft);
		setRuns((current) => [working, ...current]);
		openRunById(working.id ?? null);
		setSelectedSourceModelId(null);

		const persist = async (patch: Partial<ExperimentsCouncilRunRecord>) => {
			working = await saveExperimentsCouncilRun({ ...working, ...patch, updatedAt: new Date().toISOString() });
			setRuns((current) => current.map((row) => (row.id === working.id ? working : row)));
		};

		try {
			await persist({ status: "running_sources" });
			const sourceResultBuffer: Array<
				ExperimentsCouncilRunRecord["sourceResults"][number] | undefined
			> = new Array(sourceModels.length);
			let sourcePersistQueue = Promise.resolve();

			const sourceResults = await Promise.all(
				sourceModels.map(async (model_id, child_index) => {
					const started = performance.now();
					const result = await callResponsesText(model_id, prompt.trim());
					const latency_ms = Math.max(1, Math.round(performance.now() - started));
					const row = !result.ok
						? {
								child_index,
								model_id,
								status: "failed" as const,
								output_text: null,
								output_tokens: null,
								latency_ms,
								error: result.error,
							}
						: {
								child_index,
								model_id,
								status: "completed" as const,
								output_text: result.text || null,
								output_tokens: result.outputTokens,
								latency_ms,
								error: null,
							};
					sourceResultBuffer[child_index] = row;

					const snapshot = sourceResultBuffer.filter(
						(entry): entry is ExperimentsCouncilRunRecord["sourceResults"][number] =>
							Boolean(entry),
					);
					sourcePersistQueue = sourcePersistQueue.then(async () => {
						await persist({
							status: "running_sources",
							sourceResults: snapshot,
							responsesByModel: Object.fromEntries(
								snapshot
									.filter((entry) => entry.status === "completed" && Boolean(entry.output_text))
									.map((entry) => [entry.model_id, entry.output_text as string]),
							),
							error: snapshot.some((entry) => entry.status === "failed")
								? "One or more source models failed."
								: null,
						});
					});
					await sourcePersistQueue;
					return row;
				}),
			);
			await sourcePersistQueue;

			const successful = sourceResults.filter((row) => row.status === "completed" && row.output_text);
			if (successful.length < 2) {
				await persist({ status: "failed", isComplete: true, sourceResults, error: "Insufficient source quorum." });
				setErrorMessage("Insufficient source quorum.");
				return;
			}

			await persist({
				status: "awaiting_synthesis",
				isComplete: false,
				isSynthesised: false,
				sourceResults,
				responsesByModel: Object.fromEntries(
					successful.map((row) => [row.model_id, row.output_text as string]),
				),
				analysisFindings: null,
				synthesisedContent: null,
				error: sourceResults.some((row) => row.status === "failed")
					? "One or more source models failed."
					: null,
			});
			const defaultSynthesisModel =
				preferredSynthesisModel ?? successful[0]?.model_id ?? sourceModels[0] ?? null;
			if (working.id && defaultSynthesisModel) {
				setPendingSynthesisModelByRunId((current) => ({
					...current,
					[working.id as number]: defaultSynthesisModel,
				}));
			}
			setSelectedSourceModelId(null);
			setPrompt("");
		} catch {
			await persist({ status: "failed", isComplete: true, error: "Failed to create run." });
			setErrorMessage("Failed to create run.");
		} finally {
			setCreatingRun(false);
		}
	};

	const retryFailedSources = async (runId: number) => {
		const run = runs.find((row) => row.id === runId);
		if (!run) return;

		const failedModelIds = run.sourceResults
			.filter((row) => row.status === "failed")
			.map((row) => row.model_id);
		if (failedModelIds.length === 0) return;

		setErrorMessage(null);
		setRetryingRunId(runId);

		let working = run;
		const persist = async (patch: Partial<ExperimentsCouncilRunRecord>) => {
			working = await saveExperimentsCouncilRun({
				...working,
				...patch,
				updatedAt: new Date().toISOString(),
			});
			setRuns((current) =>
				current.map((row) => (row.id === working.id ? working : row)),
			);
		};

		try {
			await persist({
				status: "running_sources",
				isComplete: false,
				error: null,
			});

			const retryEntries = await Promise.all(
				failedModelIds.map(async (model_id) => {
					const started = performance.now();
					const result = await callResponsesText(model_id, run.originalPrompt);
					const latency_ms = Math.max(1, Math.round(performance.now() - started));
					if (!result.ok) {
						return {
							model_id,
							status: "failed" as const,
							output_text: null,
							output_tokens: null,
							latency_ms,
							error: result.error,
						};
					}
					return {
						model_id,
						status: "completed" as const,
						output_text: result.text || null,
						output_tokens: result.outputTokens,
						latency_ms,
						error: null,
					};
				}),
			);

			const retryByModel = new Map(
				retryEntries.map((entry) => [entry.model_id, entry]),
			);
			const nextSourceResults = run.modelSlugs.map((model_id, child_index) => {
				const retried = retryByModel.get(model_id);
				if (retried) {
					return { ...retried, child_index };
				}
				const existing = run.sourceResults.find((row) => row.model_id === model_id);
				if (existing) {
					return { ...existing, child_index };
				}
				return {
					child_index,
					model_id,
					status: "failed" as const,
					output_text: null,
					output_tokens: null,
					latency_ms: 0,
					error: "No response.",
				};
			});

			const successful = nextSourceResults.filter(
				(row) => row.status === "completed" && Boolean(row.output_text),
			);
			const hasFailures = nextSourceResults.some((row) => row.status === "failed");
			const nextStatus: CouncilRunStatus =
				successful.length >= 2 ? "awaiting_synthesis" : "failed";

			await persist({
				status: nextStatus,
				isComplete: nextStatus === "failed",
				isSynthesised: false,
				sourceResults: nextSourceResults,
				responsesByModel: Object.fromEntries(
					successful.map((row) => [row.model_id, row.output_text as string]),
				),
				analysisFindings: null,
				synthesisedContent: null,
				runSnapshot: null,
				error:
					nextStatus === "failed"
						? "Insufficient source quorum."
						: hasFailures
							? "One or more source models failed."
							: null,
			});
		} catch {
			setErrorMessage("Failed to retry source models.");
		} finally {
			setRetryingRunId((current) => (current === runId ? null : current));
		}
	};

	const synthesizeRun = async (runId: number) => {
		const run = runs.find((row) => row.id === runId);
		if (!run) return;
		const sourceResults = run.sourceResults ?? [];
		const successful = sourceResults.filter((row) => row.status === "completed" && row.output_text);
		if (successful.length < 2) {
			setErrorMessage("Insufficient source quorum.");
			return;
		}
		const synthesisModel =
			(pendingSynthesisModelByRunId[runId] ??
				run.synthesisedModelSlug ??
				run.modelSlugs[0] ??
				modelOptions[0] ??
				"").trim();
		if (!synthesisModel) {
			setErrorMessage("Select a synthesis model first.");
			return;
		}

		setErrorMessage(null);
		setSynthesisingRunId(runId);
		setStreamedSynthesisByRunId((current) => ({ ...current, [runId]: "" }));

		let working = run;
		const persist = async (patch: Partial<ExperimentsCouncilRunRecord>) => {
			working = await saveExperimentsCouncilRun({ ...working, ...patch, updatedAt: new Date().toISOString() });
			setRuns((current) => current.map((row) => (row.id === working.id ? working : row)));
		};

		try {
			await persist({
				status: "running_analysis",
				isComplete: false,
				isSynthesised: false,
				synthesisedModelSlug: synthesisModel,
				synthesisedContent: null,
				error: null,
			});
			const analysisPrompt = `## Original Question\n${run.originalPrompt}\n\n## Individual Model Responses\n${successful.map((row, index) => `### source_${index + 1} (${row.model_id})\n${row.output_text ?? "[no output]"}`).join("\n\n")}\n\n## Instructions\nReturn strict JSON only (no markdown) with top-level keys:\n- agreement: [{ point, supporting_models, confidence }]\n- key_differences: [{ topic, stances, material }]\n- partial_coverage: [{ models, point }]\n- unique_insights: [{ model, insight }]\n- blind_spots: [string]\n\nDo not omit keys.`;
			const analysisResult = await runAnalysisWithRepair(synthesisModel, analysisPrompt);
			if (!analysisResult.ok) {
				await persist({ status: "failed", isComplete: true, error: analysisResult.error });
				setErrorMessage(analysisResult.error);
				return;
			}
			const analysis = analysisResult.analysis;

			await persist({
				status: "running_fusion",
				analysisFindings: analysis as unknown as Record<string, unknown>,
			});
			const fusionPrompt = `## Original Question\n${run.originalPrompt}\n\n## Individual Model Responses\n${successful.map((row, index) => `### source_${index + 1} (${row.model_id})\n${row.output_text ?? "[no output]"}`).join("\n\n")}\n\n## Pre-Synthesis Analysis\n${JSON.stringify(analysis, null, 2)}\n\n## Instructions\nWrite one coherent final answer in Markdown.`;
			const fusionResult = await callResponsesStream(
				synthesisModel,
				fusionPrompt,
				(delta) => {
					setStreamedSynthesisByRunId((current) => ({
						...current,
						[runId]: `${current[runId] ?? ""}${delta}`,
					}));
				},
			);
			if (!fusionResult.ok) {
				await persist({ status: "failed", isComplete: true, error: fusionResult.error });
				setErrorMessage(fusionResult.error);
				return;
			}
			const finalStatus: CouncilRunStatus = sourceResults.some((row) => row.status === "failed") ? "partial" : "completed";
			const sourceOutputTokens = sourceResults.reduce((sum, row) => {
				return sum + (typeof row.output_tokens === "number" ? row.output_tokens : 0);
			}, 0);
			const runSnapshot: CouncilRun = {
				id: `local-${run.id ?? Date.now()}`,
				status: finalStatus,
				original_prompt: run.originalPrompt,
				source_model_ids: run.modelSlugs,
				analyser_model_id: synthesisModel,
				fuser_model_id: synthesisModel,
				source_results: sourceResults,
				analysis_json: analysis,
				final_answer_markdown: fusionResult.text,
				error: null,
				total_input_tokens: 0,
				total_output_tokens: sourceOutputTokens,
				updated_at: new Date().toISOString(),
			};
			await persist({
				status: finalStatus,
				isComplete: true,
				isSynthesised: true,
				analysisFindings: analysis as unknown as Record<string, unknown>,
				synthesisedContent: fusionResult.text,
				synthesisedModelSlug: synthesisModel,
				runSnapshot: runSnapshot as unknown as Record<string, unknown>,
				error: null,
			});
		} catch {
			await persist({ status: "failed", isComplete: true, error: "Failed to synthesise run." });
			setErrorMessage("Failed to synthesise run.");
		} finally {
			setSynthesisingRunId((current) => (current === runId ? null : current));
			setStreamedSynthesisByRunId((current) => {
				const next = { ...current };
				delete next[runId];
				return next;
			});
		}
	};

	return (
		<SidebarProvider contained defaultOpen className="flex h-full min-h-0 flex-1 overflow-hidden [&_button]:rounded-md">
			<Sidebar className="h-full min-h-0 bg-background" layout="inline">
				<SidebarHeader className="h-[57px] gap-0 border-b border-border px-0 py-0">
					<div className="flex h-full min-w-0 items-center px-0">
						{routeBasePath === "/chat/fusion" ? (
							<ChatRoomSwitcher className="min-w-0 flex-1" />
						) : null}
					</div>
				</SidebarHeader>
				<SidebarContent className="min-h-0 gap-0 overflow-hidden">
				<div data-chat-sidebar-actions="true" className={CHAT_SIDEBAR_ACTIONS_CLASS}>
					<Button
						variant="ghost"
						className="h-8 w-full justify-start gap-2 px-2 text-sm font-medium"
						onClick={() => {
							openRunById(null);
						}}
						aria-label="New Fusion"
					>
						<SquarePen className="h-4 w-4 shrink-0" />
						New Fusion
					</Button>
					<Button
						variant="ghost"
						className="h-8 w-full justify-start gap-2 px-2 text-sm font-medium"
						onClick={() => setSearchOpen(true)}
						aria-label="Search Fusions"
					>
						<Search className="h-4 w-4 shrink-0" />
						Search Fusions
					</Button>
				</div>
					<SidebarGroup className={cn("flex min-h-0 flex-1", CHAT_SIDEBAR_HISTORY_GROUP_CLASS)}>
						<div className="flex h-8 items-center justify-between px-2">
							<SidebarGroupLabel className="px-0">Recent Fusions</SidebarGroupLabel>
							{runs.length > 0 ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
									onClick={() => {
										setRunEditMode((current) => !current);
										setSelectedRunIds(new Set());
									}}
								>
									{runEditMode ? "Done" : "Edit"}
								</Button>
							) : null}
						</div>
						{runEditMode ? (
							<div className="mx-2 mb-1 flex h-8 items-center rounded-md border border-border/70 bg-muted/25 p-0.5">
								<Button
									type="button"
									variant="destructive"
									size="sm"
									className="h-7 w-full px-1.5 text-xs"
									disabled={selectedRunIds.size === 0}
									onClick={() => void deleteSelectedRuns()}
								>
									<Trash2 className="mr-1 h-3.5 w-3.5" />
									Delete {selectedRunIds.size > 0 ? selectedRunIds.size : ""}
								</Button>
							</div>
						) : null}
						<SidebarGroupContent className="flex min-h-0 flex-1">
							<ScrollArea className="min-h-0 flex-1 pr-2">
								<SidebarMenu className="space-y-1">
									{runs.length === 0 ? (
										<div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
											No stored runs yet.
										</div>
									) : (
										runs.map((run) => (
											<SidebarMenuItem key={run.id}>
												<SidebarMenuButton
													isActive={run.id != null && (runEditMode ? selectedRunIds.has(run.id) : run.id === selectedRunId)}
													onClick={() => {
														if (run.id == null) return;
														if (runEditMode) toggleRunSelection(run.id);
														else openRunById(run.id);
													}}
													className="h-auto gap-2 rounded-md py-2"
												>
													{runEditMode ? (
														<span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", run.id != null && selectedRunIds.has(run.id) ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent")}>
															<Check className="h-3 w-3" />
														</span>
													) : null}
													<div className="w-full space-y-1">
														<p className="line-clamp-2 text-xs font-medium leading-4">{run.originalPrompt}</p>
														<div className="flex items-center justify-between text-[10px] text-muted-foreground">
															<span className="inline-flex items-center gap-1">
																<Clock3 className="h-3 w-3" />
																{formatRunTime(run.createdAt)}
															</span>
															<span>{displayStatus(run.status)}</span>
														</div>
													</div>
												</SidebarMenuButton>
											</SidebarMenuItem>
										))
									)}
								</SidebarMenu>
							</ScrollArea>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>
			</Sidebar>

			<SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
				<header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-3 md:px-5">
					<div className="flex min-w-0 flex-1 items-center gap-1">
						<SidebarTrigger className="group -ml-1" />
						{selectedRun ? (
							<p className="truncate text-sm font-medium leading-8">Fusion result</p>
						) : (
							<>
								<RoomModelSelector
									models={availableModels}
									selectedModelIds={selectedPreset?.sourceModels ?? []}
									onSelectModel={(modelId) => {
										const current = selectedPreset?.sourceModels ?? [];
										if (current.includes(modelId) || current.length >= 4) return;
										void updatePresetModels([...current, modelId]);
									}}
									onRemoveModel={(modelId) => {
										void updatePresetModels(
											(selectedPreset?.sourceModels ?? []).filter((id) => id !== modelId),
										);
									}}
									onRemoveAllModels={() => void updatePresetModels([])}
								/>
								<div className="hidden">
							<Popover>
								<PopoverTrigger asChild>
									<Button variant="outline" className="h-9 gap-2 rounded-md px-2.5">
										<div className="flex -space-x-1.5">
											{(selectedPreset?.sourceModels ?? []).slice(0, 3).map((model) => (
											<span key={model} className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-background bg-muted">
													<Logo
														id={getOptionLogoId(model)}
														alt=""
														width={12}
														height={12}
														className="h-3 w-3 rounded-none object-contain"
													/>
												</span>
											))}
										</div>
										<span className="text-sm">{selectedPreset?.sourceModels.length ?? 0} models</span>
										<ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
									</Button>
								</PopoverTrigger>
								<PopoverContent align="start" className="w-[min(92vw,380px)] rounded-md p-3">
									<div className="space-y-4">
										<div>
											<p className="text-sm font-medium">Fusion models</p>
											<p className="text-xs text-muted-foreground">Choose two to four perspectives.</p>
										</div>
										<div className="flex flex-wrap gap-1">
											{corePresets.map((preset) => (
												<Button
													key={getPresetRef(preset)}
													type="button"
													variant={selectedPreset && getPresetRef(selectedPreset) === getPresetRef(preset) ? "secondary" : "ghost"}
													size="sm"
													className="h-7 rounded-md px-2 text-xs"
													onClick={() => setSelectedPresetRef(getPresetRef(preset))}
												>
													{preset.name}
												</Button>
											))}
										</div>
										<div className="space-y-1.5">
											{(selectedPreset?.sourceModels ?? []).map((model, index) => (
												<div key={`${model}-${index}`} className="flex items-center gap-2 rounded-md border border-border p-1.5">
											<Logo id={getOptionLogoId(model)} alt="" width={16} height={16} className="h-4 w-4 rounded-none object-contain" />
													<ModelSearchSelect
														value={model}
														options={modelOptions}
														onSelect={(next) => void updatePresetModels((selectedPreset?.sourceModels ?? []).map((entry, itemIndex) => itemIndex === index ? next : entry))}
														getLabel={getLabel}
														getLogoIdForOption={getOptionLogoId}
														isFavorite={isFavoriteModel}
														className="h-7 min-w-0 flex-1 justify-start border-0 px-1 shadow-none"
													/>
													<Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-md" onClick={() => removePresetModel(index)} aria-label={`Remove ${getLabel(model)}`}>
														<X className="h-3.5 w-3.5" />
													</Button>
												</div>
											))}
										</div>
										{(selectedPreset?.sourceModels.length ?? 0) < 4 ? (
											<ModelSearchSelect
												value=""
												options={modelOptions.filter((model) => !(selectedPreset?.sourceModels ?? []).includes(model))}
												onSelect={(next) => void updatePresetModels([...(selectedPreset?.sourceModels ?? []), next])}
												getLabel={getLabel}
												getLogoIdForOption={getOptionLogoId}
												isFavorite={isFavoriteModel}
												placeholder="Search and add model"
												className="w-full justify-start rounded-md"
											/>
										) : null}
									</div>
								</PopoverContent>
							</Popover>
								</div>
							</>
						)}
					</div>
				</header>
				<div
					className={cn(
						"mx-auto flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 lg:px-8",
						selectedRun ? (sourceModelForView ? "max-w-5xl" : "max-w-4xl") : "max-w-[1600px]",
					)}
				>
					{routeBasePath === "/chat/fusion" ? (
						<div className="-mx-2 mb-4 md:hidden">
							<ChatRoomSwitcher />
						</div>
					) : null}
					<div className="mb-4 flex items-center gap-2 md:hidden">
						<Popover open={mobileRunPickerOpen} onOpenChange={setMobileRunPickerOpen}>
							<PopoverTrigger asChild>
								<Button
									type="button"
									variant="outline"
									className="h-9 min-w-0 flex-1 justify-between"
								>
									<span className="truncate text-sm">{mobileRunTriggerLabel}</span>
									<ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
								</Button>
							</PopoverTrigger>
							<PopoverContent align="start" className="w-[min(92vw,420px)] p-0">
								<Command>
									<CommandInput placeholder="Search council runs..." />
									<CommandList>
										<CommandEmpty>No stored runs yet.</CommandEmpty>
										<CommandGroup heading="Recent Runs">
											{runs.map((run) => (
												<CommandItem
													key={`mobile-run-${run.id}`}
													value={`${run.originalPrompt} ${displayStatus(run.status)} ${formatRunTime(run.createdAt)}`}
													onSelect={() => {
														if (run.id == null) return;
														setMobileRunPickerOpen(false);
														openRunById(run.id);
													}}
												>
													<div className="min-w-0 flex-1">
														<p className="truncate text-xs font-medium">{run.originalPrompt}</p>
														<p className="text-[10px] text-muted-foreground">
															{displayStatus(run.status)} - {formatRunTime(run.createdAt)}
														</p>
													</div>
													<Check
														className={cn(
															"ml-2 h-3.5 w-3.5",
															run.id === selectedRunId ? "opacity-100" : "opacity-0",
														)}
													/>
												</CommandItem>
											))}
										</CommandGroup>
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="h-9 w-9 shrink-0"
							aria-label="New council run"
							onClick={() => {
								setMobileRunPickerOpen(false);
								openRunById(null);
							}}
						>
							<Plus className="h-4 w-4" />
						</Button>
					</div>
					{selectedRun ? (
						<div className="flex flex-col gap-5">
							<div className="space-y-1">
								<p className="text-xs font-medium text-muted-foreground">Prompt</p>
								<div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground">
									{selectedRun.originalPrompt}
								</div>
							</div>

							<div className="order-2 grid grid-cols-1 gap-5">
								<div className="flex flex-col-reverse gap-5">
									<div className="space-y-3">
										<div className="flex items-center justify-between">
											<p className="text-sm font-semibold">Step 1</p>
											<div className="flex items-center gap-2">
												{showStep2 && failedSourceCount > 0 ? (
													<Button
														type="button"
														variant="outline"
														size="sm"
														className="h-7 px-2 text-xs"
														onClick={() => {
															if (!selectedRun.id) return;
															void retryFailedSources(selectedRun.id);
														}}
														disabled={!selectedRun.id || runIsRetryingSources || synthesisBusy}
													>
														{runIsRetryingSources ? (
															<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
														) : (
															<RotateCcw className="mr-1.5 h-3.5 w-3.5" />
														)}
														Retry Failed
													</Button>
												) : null}
												<p className="text-xs text-muted-foreground">Run Source Models</p>
											</div>
										</div>
										<div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
											{displayStatus(selectedRun.status)} - {format.number(successfulSourceCount)} complete - {format.number(failedSourceCount)} failed - {format.number(totalSourceOutputTokens)} output tokens
										</div>
										<div className="space-y-2">
											{selectedRun.modelSlugs.map((modelId) => {
												const result = runSourceResults.find((row) => row.model_id === modelId) ?? null;
												const isActive = sourceModelForView === modelId;
												const isRetryingFailed = runIsRetryingSources && result?.status === "failed";
												const isPending = (!result && step1InFlight) || isRetryingFailed;
												const isFailed = result?.status === "failed";
												const isCompleted = result?.status === "completed" && Boolean(result.output_text);
												const outputTokens =
													typeof result?.output_tokens === "number" ? result.output_tokens : null;
												const statusLabel = isPending
													? "Running"
													: isCompleted
														? outputTokens !== null
													? `Complete (${format.number(outputTokens)} tokens, ${format.number((result?.latency_ms ?? 0) / 1000, { maximumFractionDigits: 1, notation: "standard" })}s)`
															: `Complete (${((result?.latency_ms ?? 0) / 1000).toFixed(1)}s)`
														: isFailed
															? "Failed"
															: "Queued";
												return (
													<button
														key={modelId}
														type="button"
														onClick={() => setSelectedSourceModelId(modelId)}
														className={cn(
															"w-full rounded-md border px-3 py-2 text-left transition-colors",
															isActive
																? "border-foreground/40 bg-muted"
																: "border-border bg-card hover:bg-muted/50",
														)}
													>
														<div className="flex items-center justify-between gap-3">
															<div className="flex min-w-0 items-center gap-1">
																<span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
																	<Logo
																		id={getLogoId(getOptionLogoId(modelId))}
																		alt={modelId}
																		width={14}
																		height={14}
																		className="h-3.5 w-3.5 rounded-none object-contain"
																	/>
																</span>
																<p className="truncate text-sm font-medium">{getLabel(modelId)}</p>
															</div>
															<ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
														</div>
														<div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
															{isPending ? (
																<RoomWorkingIndicator label="Running..." size={16} showLabel={false} />
															) : isFailed ? (
																<AlertCircle className="h-3.5 w-3.5 text-red-500" />
															) : isCompleted ? (
																<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
															) : (
																<Clock3 className="h-3.5 w-3.5" />
															)}
															<span>{statusLabel}</span>
														</div>
													</button>
												);
											})}
										</div>
									</div>

									{showStep2 ? (
										<>
											<div className="h-px w-full bg-border" />

											<div className="space-y-3">
												<div className="flex items-center justify-between">
													<p className="text-sm font-semibold">Step 2</p>
													<p className="text-xs text-muted-foreground">Choose Synthesiser and Analyse</p>
												</div>
												<div className="space-y-2">
													<p className="text-sm font-medium">Synthesis</p>
													<div className="flex items-center gap-2">
														<div className="min-w-0 flex-1">
															<ModelSearchSelect
																value={selectedRunSynthesisModel}
																options={modelOptions}
																onSelect={(next) => {
																	void updateRunSynthesisModel(selectedRun, next);
																}}
																getLabel={getLabel}
																getLogoIdForOption={getOptionLogoId}
																isFavorite={isFavoriteModel}
																getReleaseDate={getModelReleaseDate}
																placeholder="Select synthesis model"
																showSelectedLogoInTrigger
																className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2"
															/>
														</div>
														<Button
															className="shrink-0"
															onClick={() => {
																if (!selectedRun.id) return;
																void synthesizeRun(selectedRun.id);
															}}
															disabled={
																!selectedRun.id ||
																!selectedRunSynthesisModel ||
																successfulSourceCount < 2 ||
																synthesisBusy ||
																runIsRetryingSources
															}
														>
															{synthesisBusy ? <RoomWorkingIndicator label="Synthesising..." size={16} showLabel={false} /> : <Sparkles className="mr-2 h-4 w-4" />}
															{synthesisBusy ? "Synthesising" : selectedRun.isSynthesised ? "Re-synthesise" : "Synthesize"}
														</Button>
													</div>
													{showSynthesisError ? (
														<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
															Need at least two successful source responses before synthesis.
														</div>
													) : synthesisNeedsQuorum ? (
														<div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
															Synthesis unlocks after at least two source responses finish.
														</div>
													) : null}
												</div>

												{analysisSections ? (
													<div className="space-y-2">
														<div className="h-px w-full bg-border" />
														<p className="text-sm font-medium">Analysis</p>
														<div className="space-y-2">
															{analysisHasRenderableContent ? (
																<div className="space-y-2">
																	{analysisCategoryRows.map((section) => {
																		const isExpanded =
																			expandedAnalysisCategory === section.key;
																		const Icon =
																			section.key === "agreement"
																				? CheckCircle2
																				: section.key === "key_differences"
																					? AlertCircle
																					: section.key === "partial_coverage"
																						? Clock3
																						: section.key === "unique_insights"
																							? Sparkles
																							: X;
																		return (
																			<div
																				key={section.key}
																				className={cn(
																					"rounded-md border border-border bg-muted/30 p-3 transition-all duration-200",
																					isExpanded
																						? "shadow-sm ring-1 ring-zinc-200/70 dark:ring-zinc-700/60"
																						: "ring-0",
																				)}
																			>
																				<button
																					type="button"
																					className="w-full text-left"
																					aria-expanded={isExpanded}
																					onClick={() =>
																						setExpandedAnalysisCategory((current) =>
																							current === section.key ? null : section.key,
																						)
																					}
																				>
																					<div className="flex items-center justify-between gap-3 text-foreground">
																						<div className="flex min-w-0 items-center gap-2">
																							<Icon className="h-3.5 w-3.5 shrink-0" />
																							<p className="truncate text-sm font-medium">
																								{section.label}
																							</p>
																						</div>
																						<div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
																							<span>{section.points.length}</span>
																							<ChevronDown
																								className={cn(
																									"h-3.5 w-3.5 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
																									isExpanded ? "rotate-180" : "rotate-0",
																								)}
																							/>
																						</div>
																					</div>
																					{section.points.length > 0 ? (
																						<div className="relative mt-2">
																							<div
																								className={cn(
																									"grid transition-[grid-template-rows,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
																									isExpanded
																										? "pointer-events-none grid-rows-[0fr] -translate-y-0.5 opacity-0"
																										: "grid-rows-[1fr] translate-y-0 opacity-100",
																								)}
																							>
																								<p className="overflow-hidden truncate text-xs text-muted-foreground">
																									{section.points[0]}
																								</p>
																							</div>
																							<div
																								className={cn(
																									"grid transition-[grid-template-rows,opacity,transform] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
																									isExpanded
																										? "mt-1 grid-rows-[1fr] translate-y-0 opacity-100"
																										: "pointer-events-none grid-rows-[0fr] -translate-y-0.5 opacity-0",
																								)}
																							>
																								<ul className="ml-1 overflow-hidden list-inside list-disc space-y-1 text-xs text-foreground/80">
																									{section.points.map((point, index) => (
																										<li key={`${section.key}-${index}`}>{point}</li>
																									))}
																								</ul>
																							</div>
																						</div>
																					) : (
																						<p className="mt-2 text-xs text-muted-foreground">No points.</p>
																					)}
																				</button>
																			</div>
																		);
																	})}
																</div>
															) : (
																<div className="text-muted-foreground">
																	Analysis returned no structured findings for this run.
																</div>
															)}
														</div>
													</div>
												) : null}
											</div>
										</>
									) : null}
								</div>

								{sourceModelForView ? (
									<div className="hidden">
										<div className="flex items-center justify-between gap-3">
											<p className="text-sm font-medium">Selected Response</p>
											{sourceViewResult?.output_text ? (
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="h-7 w-7"
													onClick={() => setExpandedSourceDialogOpen(true)}
													aria-label="Expand selected response"
												>
													<Expand className="h-3.5 w-3.5" />
												</Button>
											) : null}
										</div>
										<div className="h-px w-full bg-border" />
										{sourceViewResult ? (
											<div className="space-y-3">
												<div className="max-h-[480px] overflow-auto p-1 text-sm leading-6">
													<Streamdown>{sourceViewResult.output_text ?? sourceViewResult.error ?? "No output yet."}</Streamdown>
												</div>
												{sourceViewResult.output_text ? (
													<Button
														variant="outline"
														onClick={() =>
															openInChat(
																sourceViewResult.model_id,
																`Continue this conversation from the source-model draft.\n\nOriginal question:\n${selectedRun.originalPrompt}\n\nDraft answer:\n${sourceViewResult.output_text}`,
															)
														}
													>
														Continue in Chat Room
														<ArrowRight className="h-4 w-4" />
													</Button>
												) : null}
											</div>
										) : (
											<div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
												Waiting for selected model output.
											</div>
										)}
										<Dialog
											open={expandedSourceDialogOpen}
											onOpenChange={setExpandedSourceDialogOpen}
										>
											<DialogContent className="w-[96vw] max-w-6xl max-h-[90vh] overflow-hidden p-0">
												<DialogTitle className="sr-only">Expanded Selected Response</DialogTitle>
												<DialogDescription className="sr-only">
													Wide view of the currently selected source model response.
												</DialogDescription>
												<div className="flex h-full max-h-[90vh] flex-col">
													<div className="border-b border-border px-4 py-3">
														<p className="text-sm font-medium">
															{sourceViewResult ? getLabel(sourceViewResult.model_id) : "Selected Response"}
														</p>
													</div>
													<div className="min-h-0 flex-1 overflow-auto px-4 py-3 text-sm leading-6">
														<Streamdown>
															{sourceViewResult?.output_text ?? sourceViewResult?.error ?? "No output yet."}
														</Streamdown>
													</div>
												</div>
											</DialogContent>
										</Dialog>
									</div>
								) : null}
							</div>

							{showStep3 ? (
								<div className="order-1 space-y-3">
									<div className="h-px w-full bg-border" />
									<div className="flex items-center justify-between">
										<p className="text-sm font-semibold">Step 3</p>
										<p className="text-xs text-muted-foreground">Final Answer</p>
									</div>
									<div className="space-y-3 rounded-md border border-border bg-card p-4">
										<div className="flex items-center justify-between gap-3">
											<div className="flex min-w-0 items-center gap-2">
											<span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background">
												<Logo
													id={getLogoId(getOptionLogoId(step3ModelId))}
													alt={step3ModelId}
													width={14}
													height={14}
													className="h-3.5 w-3.5 rounded-none object-contain"
												/>
											</span>
												<p className="truncate text-sm font-medium text-foreground">
													{step3ModelLabel}
												</p>
											</div>
											<div className="flex shrink-0 items-center gap-2">
											<div className="flex items-center">
												{fusedSourceModelIds.map((modelId, index) => (
													<HoverCard key={`fused-${modelId}-${index}`} openDelay={150} closeDelay={80}>
														<HoverCardTrigger asChild>
															<span
														key={`fused-${modelId}-${index}`}
														className={cn(
															"inline-flex h-5 w-5 cursor-default items-center justify-center rounded-md border border-border bg-background transition-transform hover:z-10 hover:-translate-y-0.5 hover:border-foreground/40",
															index > 0 ? "-ml-1.5" : "",
														)}
															tabIndex={0}
														>
															<Logo
																id={getLogoId(getOptionLogoId(modelId))}
																alt={modelId}
																width={10}
																height={10}
																className="h-2.5 w-2.5 rounded-none object-contain"
															/>
															</span>
														</HoverCardTrigger>
														<HoverCardContent side="top" align="center" className="w-64 rounded-md p-3">
															<div className="flex items-center gap-3">
																<span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
																	<Logo id={getLogoId(getOptionLogoId(modelId))} alt="" width={18} height={18} className="h-[18px] w-[18px] rounded-none object-contain" />
																</span>
																<div className="min-w-0">
																	<p className="truncate text-sm font-medium">{getLabel(modelId)}</p>
																	<p className="truncate text-xs text-muted-foreground">{modelMetaById.get(modelId)?.organisationName ?? modelId}</p>
																</div>
															</div>
														</HoverCardContent>
													</HoverCard>
												))}
												</div>
												<span
													className={cn(
														"inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
														synthesisBusy
															? "border-border bg-muted text-foreground"
															: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
													)}
												>
													{step3StatusLabel}
												</span>
											</div>
										</div>
										<div className="h-px w-full bg-border" />
										{displayedSynthesis ? (
											<ScrollArea
												className="h-[min(710px,60vh)] min-h-[360px]"
												viewportClassName="overscroll-contain p-1 pr-3 text-sm leading-6"
												viewportRef={(viewport) => {
													synthesisScrollRef.current = viewport;
												}}
											>
												<Streamdown>{displayedSynthesis}</Streamdown>
											</ScrollArea>
										) : (
											<div className="min-h-[460px] rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground lg:min-h-[360px]">
												{runReadyForSynthesis
													? "Choose a synthesis model in Step 2 and run synthesis."
													: selectedRun.status === "running_sources"
														? "Waiting for source models to finish."
														: selectedRun.status === "running_fusion"
															? "Generating fused answer."
															: "No synthesized output yet."}
											</div>
										)}
										{(selectedRun.synthesisedContent || displayedSynthesis) && !synthesisBusy ? (
											<Button
												onClick={() =>
													openInChat(
														selectedRun.synthesisedModelSlug ?? selectedRunSynthesisModel ?? selectedRun.modelSlugs[0] ?? DEFAULT_MODEL_OPTIONS[0],
														`Continue this conversation from the fused Council answer.\n\nOriginal question:\n${selectedRun.originalPrompt}\n\nFused answer:\n${selectedRun.synthesisedContent ?? displayedSynthesis ?? ""}`,
													)
												}
											>
												Continue in Chat Room
												<ArrowRight className="h-4 w-4" />
											</Button>
										) : null}
									</div>
								</div>
							) : null}

							{errorMessage ? (
								<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
									{errorMessage}
								</div>
							) : null}
						</div>
					) : isHydratingInitialRun ? (
						<div className="space-y-5">
							<div className="space-y-1">
								<div className="h-4 w-16 rounded-md bg-muted" />
								<div className="h-10 rounded-md border border-border bg-muted/30" />
							</div>
							<div className="space-y-3">
								<div className="h-5 w-14 rounded-md bg-muted" />
								<div className="h-10 rounded-md border border-border bg-muted/30" />
								<div className="h-14 rounded-md border border-border bg-muted/30" />
								<div className="h-14 rounded-md border border-border bg-muted/30" />
							</div>
							<div className="h-9 w-40 rounded-md bg-muted" />
						</div>
					) : (
						<div className={cn("mx-auto w-full max-w-3xl", shouldCenterComposer ? "flex flex-1 items-center" : "")}>
							<div className="w-full space-y-8">
								<div className="space-y-2 text-center">
									<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
										Good {dayPeriod}{firstName ? `, ${firstName}` : ""}
									</h1>
									<p className="text-sm text-muted-foreground">
										Bring several perspectives together in one answer.
									</p>
								</div>
								<div className="grid gap-2 sm:grid-cols-2">
									{[
										["Compare approaches", "Compare the strongest approaches to solving this problem, including tradeoffs."],
										["Challenge an idea", "Evaluate this idea from several perspectives and identify its weakest assumptions."],
										["Reach a recommendation", "Consider the available options and produce a clear, evidence-based recommendation."],
										["Explore a question", "Explore this question through several distinct expert perspectives."],
									].map(([label, starterPrompt]) => (
										<button
											key={label}
											type="button"
											onClick={() => setPrompt(starterPrompt)}
											className="group flex min-h-12 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											<span>{label}</span>
											<ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
										</button>
									))}
								</div>
								{errorMessage ? (
									<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
										{errorMessage}
									</div>
								) : null}
								<div className="hidden space-y-5">
									<div className="space-y-2">
										<div className="flex flex-wrap items-center gap-1">
											{corePresets.map((preset) => {
												const isActive =
													selectedPreset && getPresetRef(selectedPreset) === getPresetRef(preset);
												return (
													<Button
														key={getPresetRef(preset)}
														type="button"
														variant="ghost"
														size="sm"
														className={cn(
															"h-7 rounded-md px-2.5 text-xs",
															isActive
																? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
																: "text-muted-foreground hover:bg-muted hover:text-foreground",
														)}
														onClick={() => setSelectedPresetRef(getPresetRef(preset))}
													>
														{preset.name}
													</Button>
												);
											})}

											{customUserPresets.length > 0 ? (
												<>
													<span className="px-1 text-xs text-muted-foreground">|</span>
													{customUserPresets.map((preset) => {
														const isActive =
															selectedPreset && getPresetRef(selectedPreset) === getPresetRef(preset);
														return (
															<Button
																key={getPresetRef(preset)}
																type="button"
																variant="ghost"
																size="sm"
																className={cn(
																	"h-7 rounded-md px-2.5 text-xs",
																	isActive
																		? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
																		: "text-muted-foreground hover:bg-muted hover:text-foreground",
																)}
																onClick={() => setSelectedPresetRef(getPresetRef(preset))}
															>
																{preset.name}
															</Button>
														);
													})}
												</>
											) : null}

											{canSaveCustomPreset ||
											canUpdateSelectedCustomPreset ||
											canDeleteSelectedCustomPreset ? (
												<>
													<span className="px-1 text-xs text-muted-foreground">|</span>
													{isSavingPresetInline ? (
														<div className="inline-flex items-center gap-1">
															<Input
																value={presetNameDraft}
																onChange={(event) => setPresetNameDraft(event.target.value)}
																placeholder="Preset name"
																className="h-7 w-32 text-xs"
																onKeyDown={(event) => {
																	if (event.key === "Enter") {
																		event.preventDefault();
																		void createCustomPreset(presetNameDraft);
																	}
																	if (event.key === "Escape") {
																		event.preventDefault();
																		setIsSavingPresetInline(false);
																		setPresetNameDraft("");
																	}
																}}
															/>
															<Button
																type="button"
																variant="ghost"
																size="sm"
																className="h-7 rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
																onClick={() => {
																	void createCustomPreset(presetNameDraft);
																}}
																disabled={isCreatingCustomPreset || presetNameDraft.trim().length === 0}
																aria-label="Save custom preset"
															>
																{isCreatingCustomPreset ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
															</Button>
															<Button
																type="button"
																variant="ghost"
																size="sm"
																className="h-7 rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
																onClick={() => {
																	setIsSavingPresetInline(false);
																	setPresetNameDraft("");
																}}
																disabled={isCreatingCustomPreset}
																aria-label="Cancel saving preset"
															>
																<X className="h-3.5 w-3.5" />
															</Button>
														</div>
													) : (
														<>
															{canSaveCustomPreset ? (
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	className="h-7 gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
																	onClick={() => {
																		setIsSavingPresetInline(true);
																		setPresetNameDraft("My Preset");
																	}}
																>
																	<Save className="h-3 w-3" />
																	Save Group
																</Button>
															) : null}
															{canUpdateSelectedCustomPreset ? (
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	className="h-7 rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
																	onClick={() => {
																		void updateSelectedCustomPreset();
																	}}
																	disabled={isUpdatingCustomPreset || isDeletingCustomPreset}
																	aria-label="Update preset"
																>
																	{isUpdatingCustomPreset ? (
																		<Loader2 className="h-3.5 w-3.5 animate-spin" />
																	) : (
																		<Save className="h-3.5 w-3.5" />
																	)}
																</Button>
															) : null}
															{canDeleteSelectedCustomPreset ? (
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	className="h-7 rounded-md px-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
																	onClick={() => {
																		void deleteSelectedCustomPreset();
																	}}
																	disabled={isDeletingCustomPreset || isUpdatingCustomPreset}
																	aria-label="Delete preset"
																>
																	{isDeletingCustomPreset ? (
																		<Loader2 className="h-3.5 w-3.5 animate-spin" />
																	) : (
																		<Trash2 className="h-3.5 w-3.5" />
																	)}
																</Button>
															) : null}
														</>
													)}
												</>
											) : null}
										</div>
									</div>

									<div>
										<div className="flex flex-wrap items-center gap-2">
											{(selectedPreset?.sourceModels ?? []).map((model, index) => (
												<div key={`${index}-${model}`} className="group inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
													<span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-border bg-background">
														<Logo
															id={getLogoId(
																pickLogoId(
																	modelMetaById.get(model)?.organisationId ?? null,
																	modelMetaById.get(model)?.providerId ?? "unknown",
																),
															)}
															alt={model}
															width={12}
															height={12}
																	className="h-3 w-3 rounded-none object-contain"
														/>
													</span>
													<ModelSearchSelect
														value={model}
														options={modelOptions}
														onSelect={(next) => {
															const updated = (selectedPreset?.sourceModels ?? []).map((entry, i) => (i === index ? next : entry));
															void updatePresetModels(updated);
														}}
														getLabel={getLabel}
														getLogoIdForOption={getOptionLogoId}
														isFavorite={isFavoriteModel}
														showChevron={false}
														className="h-6 min-w-0 w-auto border-0 bg-transparent px-0 text-sm shadow-none hover:bg-transparent"
													/>
													<Button
														type="button"
														size="icon"
														variant="ghost"
														className="h-5 w-0 overflow-hidden rounded-md p-0 opacity-0 transition-all duration-150 group-hover:w-5 group-hover:opacity-100 group-focus-within:w-5 group-focus-within:opacity-100 focus-visible:w-5 focus-visible:opacity-100"
														onClick={() => removePresetModel(index)}
													>
														<X className="h-3 w-3" />
													</Button>
												</div>
											))}
											{(selectedPreset?.sourceModels.length ?? 0) < 4 ? (
												<div className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-border bg-muted/30 px-2 py-1">
													<ModelSearchSelect
														value=""
														options={modelOptions.filter((option) => !(selectedPreset?.sourceModels ?? []).includes(option))}
														onSelect={(next) => {
															const current = clampModels(selectedPreset?.sourceModels ?? []);
															void updatePresetModels([...current, next]);
														}}
														getLabel={getLabel}
														getLogoIdForOption={getOptionLogoId}
														isFavorite={isFavoriteModel}
														showChevron={false}
														placeholder="Search and add model"
														className="h-6 min-w-0 w-auto px-0 text-sm"
													/>
												</div>
											) : null}
										</div>
									</div>

										{errorMessage ? (
											<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
												{errorMessage}
											</div>
										) : null}
								</div>
							</div>
						</div>
					)}
					{selectedRun ? <AIGeneratedNotice className="mt-4" /> : null}
				</div>
				{!selectedRun && !isHydratingInitialRun ? (
					<RoomComposerFooter>
						<div className="mx-auto w-full max-w-3xl">
							<RoomComposerSurface className="flex items-end gap-2 p-2">
								<Textarea
									id="experiments-prompt"
									value={prompt}
									onChange={(event) => setPrompt(event.target.value)}
									onKeyDown={(event) => {
										if (event.key !== "Enter" || event.shiftKey) return;
										if ((event.nativeEvent as KeyboardEvent).isComposing) return;
										event.preventDefault();
										void createRun();
									}}
									placeholder="Ask anything"
									rows={1}
									className="min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0"
								/>
								<Button
									size="icon"
									className="h-8 w-8 shrink-0 rounded-md"
									onClick={createRun}
									disabled={
										creatingRun ||
										!selectedPreset ||
										(selectedPreset.sourceModels?.length ?? 0) === 0 ||
										prompt.trim().length === 0
									}
									aria-label={creatingRun ? "Starting run" : "Send prompt"}
								>
									{creatingRun ? (
										<RoomWorkingIndicator label="Starting fusion..." showLabel={false} />
									) : (
										<SendHorizontal className="h-4 w-4" />
									)}
								</Button>
							</RoomComposerSurface>
						</div>
					</RoomComposerFooter>
				) : null}
			</SidebarInset>
			<ProviderInspectorSheet
				open={Boolean(sourceModelForView)}
				onOpenChange={(open) => {
					if (!open) setSelectedSourceModelId(null);
				}}
			>
				<ProviderInspectorSheetContent
					className="w-[min(92vw,42rem)] max-w-none gap-0 p-0 sm:max-w-2xl"
				>
					<ProviderInspectorSheetHeader className="border-b border-border/70 px-5 py-4 pr-14 text-left">
						<div className="flex min-w-0 items-center gap-3">
							<span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background">
								{sourceModelForView ? (
									<Logo
										id={getLogoId(getOptionLogoId(sourceModelForView))}
										alt=""
										width={18}
										height={18}
										className="h-[18px] w-[18px] rounded-none object-contain"
									/>
								) : null}
							</span>
							<div className="min-w-0">
								<ProviderInspectorSheetTitle className="truncate">
									{sourceModelForView ? getLabel(sourceModelForView) : "Model response"}
								</ProviderInspectorSheetTitle>
								<ProviderInspectorSheetDescription>
									{sourceViewResult?.status === "completed"
										? `${sourceViewResult.output_tokens != null ? format.number(sourceViewResult.output_tokens) : "—"} output tokens · ${format.number((sourceViewResult.latency_ms ?? 0) / 1000, { maximumFractionDigits: 1, notation: "standard" })}s`
										: sourceViewResult?.status === "failed"
											? "Generation failed"
											: "Generating response…"}
								</ProviderInspectorSheetDescription>
							</div>
						</div>
					</ProviderInspectorSheetHeader>
					<ScrollArea className="min-h-0 flex-1" viewportClassName="overscroll-y-contain">
						<div className="px-5 py-5 text-sm leading-7">
							{sourceViewResult ? (
								<Streamdown>
									{sourceViewResult.output_text ?? sourceViewResult.error ?? "No output yet."}
								</Streamdown>
							) : (
								<div className="flex min-h-48 items-center justify-center text-muted-foreground">
									<RoomWorkingIndicator label="Waiting for response..." />
								</div>
							)}
						</div>
					</ScrollArea>
					{sourceViewResult?.output_text && selectedRun ? (
						<div className="mt-auto border-t border-border px-5 py-4">
							<Button
								variant="outline"
								className="w-full justify-between rounded-md"
								onClick={() =>
									openInChat(
										sourceViewResult.model_id,
										`Continue this conversation from the source-model draft.\n\nOriginal question:\n${selectedRun.originalPrompt}\n\nDraft answer:\n${sourceViewResult.output_text}`,
									)
								}
							>
								Continue in Chat Room
								<ArrowRight className="h-4 w-4" />
							</Button>
						</div>
					) : null}
				</ProviderInspectorSheetContent>
			</ProviderInspectorSheet>
			<RoomSearchDialog
				open={searchOpen}
				onOpenChange={setSearchOpen}
				title="Search fusions"
				placeholder="Search fusions..."
				emptyLabel="No fusions found."
				groupLabel="Fusions"
				conversations={runs.map((run) => ({
					id: String(run.id),
					title: run.originalPrompt,
				}))}
				onSelectConversation={(conversation) => {
					const runId = Number(conversation.id);
					if (!Number.isFinite(runId)) return;
					setSearchOpen(false);
					openRunById(runId);
				}}
			/>
		</SidebarProvider>
	);
}
