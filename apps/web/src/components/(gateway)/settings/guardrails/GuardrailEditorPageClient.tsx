"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Check, ChevronLeft, Info, KeyRound, Trash2, X } from "lucide-react";

import {
	createGuardrail,
	deleteGuardrail,
	setGuardrailKeys,
	type SensitiveInfoAction,
	type SensitiveInfoCustomRulePayload,
	type SensitiveInfoRulePayload,
	updateGuardrail,
	type PromptInjectionAction,
	type ProviderRestrictionMode,
} from "@/app/(dashboard)/settings/guardrails/actions";
import {
	buildGuardrailRestrictionPreview,
	describeModelRestrictionMode,
	describeProviderRestrictionMode,
} from "./guardrailPreview";
import {
	buildSensitiveInfoPreview,
	getDefaultSensitiveInfoRules,
	getSensitiveInfoRuleDefinitions,
	normalizeSensitiveInfoAction,
	validateSensitiveInfoRulePayload,
} from "./sensitiveInfoPreview";

const NANOS_PER_USD = 1_000_000_000;

type ProviderOption = { id: string; name: string };
type ActiveProviderModel = {
	providerId: string;
	apiModelId: string;
	internalModelId: string | null;
	internalModelName?: string | null;
	organisationId?: string | null;
	organisationName?: string | null;
};
type KeyOption = { id: string; name: string; prefix: string; status: string };
type GuardrailHandlingState = "disabled" | PromptInjectionAction;

type GuardrailRow = {
	id: string;
	enabled?: boolean | null;
	name?: string | null;
	description?: string | null;
	privacy_enable_paid_may_train?: boolean | null;
	privacy_enable_free_may_train?: boolean | null;
	privacy_enable_free_may_publish_prompts?: boolean | null;
	privacy_enable_input_output_logging?: boolean | null;
	privacy_zdr_only?: boolean | null;
	provider_restriction_mode?: string | null;
	provider_restriction_provider_ids?: string[] | null;
	provider_restriction_enforce_allowed?: boolean | null;
	model_restriction_mode?: string | null;
	allowed_api_model_ids?: string[] | null;
	prompt_injection_enabled?: boolean | null;
	prompt_injection_action?: string | null;
	sensitive_info_enabled?: boolean | null;
	sensitive_info_default_action?: string | null;
	sensitive_info_rules?: SensitiveInfoRulePayload[] | null;
	daily_limit_requests?: number | null;
	weekly_limit_requests?: number | null;
	monthly_limit_requests?: number | null;
	daily_limit_cost_nanos?: number | null;
	weekly_limit_cost_nanos?: number | null;
	monthly_limit_cost_nanos?: number | null;
};

function normalizeMode(value: unknown): ProviderRestrictionMode {
	const raw = String(value ?? "none").toLowerCase();
	if (raw === "allowlist") return "allowlist";
	if (raw === "blocklist") return "blocklist";
	return "none";
}

function uniqStrings(items: string[]): string[] {
	return Array.from(new Set(items.filter(Boolean)));
}

function summarizeModelRestriction(args: {
	mode: ProviderRestrictionMode;
	selectedCount: number;
}): string {
	if (args.mode === "none") return "all models allowed";
	if (args.mode === "allowlist") {
		return args.selectedCount > 0
			? `${args.selectedCount} models allowlisted`
			: "no models allowlisted";
	}
	return args.selectedCount > 0
		? `${args.selectedCount} models blocked`
		: "no models blocked";
}

function getHandlingState(args: {
	enabled: boolean;
	action: PromptInjectionAction | SensitiveInfoAction;
}): GuardrailHandlingState {
	return args.enabled ? args.action : "disabled";
}

function buildModelAvailabilityReason(args: {
	modelAllowed: boolean;
	modelMode: ProviderRestrictionMode;
	selectedModelIds: string[];
	providerStates: PreviewModelProviderState[];
}): string | null {
	if (args.modelAllowed && args.providerStates.some((state) => state.accessible)) {
		return null;
	}
	if (!args.modelAllowed) {
		if (args.modelMode === "allowlist") {
			return args.selectedModelIds.length > 0
				? "Unavailable because this model is outside the current model allowlist."
				: "Unavailable because no models were selected in the current model allowlist.";
		}
		if (args.modelMode === "blocklist") {
			return "Unavailable because this model is included in the current model blocklist.";
		}
	}
	const uniqueReasons = uniqStrings(args.providerStates.map((state) => state.reason));
	if (uniqueReasons.length === 1) {
		return uniqueReasons[0] ?? "Unavailable because no provider remains reachable for this model.";
	}
	return "Unavailable because the current provider rules leave no reachable providers for this model.";
}

function normalizePromptInjectionAction(value: unknown): PromptInjectionAction {
	const raw = String(value ?? "flag").toLowerCase();
	if (raw === "redact") return "redact";
	if (raw === "block") return "block";
	return "flag";
}

function normalizeSensitiveInfoRules(
	value: SensitiveInfoRulePayload[] | null | undefined,
	defaultAction: SensitiveInfoAction,
): SensitiveInfoRulePayload[] {
	if (!Array.isArray(value) || value.length === 0) {
		return getDefaultSensitiveInfoRules(defaultAction);
	}
	const allowedIds = new Set(getSensitiveInfoRuleDefinitions().map((rule) => rule.id));
	const normalized: SensitiveInfoRulePayload[] = [];
	for (const rule of value) {
		if (rule.kind === "custom") {
			normalized.push({
				id: String(rule.id ?? "").trim(),
				kind: "custom",
				enabled: Boolean(rule.enabled),
				action: normalizeSensitiveInfoAction(rule.action),
				name: String(rule.name ?? "").trim(),
				pattern: String(rule.pattern ?? ""),
				flags:
					typeof rule.flags === "string" && rule.flags.trim().length > 0
						? rule.flags.trim().toLowerCase()
						: null,
			});
			continue;
		}
		if (!allowedIds.has(rule.id)) continue;
		normalized.push({
			id: rule.id,
			kind: "builtin",
			enabled: Boolean(rule.enabled),
			action: normalizeSensitiveInfoAction(rule.action),
		});
	}
	return normalized;
}

function createCustomSensitiveInfoRule(
	defaultAction: SensitiveInfoAction,
): SensitiveInfoCustomRulePayload {
	const id =
		typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID()
			: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	return {
		id,
		kind: "custom",
		enabled: true,
		action: defaultAction,
		name: "",
		pattern: "",
		flags: null,
	};
}

function getProviderLogoId(providerId: string): string {
	const id = String(providerId ?? "").trim();
	if (!id) return "cloudflare";
	const normalized = id.toLowerCase();
	if (normalized === "bedrock" || normalized.includes("bedrock")) {
		return "amazon-bedrock";
	}
	return normalized;
}

function formatModelPreviewTitle(args: {
	organisationName: string | null | undefined;
	organisationId: string | null | undefined;
	internalModelName: string | null | undefined;
	internalModelId: string | null | undefined;
	apiModelId: string;
}): string {
	const orgLabel =
		typeof args.organisationName === "string" && args.organisationName.trim().length > 0
			? args.organisationName.trim()
			: typeof args.organisationId === "string" && args.organisationId.trim().length > 0
				? args.organisationId.trim()
				: null;
	const modelLabel =
		typeof args.internalModelName === "string" && args.internalModelName.trim().length > 0
			? args.internalModelName.trim()
			: typeof args.internalModelId === "string" && args.internalModelId.trim().length > 0
				? args.internalModelId.split("/").slice(1).join("/").trim() ||
					args.internalModelId.trim()
				: args.apiModelId.trim();
	return orgLabel ? `${orgLabel}: ${modelLabel}` : modelLabel;
}

const formatUsdFromNanos = (value: number | null | undefined) =>
	typeof value === "number" && Number.isFinite(value) && value > 0
		? String(value / NANOS_PER_USD)
		: "";

const parseUsdToNanos = (value: string): number | null | undefined => {
	if (!value || value.trim().length === 0) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return undefined;
	return Math.round(parsed * NANOS_PER_USD);
};

const parseInteger = (value: string): number | null | undefined => {
	if (!value || value.trim().length === 0) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return undefined;
	return Math.floor(parsed);
};

function SelectionDialog(props: {
	title: string;
	description?: string;
	options: Array<{ value: string; label: string }>;
	selected: string[];
	onChange: (next: string[]) => void;
	renderLeading?: (opt: { value: string; label: string }) => React.ReactNode;
	trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	useEffect(() => {
		if (!open) return;
		setQuery("");
	}, [open]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return props.options;
		return props.options.filter(
			(opt) =>
				opt.label.toLowerCase().includes(q) ||
				opt.value.toLowerCase().includes(q),
		);
	}, [props.options, query]);

	const selectedSet = useMemo(() => new Set(props.selected), [props.selected]);
	const filteredValues = useMemo(() => filtered.map((opt) => opt.value), [filtered]);
	const allFilteredSelected =
		filteredValues.length > 0 && filteredValues.every((value) => selectedSet.has(value));

	function toggleSelection(value: string) {
		if (props.selected.includes(value)) {
			props.onChange(props.selected.filter((v) => v !== value));
			return;
		}
		props.onChange([...props.selected, value]);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{props.trigger}</DialogTrigger>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>{props.title}</DialogTitle>
					{props.description ? (
						<DialogDescription>{props.description}</DialogDescription>
					) : null}
				</DialogHeader>
				<div className="space-y-3">
					<Input
						placeholder="Search..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
						<div>{props.selected.length} selected</div>
						<div className="flex items-center gap-1">
							{filteredValues.length > 0 ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-auto px-2 py-1 text-xs"
									onClick={() =>
										props.onChange(
											allFilteredSelected
												? props.selected.filter(
														(value) => !filteredValues.includes(value),
												  )
												: uniqStrings([...props.selected, ...filteredValues]),
										)
									}
								>
									{allFilteredSelected ? "Deselect all" : "Select all"}
								</Button>
							) : null}
							{props.selected.length > 0 ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-auto px-2 py-1 text-xs"
									onClick={() => props.onChange([])}
								>
									Clear selection
								</Button>
							) : null}
						</div>
					</div>
					<div className="max-h-[340px] overflow-y-auto rounded-lg border bg-background">
						{filtered.length ? (
							<ul className="divide-y">
								{filtered.map((opt) => {
									const checked = selectedSet.has(opt.value);
									return (
										<li key={opt.value}>
											<button
												type="button"
												onClick={() => toggleSelection(opt.value)}
												className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors ${
													checked ? "bg-muted/40" : "hover:bg-muted/30"
												}`}
											>
												<div className="min-w-0 flex items-center gap-3">
													<div
														className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
															checked
																? "border-foreground bg-foreground text-background"
																: "border-border bg-background text-transparent"
														}`}
													>
														<Check className="h-3.5 w-3.5" />
													</div>
													{props.renderLeading ? (
														<span className="shrink-0">
															{props.renderLeading(opt)}
														</span>
													) : null}
													<div className="min-w-0">
														<div className="truncate text-sm font-medium">
															{opt.label}
														</div>
													</div>
												</div>
											</button>
										</li>
									);
								})}
							</ul>
						) : (
							<div className="p-6 text-sm text-muted-foreground">No matches.</div>
						)}
					</div>
				</div>
				<div className="flex justify-end">
					<Button type="button" variant="outline" onClick={() => setOpen(false)}>
						Done
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function ToggleRow(props: {
	label: string;
	description: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	flat?: boolean;
}) {
	if (props.flat) {
		return (
			<div className="flex items-center justify-between gap-4 py-4">
				<div className="min-w-0">
					<p className="text-sm font-medium">{props.label}</p>
					<p className="text-sm text-muted-foreground">{props.description}</p>
				</div>
				<Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />
			</div>
		);
	}

	return (
		<div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/10 px-3 py-2">
			<div className="min-w-0">
				<p className="text-sm font-medium">{props.label}</p>
				<p className="text-xs text-muted-foreground">{props.description}</p>
			</div>
			<Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />
		</div>
	);
}

function EditorSection(props: {
	title: string;
	description: string;
	children: React.ReactNode;
	compact?: boolean;
}) {
	if (props.compact) {
		return <section className="min-w-0 space-y-4">{props.children}</section>;
	}

	return (
		<section className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
			<div className="space-y-1">
				<h3 className="text-sm font-semibold">{props.title}</h3>
				<p className="text-sm text-muted-foreground">{props.description}</p>
			</div>
			<div className="min-w-0 space-y-4">{props.children}</div>
		</section>
	);
}

function BoundedSelectionList(props: {
	items: Array<{
		id: string;
		title: string;
		subtitle?: string;
		leading?: React.ReactNode;
		trailing?: React.ReactNode;
	}>;
	empty: string;
	heightClassName?: string;
	compact?: boolean;
}) {
	if (!props.items.length) {
		return (
			<div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
				{props.empty}
			</div>
		);
	}

	return (
		<ScrollArea
			className={`rounded-lg border bg-background ${props.heightClassName ?? "h-56"}`}
		>
			<ul className="divide-y">
				{props.items.map((item) => (
					<li
						key={item.id}
						className={`flex items-center justify-between px-3 ${
							props.compact ? "gap-2.5 py-2" : "gap-3 py-2.5"
						}`}
					>
						<div className={`min-w-0 flex items-center ${props.compact ? "gap-2.5" : "gap-3"}`}>
							{item.leading ? <div className="shrink-0">{item.leading}</div> : null}
							<div className="min-w-0">
								<div className="truncate text-sm font-medium">{item.title}</div>
								{item.subtitle ? (
									<div className="truncate text-xs text-muted-foreground">
										{item.subtitle}
									</div>
								) : null}
							</div>
						</div>
						{item.trailing ? <div className="shrink-0">{item.trailing}</div> : null}
					</li>
				))}
			</ul>
		</ScrollArea>
	);
}

function SelectedItemBadges(props: {
	items: Array<{
		id: string;
		title: string;
		leading?: React.ReactNode;
	}>;
	onRemove: (id: string) => void;
	empty: string;
}) {
	if (!props.items.length) {
		return (
			<div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
				{props.empty}
			</div>
		);
	}

	return (
		<div className="flex flex-wrap gap-2">
			{props.items.map((item) => (
				<button
					key={item.id}
					type="button"
					onClick={() => props.onRemove(item.id)}
					className="group inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm transition-colors hover:border-rose-200 hover:bg-rose-50"
					aria-label={`Remove ${item.title}`}
				>
					<span className="relative flex h-4 w-4 items-center justify-center">
						<span className="absolute transition-opacity group-hover:opacity-0">
							{item.leading ?? (
								<KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
							)}
						</span>
						<X className="absolute h-3.5 w-3.5 text-rose-600 opacity-0 transition-opacity group-hover:opacity-100" />
					</span>
					<span className="max-w-[240px] truncate">{item.title}</span>
				</button>
			))}
		</div>
	);
}

function SelectionField(props: {
	label: string;
	description: string;
	dialogTitle: string;
	dialogDescription?: string;
	options: Array<{ value: string; label: string }>;
	selected: string[];
	onChange: (next: string[]) => void;
	selectedItems: Array<{
		id: string;
		title: string;
		leading?: React.ReactNode;
	}>;
	onRemove: (id: string) => void;
	empty: string;
	triggerLabel: string;
	renderLeading?: (opt: { value: string; label: string }) => React.ReactNode;
	disabled?: boolean;
	accessory?: React.ReactNode;
}) {
	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<Label>{props.label}</Label>
					<p className="text-xs text-muted-foreground">{props.description}</p>
				</div>
				<SelectionDialog
					title={props.dialogTitle}
					description={props.dialogDescription}
					options={props.options}
					selected={props.selected}
					onChange={props.onChange}
					renderLeading={props.renderLeading}
					trigger={
						<Button
							type="button"
							variant="outline"
							disabled={props.disabled}
							className="min-w-[160px]"
						>
							{props.triggerLabel}
						</Button>
					}
				/>
			</div>
			{props.accessory}
			<SelectedItemBadges
				items={props.selectedItems}
				empty={props.empty}
				onRemove={props.onRemove}
			/>
		</div>
	);
}

type PreviewModelProviderState = {
	providerId: string;
	accessible: boolean;
	reason: string;
};

type EditorView =
	| "overview"
	| "access"
	| "promptInjection"
	| "sensitiveInfo"
	| "budgets";

function buildProviderReason(args: {
	providerId: string;
	providerAllowed: boolean;
	modelAllowed: boolean;
	providerMode: ProviderRestrictionMode;
	selectedProviderIds: string[];
	selectedModelIds: string[];
}) {
	if (args.providerAllowed && args.modelAllowed) {
		return "Reachable with the current provider and model settings.";
	}
	if (!args.providerAllowed) {
		if (args.providerMode === "allowlist") {
			return args.selectedProviderIds.length
				? "Blocked because this provider is outside the provider allowlist."
				: "Blocked because no providers were selected in the provider allowlist."
				;
		}
		if (args.providerMode === "blocklist") {
			return "Blocked because this provider is included in the provider blocklist.";
		}
	}
	if (!args.modelAllowed) {
		return args.selectedModelIds.length
			? "Blocked because this model is outside the selected model allowlist."
			: "Blocked by the current model restriction."
			;
	}
	return "Not reachable with the current settings.";
}

function SettingsGroupRow(props: {
	title: string;
	description: string;
	summary: string;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			onClick={props.onOpen}
			className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-muted/30"
		>
			<div className="min-w-0">
				<div className="text-sm font-medium">{props.title}</div>
				<p className="mt-1 text-sm text-muted-foreground">{props.description}</p>
			</div>
			<div className="flex shrink-0 items-center gap-4">
				<div className="max-w-[340px] text-right text-sm text-muted-foreground">
					{props.summary}
				</div>
				<span className="text-sm font-medium">Open</span>
			</div>
		</button>
	);
}

function getEditorViewLabel(view: EditorView): string {
	switch (view) {
		case "access":
			return "Access";
		case "promptInjection":
			return "Prompt injection";
		case "sensitiveInfo":
			return "Sensitive info detection";
		case "budgets":
			return "Budget policies";
		default:
			return "Overview";
	}
}

function getEditorViewDescription(view: EditorView): string {
	switch (view) {
		case "access":
			return "Control ZDR, privacy eligibility, provider access, model access, and reachable model coverage in one place.";
		case "promptInjection":
			return "Choose how prompt-injection detection should inspect and respond to risky inputs.";
		case "sensitiveInfo":
			return "Configure built-in and custom sensitive-data handling before requests reach the model.";
		case "budgets":
			return "Set request and spend ceilings across daily, weekly, and monthly windows.";
		default:
			return "";
	}
}

export default function GuardrailEditorPageClient(props: {
	mode: "create" | "edit";
	guardrailId: string | null;
	teamName: string | null;
	providers: ProviderOption[];
	activeProviderModels: ActiveProviderModel[];
	keys: KeyOption[];
	initialGuardrail: GuardrailRow | null;
	initialKeyIds: string[];
	backHref: string;
}) {
	const router = useRouter();
	const g = props.initialGuardrail;

	const providerOptions = useMemo(() => {
		return [...props.providers]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((p) => ({ value: p.id, label: p.name }));
	}, [props.providers]);

	const modelLabelById = useMemo(() => {
		const map = new Map<string, string>();
		for (const row of props.activeProviderModels) {
			if (map.has(row.apiModelId)) continue;
			map.set(
				row.apiModelId,
				formatModelPreviewTitle({
					organisationName: row.organisationName,
					organisationId: row.organisationId,
					internalModelName: row.internalModelName,
					internalModelId: row.internalModelId,
					apiModelId: row.apiModelId,
				}),
			);
		}
		return map;
	}, [props.activeProviderModels]);

	const modelOptions = useMemo(() => {
		return Array.from(modelLabelById.entries())
			.sort((a, b) => a[1].localeCompare(b[1]))
			.map(([value, label]) => ({ value, label }));
	}, [modelLabelById]);

	const keyOptions = useMemo(() => {
		return props.keys.map((k) => ({
			value: k.id,
			label: k.name,
		}));
	}, [props.keys]);

	const providerLabelById = useMemo(() => {
		return new Map(props.providers.map((provider) => [provider.id, provider.name]));
	}, [props.providers]);
	const keyById = useMemo(() => {
		return new Map(props.keys.map((key) => [key.id, key]));
	}, [props.keys]);
	const modelProviderIdsByModelId = useMemo(() => {
		const map = new Map<string, string[]>();
		for (const row of props.activeProviderModels) {
			const current = map.get(row.apiModelId) ?? [];
			current.push(row.providerId);
			map.set(row.apiModelId, uniqStrings(current).sort((a, b) => a.localeCompare(b)));
		}
		return map;
	}, [props.activeProviderModels]);

	const sensitiveInfoRuleDefinitions = useMemo(
		() => getSensitiveInfoRuleDefinitions(),
		[],
	);

	const initial = useMemo(() => {
		const mode = normalizeMode(g?.provider_restriction_mode);
		return {
			enabled: Boolean(g?.enabled ?? true),
			name: (g?.name ?? "").toString(),
			description: (g?.description ?? "").toString(),

			privacyEnablePaidMayTrain: Boolean(g?.privacy_enable_paid_may_train ?? true),
			privacyEnableFreeMayTrain: Boolean(g?.privacy_enable_free_may_train ?? true),
			privacyEnableFreeMayPublishPrompts: Boolean(
				g?.privacy_enable_free_may_publish_prompts ?? true,
			),
			privacyEnableInputOutputLogging: Boolean(
				g?.privacy_enable_input_output_logging ?? true,
			),
			privacyZdrOnly: Boolean(g?.privacy_zdr_only ?? false),

			providerRestrictionMode: mode,
			providerRestrictionProviderIds: uniqStrings(
				(g?.provider_restriction_provider_ids ?? []) as string[],
			),
			providerRestrictionEnforceAllowed: Boolean(
				g?.provider_restriction_enforce_allowed ?? false,
			),

			modelRestrictionMode: normalizeMode(g?.model_restriction_mode),
			allowedApiModelIds: uniqStrings((g?.allowed_api_model_ids ?? []) as string[]),
			promptInjectionEnabled: Boolean(g?.prompt_injection_enabled ?? false),
			promptInjectionAction: normalizePromptInjectionAction(
				g?.prompt_injection_action,
			),
			sensitiveInfoEnabled: Boolean(g?.sensitive_info_enabled ?? false),
			sensitiveInfoDefaultAction: normalizeSensitiveInfoAction(
				g?.sensitive_info_default_action,
			),
			sensitiveInfoRules: normalizeSensitiveInfoRules(
				g?.sensitive_info_rules,
				normalizeSensitiveInfoAction(g?.sensitive_info_default_action),
			),
			sensitiveInfoPreviewInput: "",

			dailyRequests: g?.daily_limit_requests ? String(g.daily_limit_requests) : "",
			weeklyRequests: g?.weekly_limit_requests ? String(g.weekly_limit_requests) : "",
			monthlyRequests: g?.monthly_limit_requests ? String(g.monthly_limit_requests) : "",
			dailyCostUsd: formatUsdFromNanos(Number(g?.daily_limit_cost_nanos ?? 0)),
			weeklyCostUsd: formatUsdFromNanos(Number(g?.weekly_limit_cost_nanos ?? 0)),
			monthlyCostUsd: formatUsdFromNanos(Number(g?.monthly_limit_cost_nanos ?? 0)),

			keyIds: props.initialKeyIds ?? [],
		};
	}, [g, props.initialKeyIds]);

	const [form, setForm] = useState(initial);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [activeView, setActiveView] = useState<EditorView>("overview");
	const [modelCoverageFilter, setModelCoverageFilter] = useState<
		"all" | "available" | "unavailable"
	>("all");

	const restrictionPreview = useMemo(
		() =>
			buildGuardrailRestrictionPreview({
				providers: props.providers,
				activeProviderModels: props.activeProviderModels,
				providerRestrictionMode: form.providerRestrictionMode,
				providerRestrictionProviderIds: form.providerRestrictionProviderIds,
				modelRestrictionMode: form.modelRestrictionMode,
				allowedApiModelIds: form.allowedApiModelIds,
			}),
		[
			form.allowedApiModelIds,
			form.modelRestrictionMode,
			form.providerRestrictionMode,
			form.providerRestrictionProviderIds,
			props.activeProviderModels,
			props.providers,
		],
	);
	const selectedKeyItems = useMemo(() => {
		return form.keyIds
			.map((keyId) => {
				const key = keyById.get(keyId);
				if (!key) return null;
				return {
					id: key.id,
					title: key.name,
					leading: <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />,
				};
			})
			.filter((item): item is NonNullable<typeof item> => Boolean(item));
	}, [form.keyIds, keyById]);
	const selectedProviderItems = useMemo(() => {
		return form.providerRestrictionProviderIds.map((providerId) => ({
			id: providerId,
			title: providerLabelById.get(providerId) ?? providerId,
			leading: (
				<Logo
					id={getProviderLogoId(providerId)}
					alt={`${providerLabelById.get(providerId) ?? providerId} logo`}
					width={14}
					height={14}
					className="h-3.5 w-3.5 rounded-sm"
				/>
			),
		}));
	}, [form.providerRestrictionProviderIds, providerLabelById]);
	const selectedModelItems = useMemo(() => {
		return form.allowedApiModelIds.map((modelId) => {
			const providerIds = modelProviderIdsByModelId.get(modelId) ?? [];
			const primaryProviderId = providerIds[0] ?? "cloudflare";
			return {
				id: modelId,
				title: modelLabelById.get(modelId) ?? modelId,
				leading: (
					<Logo
						id={getProviderLogoId(primaryProviderId)}
						alt={`${providerLabelById.get(primaryProviderId) ?? primaryProviderId} logo`}
						width={14}
						height={14}
						className="h-3.5 w-3.5 rounded-sm"
					/>
				),
			};
		});
	}, [form.allowedApiModelIds, modelLabelById, modelProviderIdsByModelId, providerLabelById]);
	const modelCoverageItems = useMemo(() => {
		const providerAllowedSet = new Set(restrictionPreview.allowedProviderIds);
		const selectedModelIdsSet = new Set(form.allowedApiModelIds);
		const routeRowsByModelId = new Map<string, ActiveProviderModel[]>();
		for (const row of props.activeProviderModels) {
			const current = routeRowsByModelId.get(row.apiModelId) ?? [];
			current.push(row);
			routeRowsByModelId.set(row.apiModelId, current);
		}

		return Array.from(routeRowsByModelId.entries())
			.map(([modelId, rows]) => {
				const primary = rows[0];
				const modelAllowed =
					form.modelRestrictionMode === "none"
						? true
						: form.modelRestrictionMode === "allowlist"
							? selectedModelIdsSet.has(modelId)
							: !selectedModelIdsSet.has(modelId);
				const providerStates: PreviewModelProviderState[] = rows
					.map((row) => {
						const providerAllowed = providerAllowedSet.has(row.providerId);
						return {
							providerId: row.providerId,
							accessible: providerAllowed && modelAllowed,
							reason: buildProviderReason({
								providerId: row.providerId,
								providerAllowed,
								modelAllowed,
								providerMode: form.providerRestrictionMode,
								selectedProviderIds: form.providerRestrictionProviderIds,
								selectedModelIds: form.allowedApiModelIds,
							}),
						};
					})
					.sort((a, b) => a.providerId.localeCompare(b.providerId));
				const accessibleCount = providerStates.filter((state) => state.accessible).length;
				const isAvailable = accessibleCount > 0;
				const unavailableReason = buildModelAvailabilityReason({
					modelAllowed,
					modelMode: form.modelRestrictionMode,
					selectedModelIds: form.allowedApiModelIds,
					providerStates,
				});
				return {
					id: modelId,
					title: formatModelPreviewTitle({
						organisationName: primary?.organisationName ?? null,
						organisationId: primary?.organisationId ?? null,
						internalModelName: primary?.internalModelName ?? null,
							internalModelId: primary?.internalModelId ?? null,
							apiModelId: modelId,
						}),
					subtitle: isAvailable ? undefined : unavailableReason ?? undefined,
					available: isAvailable,
					leading: (
						<Logo
							id={getProviderLogoId(primary?.providerId ?? "cloudflare")}
							alt={`${providerLabelById.get(primary?.providerId ?? "") ?? primary?.providerId ?? "Provider"} logo`}
							width={18}
							height={18}
							className="h-[18px] w-[18px] rounded-sm"
						/>
					),
					trailing: (
						<div className="flex items-center gap-2">
							<div className="flex items-center gap-1.5">
								{providerStates.map((state) => {
									const providerLabel =
										providerLabelById.get(state.providerId) ?? state.providerId;
									return (
										<Tooltip key={`${modelId}-${state.providerId}`}>
											<TooltipTrigger asChild>
												<button
													type="button"
													aria-label={`${providerLabel}: ${state.reason}`}
													className="inline-flex items-center justify-center rounded-md p-1 hover:bg-muted/60"
												>
													<Logo
														id={getProviderLogoId(state.providerId)}
														alt={`${providerLabel} logo`}
														width={18}
														height={18}
														className={`h-[18px] w-[18px] rounded-sm ${
															state.accessible ? "" : "grayscale opacity-40"
														}`}
													/>
												</button>
											</TooltipTrigger>
											<TooltipContent side="top" sideOffset={6}>
												<div className="space-y-1">
													<div className="font-medium">{providerLabel}</div>
													<div>{state.reason}</div>
												</div>
											</TooltipContent>
										</Tooltip>
									);
								})}
							</div>
							<Badge variant={accessibleCount > 0 ? "secondary" : "outline"}>
								{accessibleCount}/{providerStates.length}
							</Badge>
						</div>
					),
				};
			})
			.sort((a, b) => a.title.localeCompare(b.title));
	}, [
		form.allowedApiModelIds,
		form.modelRestrictionMode,
		form.providerRestrictionMode,
		form.providerRestrictionProviderIds,
		props.activeProviderModels,
		providerLabelById,
		restrictionPreview.allowedProviderIds,
	]);
	const filteredModelCoverageItems = useMemo(() => {
		switch (modelCoverageFilter) {
			case "available":
				return modelCoverageItems.filter((item) => item.available);
			case "unavailable":
				return modelCoverageItems.filter((item) => !item.available);
			default:
				return modelCoverageItems;
		}
	}, [modelCoverageFilter, modelCoverageItems]);

	const sensitiveInfoPreview = useMemo(
		() =>
			buildSensitiveInfoPreview({
				text: form.sensitiveInfoPreviewInput,
				rules: form.sensitiveInfoRules,
			}),
		[form.sensitiveInfoPreviewInput, form.sensitiveInfoRules],
	);
	const customSensitiveInfoRules = useMemo(
		() =>
			form.sensitiveInfoRules.filter(
				(rule): rule is SensitiveInfoCustomRulePayload => rule.kind === "custom",
			),
		[form.sensitiveInfoRules],
	);
	const sensitiveInfoRuleIssues = useMemo(() => {
		const issues = new Map<string, string>();
		for (const rule of form.sensitiveInfoRules) {
			const issue = validateSensitiveInfoRulePayload(rule);
			if (issue) {
				issues.set(rule.id, issue);
			}
		}
		return issues;
	}, [form.sensitiveInfoRules]);
	const enabledSensitiveInfoRuleCount = useMemo(
		() => form.sensitiveInfoRules.filter((rule) => rule.enabled).length,
		[form.sensitiveInfoRules],
	);
	const configuredBudgetCount = useMemo(() => {
		return [
			form.dailyRequests,
			form.weeklyRequests,
			form.monthlyRequests,
			form.dailyCostUsd,
			form.weeklyCostUsd,
			form.monthlyCostUsd,
		].filter((value) => value.trim().length > 0).length;
	}, [
		form.dailyCostUsd,
		form.dailyRequests,
		form.monthlyCostUsd,
		form.monthlyRequests,
		form.weeklyCostUsd,
		form.weeklyRequests,
	]);
	const privacyRestrictionCount = useMemo(() => {
		let count = 0;
		if (!form.privacyEnablePaidMayTrain) count += 1;
		if (!form.privacyEnableFreeMayTrain) count += 1;
		if (!form.privacyEnableFreeMayPublishPrompts) count += 1;
		if (!form.privacyEnableInputOutputLogging) count += 1;
		if (form.privacyZdrOnly) count += 1;
		return count;
	}, [
		form.privacyEnableFreeMayPublishPrompts,
		form.privacyEnableFreeMayTrain,
		form.privacyEnableInputOutputLogging,
		form.privacyEnablePaidMayTrain,
		form.privacyZdrOnly,
	]);

	useEffect(() => {
		setForm(initial);
	}, [initial]);

	function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
		setForm((prev) => ({ ...prev, [key]: value }));
	}

	function setSensitiveInfoRule(
		ruleId: SensitiveInfoRulePayload["id"],
		patch: Partial<SensitiveInfoRulePayload>,
	) {
		setForm((prev) => ({
			...prev,
			sensitiveInfoRules: prev.sensitiveInfoRules.map((rule) =>
				rule.id === ruleId
					? rule.kind === "custom"
						? {
								...rule,
								...(patch as Partial<SensitiveInfoCustomRulePayload>),
						  }
						: {
								...rule,
								...(patch as Partial<
									Extract<SensitiveInfoRulePayload, { kind: "builtin" }>
								>),
						  }
					: rule,
			),
		}));
	}

	function setPromptInjectionHandling(value: GuardrailHandlingState) {
		if (value === "disabled") {
			setForm((prev) => ({
				...prev,
				promptInjectionEnabled: false,
			}));
			return;
		}
		setForm((prev) => ({
			...prev,
			promptInjectionEnabled: true,
			promptInjectionAction: value,
		}));
	}

	function setSensitiveInfoRuleHandling(
		ruleId: SensitiveInfoRulePayload["id"],
		value: GuardrailHandlingState,
	) {
		if (value === "disabled") {
			setSensitiveInfoRule(ruleId, { enabled: false });
			return;
		}
		setSensitiveInfoRule(ruleId, {
			enabled: true,
			action: value,
		});
	}

	function enableAllSensitiveInfoBuiltinRules() {
		setForm((prev) => ({
			...prev,
			sensitiveInfoEnabled: true,
			sensitiveInfoRules: prev.sensitiveInfoRules.map((rule) =>
				rule.kind === "builtin"
					? {
							...rule,
							enabled: true,
							action: rule.action ?? prev.sensitiveInfoDefaultAction,
					  }
					: rule,
			),
		}));
	}

	function addCustomSensitiveInfoRule() {
		setForm((prev) => ({
			...prev,
			sensitiveInfoRules: [
				...prev.sensitiveInfoRules,
				createCustomSensitiveInfoRule(prev.sensitiveInfoDefaultAction),
			],
		}));
	}

	function removeCustomSensitiveInfoRule(ruleId: string) {
		setForm((prev) => ({
			...prev,
			sensitiveInfoRules: prev.sensitiveInfoRules.filter((rule) => rule.id !== ruleId),
		}));
	}

	function removeSelectedKey(keyId: string) {
		set("keyIds", form.keyIds.filter((id) => id !== keyId));
	}

	function removeSelectedProvider(providerId: string) {
		set(
			"providerRestrictionProviderIds",
			form.providerRestrictionProviderIds.filter((id) => id !== providerId),
		);
	}

	function removeSelectedModel(modelId: string) {
		set(
			"allowedApiModelIds",
			form.allowedApiModelIds.filter((id) => id !== modelId),
		);
	}

	function validateBudgets() {
		const dailyRequests = parseInteger(form.dailyRequests);
		const weeklyRequests = parseInteger(form.weeklyRequests);
		const monthlyRequests = parseInteger(form.monthlyRequests);
		const dailyCostNanos = parseUsdToNanos(form.dailyCostUsd);
		const weeklyCostNanos = parseUsdToNanos(form.weeklyCostUsd);
		const monthlyCostNanos = parseUsdToNanos(form.monthlyCostUsd);

		const invalidField =
			dailyRequests === undefined
				? "Daily request budget"
				: weeklyRequests === undefined
					? "Weekly request budget"
					: monthlyRequests === undefined
						? "Monthly request budget"
						: dailyCostNanos === undefined
							? "Daily spend budget"
							: weeklyCostNanos === undefined
								? "Weekly spend budget"
								: monthlyCostNanos === undefined
									? "Monthly spend budget"
									: null;

		if (invalidField) {
			toast.error(`${invalidField} must be a positive number.`);
			return null;
		}

		return {
			dailyRequests,
			weeklyRequests,
			monthlyRequests,
			dailyCostNanos,
			weeklyCostNanos,
			monthlyCostNanos,
		};
	}

	async function onSave() {
		if (!form.name.trim()) {
			toast.error("Name is required.");
			return;
		}
		const firstSensitiveInfoIssue = form.sensitiveInfoRules
			.map((rule) => validateSensitiveInfoRulePayload(rule))
			.find((issue): issue is string => Boolean(issue));
		if (firstSensitiveInfoIssue) {
			toast.error(firstSensitiveInfoIssue);
			return;
		}
		const budgets = validateBudgets();
		if (!budgets) return;

		setSaving(true);
		const toastId = toast.loading(
			props.mode === "create" ? "Creating guardrail..." : "Saving guardrail...",
		);
		try {
			let guardrailId = props.guardrailId;
			if (props.mode === "create") {
				const created = await createGuardrail({
					enabled: form.enabled,
					name: form.name,
					description: form.description || null,
					privacyEnablePaidMayTrain: form.privacyEnablePaidMayTrain,
					privacyEnableFreeMayTrain: form.privacyEnableFreeMayTrain,
					privacyEnableFreeMayPublishPrompts: form.privacyEnableFreeMayPublishPrompts,
					privacyEnableInputOutputLogging: form.privacyEnableInputOutputLogging,
					privacyZdrOnly: form.privacyZdrOnly,
					providerRestrictionMode: form.providerRestrictionMode,
					providerRestrictionProviderIds: form.providerRestrictionProviderIds,
					providerRestrictionEnforceAllowed: form.providerRestrictionEnforceAllowed,
					modelRestrictionMode: form.modelRestrictionMode,
					allowedApiModelIds: form.allowedApiModelIds,
					promptInjectionEnabled: form.promptInjectionEnabled,
					promptInjectionAction: form.promptInjectionAction,
					sensitiveInfoEnabled: form.sensitiveInfoEnabled,
					sensitiveInfoDefaultAction: form.sensitiveInfoDefaultAction,
					sensitiveInfoRules: form.sensitiveInfoRules,
					budgets,
				});
				guardrailId = created.id ?? null;
			} else if (props.mode === "edit" && props.guardrailId) {
				await updateGuardrail(props.guardrailId, {
					enabled: form.enabled,
					name: form.name,
					description: form.description || null,
					privacyEnablePaidMayTrain: form.privacyEnablePaidMayTrain,
					privacyEnableFreeMayTrain: form.privacyEnableFreeMayTrain,
					privacyEnableFreeMayPublishPrompts: form.privacyEnableFreeMayPublishPrompts,
					privacyEnableInputOutputLogging: form.privacyEnableInputOutputLogging,
					privacyZdrOnly: form.privacyZdrOnly,
					providerRestrictionMode: form.providerRestrictionMode,
					providerRestrictionProviderIds: form.providerRestrictionProviderIds,
					providerRestrictionEnforceAllowed: form.providerRestrictionEnforceAllowed,
					modelRestrictionMode: form.modelRestrictionMode,
					allowedApiModelIds: form.allowedApiModelIds,
					promptInjectionEnabled: form.promptInjectionEnabled,
					promptInjectionAction: form.promptInjectionAction,
					sensitiveInfoEnabled: form.sensitiveInfoEnabled,
					sensitiveInfoDefaultAction: form.sensitiveInfoDefaultAction,
					sensitiveInfoRules: form.sensitiveInfoRules,
					budgets,
				});
			}

			if (guardrailId) {
				await setGuardrailKeys(guardrailId, form.keyIds);
			}

			toast.success("Guardrail saved", { id: toastId });
			router.push(props.backHref);
			router.refresh();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to save guardrail.";
			toast.error(message, { id: toastId });
		} finally {
			setSaving(false);
		}
	}

	async function onDelete() {
		if (!props.guardrailId) return;
		setDeleting(true);
		const toastId = toast.loading("Deleting guardrail...");
		try {
			await deleteGuardrail(props.guardrailId);
			toast.success("Guardrail deleted", { id: toastId });
			router.push(props.backHref);
			router.refresh();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to delete guardrail.";
			toast.error(message, { id: toastId });
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div className="space-y-6">
			<Alert className="border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-sky-50">
				<Info className="text-sky-600 dark:text-sky-300" />
				<div>
					<AlertTitle>Beta feature</AlertTitle>
					<AlertDescription>
						Guardrails UI ships ahead of full enforcement metadata. Validate critical
						behavior with a staging key before rolling out broadly.
					</AlertDescription>
				</div>
			</Alert>
			<div className="w-full space-y-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					{activeView === "overview" ? (
						<div className="min-w-0 flex-1">
							<Label htmlFor="guardrail-name" className="sr-only">
								Guardrail name
							</Label>
							<Input
								id="guardrail-name"
								value={form.name}
								onChange={(e) => set("name", e.target.value)}
								placeholder="New Guardrail"
								className="h-auto border-0 bg-transparent px-0 py-0 text-4xl font-semibold tracking-tight shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 md:text-3xl"
							/>
						</div>
					) : (
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-auto gap-1.5 rounded-md px-2 py-1 text-muted-foreground"
									onClick={() => setActiveView("overview")}
								>
									<ChevronLeft className="h-4 w-4" />
									Overview
								</Button>
								<span className="text-muted-foreground">/</span>
								<div className="text-2xl font-semibold tracking-tight">
									{getEditorViewLabel(activeView)}
								</div>
							</div>
							<p className="mt-1 max-w-3xl text-sm text-muted-foreground">
								{getEditorViewDescription(activeView)}
							</p>
						</div>
					)}
					<div className="flex flex-wrap items-center gap-2">
						{activeView === "overview" ? (
							<>
								<Button asChild type="button" variant="outline" disabled={saving || deleting}>
									<Link href={props.backHref}>Cancel</Link>
								</Button>
								<Button type="button" onClick={onSave} disabled={saving || deleting}>
									{saving ? "Saving..." : props.mode === "create" ? "Create" : "Save"}
								</Button>
								<div className="flex items-center gap-2 rounded-lg border bg-muted/10 px-3 py-2">
									<div className="min-w-0">
										<p className="text-sm font-medium">Enabled</p>
									</div>
									<Switch
										checked={form.enabled}
										onCheckedChange={(checked) => set("enabled", checked)}
									/>
								</div>
								{props.mode === "edit" ? (
									<Button
										type="button"
										variant="destructive"
										onClick={onDelete}
										disabled={saving || deleting}
									>
										<Trash2 className="mr-2 h-4 w-4" />
										Delete
									</Button>
								) : null}
							</>
						) : null}
					</div>
				</div>

				{activeView === "overview" ? (
					<div className="space-y-6">
						<div className="space-y-5">
							<div className="space-y-3">
								<Textarea
									value={form.description}
									onChange={(e) => set("description", e.target.value)}
									placeholder="Who is this for? What does it restrict?"
									className="min-h-0 h-10 resize-none overflow-hidden border-0 bg-transparent px-0 py-2 text-base text-muted-foreground shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0"
								/>
							</div>
							<div className="space-y-3 border-t pt-4">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<div className="text-sm font-medium">Apply to keys</div>
										<p className="text-xs text-muted-foreground">
											Attach this guardrail during creation instead of after the fact.
										</p>
									</div>
									<SelectionDialog
										title="Select keys"
										description="Apply this guardrail to one or more keys."
										options={keyOptions}
										selected={form.keyIds}
										onChange={(next) => set("keyIds", next)}
										trigger={
											<Button type="button" variant="outline">
												{form.keyIds.length
													? `${form.keyIds.length} selected`
													: "Select keys"}
											</Button>
										}
									/>
								</div>
								<SelectedItemBadges
									items={selectedKeyItems}
									empty="No keys selected yet."
									onRemove={removeSelectedKey}
								/>
							</div>
						</div>

						<Separator />

						<div className="space-y-2">
							<div className="text-sm font-medium">Configuration groups</div>
							<p className="text-sm text-muted-foreground">
								Open one group at a time instead of working through a single long form.
							</p>
						</div>
						<div className="divide-y rounded-xl border bg-background">
							<SettingsGroupRow
								title="Access"
								description="Control ZDR, privacy eligibility, provider access, and model access together."
								summary={
									`${privacyRestrictionCount ? `${privacyRestrictionCount} privacy rules active, ` : ""}${describeProviderRestrictionMode(form.providerRestrictionMode)}, ${summarizeModelRestriction({
										mode: form.modelRestrictionMode,
										selectedCount: form.allowedApiModelIds.length,
									})}`
								}
								onOpen={() => setActiveView("access")}
							/>
							<SettingsGroupRow
								title="Prompt injection"
								description="Scan request content for prompt-injection patterns before routing."
								summary={
									form.promptInjectionEnabled
										? `Enabled: ${form.promptInjectionAction}`
										: "Disabled"
								}
								onOpen={() => setActiveView("promptInjection")}
							/>
							<SettingsGroupRow
								title="Sensitive info detection"
								description="Detect built-in and custom sensitive patterns before the request reaches the model."
								summary={
									form.sensitiveInfoEnabled
										? `${enabledSensitiveInfoRuleCount} rules enabled`
										: "Disabled"
								}
								onOpen={() => setActiveView("sensitiveInfo")}
							/>
							<SettingsGroupRow
								title="Budget policies"
								description="Apply request and spend ceilings across daily, weekly, and monthly windows."
								summary={
									configuredBudgetCount
										? `${configuredBudgetCount} limits configured`
										: "No budgets configured"
								}
								onOpen={() => setActiveView("budgets")}
							/>
						</div>
					</div>
				) : null}

				{activeView === "access" ? (
					<div className="space-y-4">
						<EditorSection
							title="Access"
							description="Control privacy eligibility first, then provider and model access."
							compact
						>
							<div className="space-y-6">
								<div className="divide-y rounded-xl border">
									<div className="px-3 sm:px-4">
										<ToggleRow
											label="Allow paid endpoints that may train on inputs"
											description="Disabling further restricts paid endpoints flagged as training-on-inputs."
											checked={form.privacyEnablePaidMayTrain}
											onCheckedChange={(checked) => set("privacyEnablePaidMayTrain", checked)}
											flat
										/>
									</div>
									<div className="px-3 sm:px-4">
										<ToggleRow
											label="Allow free models that may train on inputs"
											description="Disabling further restricts free models flagged as training-on-inputs."
											checked={form.privacyEnableFreeMayTrain}
											onCheckedChange={(checked) => set("privacyEnableFreeMayTrain", checked)}
											flat
										/>
									</div>
									<div className="px-3 sm:px-4">
										<ToggleRow
											label="Allow free endpoints that may publish prompts"
											description="Disabling further restricts endpoints flagged as publishing prompts."
											checked={form.privacyEnableFreeMayPublishPrompts}
											onCheckedChange={(checked) =>
												set("privacyEnableFreeMayPublishPrompts", checked)
											}
											flat
										/>
									</div>
									<div className="px-3 sm:px-4">
										<ToggleRow
											label="Allow input/output logging"
											description="Disabling indicates this guardrail should avoid body logging where supported."
											checked={form.privacyEnableInputOutputLogging}
											onCheckedChange={(checked) =>
												set("privacyEnableInputOutputLogging", checked)
											}
											flat
										/>
									</div>
									<div className="px-3 sm:px-4">
										<ToggleRow
											label="ZDR only"
											description="Further restrict routing to endpoints that meet ZDR requirements."
											checked={form.privacyZdrOnly}
											onCheckedChange={(checked) => set("privacyZdrOnly", checked)}
											flat
										/>
									</div>
								</div>

								<Separator />

								<div className="grid gap-6 xl:grid-cols-2">
									<div className="space-y-4">
										<div className="space-y-2">
											<Label>Provider mode</Label>
											<Select
												value={form.providerRestrictionMode}
												onValueChange={(value) =>
													set("providerRestrictionMode", value as ProviderRestrictionMode)
												}
											>
												<SelectTrigger>
													<SelectValue placeholder="Select mode" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="none">Allow all providers</SelectItem>
													<SelectItem value="allowlist">Only allow selected providers</SelectItem>
													<SelectItem value="blocklist">
														Allow all except selected providers
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<SelectionField
											label="Providers"
											description="Choose the providers this guardrail allows or blocks."
											dialogTitle="Select providers"
											dialogDescription="Choose providers for this guardrail."
											options={providerOptions}
											selected={form.providerRestrictionProviderIds}
											onChange={(next) => set("providerRestrictionProviderIds", next)}
											selectedItems={selectedProviderItems}
											onRemove={removeSelectedProvider}
											empty={
												form.providerRestrictionMode === "none"
													? "Provider restrictions are disabled."
													: "No providers selected yet."
											}
											triggerLabel={
												form.providerRestrictionMode === "none"
													? "Choose providers"
													: form.providerRestrictionProviderIds.length
														? `${form.providerRestrictionProviderIds.length} selected`
														: "Choose providers"
											}
											disabled={form.providerRestrictionMode === "none"}
											renderLeading={(opt) => (
												<Logo
													id={getProviderLogoId(opt.value)}
													alt={`${opt.label} logo`}
													width={18}
													height={18}
													className="h-[18px] w-[18px] rounded-sm"
												/>
											)}
											accessory={
												form.providerRestrictionMode === "allowlist" ? (
													<div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2">
														<span className="text-xs text-muted-foreground">
															Always enforce this allowlist
														</span>
														<Switch
															checked={form.providerRestrictionEnforceAllowed}
															onCheckedChange={(checked) =>
																set("providerRestrictionEnforceAllowed", checked)
															}
														/>
													</div>
												) : null
											}
										/>
								</div>
									<div className="space-y-4">
										<div className="space-y-2">
											<Label>Model mode</Label>
											<Select
												value={form.modelRestrictionMode}
												onValueChange={(value) =>
													set("modelRestrictionMode", value as ProviderRestrictionMode)
												}
											>
												<SelectTrigger>
													<SelectValue placeholder="Select mode" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="none">Allow all models</SelectItem>
													<SelectItem value="allowlist">Only allow selected models</SelectItem>
													<SelectItem value="blocklist">
														Allow all except selected models
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<SelectionField
											label="Models"
											description="Choose the models this guardrail allows or blocks after provider filtering."
											dialogTitle="Select models"
											dialogDescription="Choose models for this guardrail after provider filtering."
											options={modelOptions}
											selected={form.allowedApiModelIds}
											onChange={(next) => set("allowedApiModelIds", next)}
											selectedItems={selectedModelItems}
											onRemove={removeSelectedModel}
											empty={
												form.modelRestrictionMode === "none"
													? "Model restrictions are disabled."
													: "No models selected yet."
											}
											triggerLabel={
												form.modelRestrictionMode === "none"
													? "Choose models"
													: form.allowedApiModelIds.length
														? `${form.allowedApiModelIds.length} selected`
														: "Choose models"
											}
											disabled={form.modelRestrictionMode === "none"}
											renderLeading={(opt) => {
												const providerIds = modelProviderIdsByModelId.get(opt.value) ?? [];
												const primaryProviderId = providerIds[0] ?? "cloudflare";
												return (
													<Logo
														id={getProviderLogoId(primaryProviderId)}
														alt={`${providerLabelById.get(primaryProviderId) ?? primaryProviderId} logo`}
														width={18}
														height={18}
														className="h-[18px] w-[18px] rounded-sm"
													/>
												);
											}}
										/>
									</div>
								</div>

								<Separator />

								<div className="grid gap-3 sm:grid-cols-2">
									<div className="rounded-xl border bg-muted/10 p-3">
										<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
											Provider rule
										</div>
										<div className="mt-2 text-sm font-medium">
											{describeProviderRestrictionMode(form.providerRestrictionMode)}
										</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{restrictionPreview.allowedProviderIds.length} allowed,{" "}
											{restrictionPreview.blockedProviderIds.length} blocked
										</div>
									</div>
									<div className="rounded-xl border bg-muted/10 p-3">
										<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
											Model rule
										</div>
										<div className="mt-2 text-sm font-medium">
											{describeModelRestrictionMode(form.modelRestrictionMode)}
										</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{restrictionPreview.reachableModelIds.length} allowed,{" "}
											{restrictionPreview.blockedModelIds.length} blocked
										</div>
									</div>
								</div>
								<div className="space-y-2">
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div className="text-sm font-medium">Model coverage</div>
										<div className="inline-flex items-center rounded-lg border bg-background p-1">
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className={`h-8 rounded-md px-3 ${
													modelCoverageFilter === "all"
														? "bg-muted text-foreground"
														: "text-muted-foreground"
												}`}
												onClick={() => setModelCoverageFilter("all")}
											>
												All
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className={`h-8 rounded-md px-3 ${
													modelCoverageFilter === "available"
														? "bg-muted text-foreground"
														: "text-muted-foreground"
												}`}
												onClick={() => setModelCoverageFilter("available")}
											>
												Available
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className={`h-8 rounded-md px-3 ${
													modelCoverageFilter === "unavailable"
														? "bg-muted text-foreground"
														: "text-muted-foreground"
												}`}
												onClick={() => setModelCoverageFilter("unavailable")}
											>
												Unavailable
											</Button>
										</div>
									</div>
									<BoundedSelectionList
										items={filteredModelCoverageItems}
										empty={
											modelCoverageFilter === "available"
												? "No models are currently available."
												: modelCoverageFilter === "unavailable"
													? "No models are currently unavailable."
													: "No active models are available."
										}
										heightClassName="h-[36rem]"
										compact
									/>
								</div>
							</div>
						</EditorSection>
					</div>
				) : null}

				{activeView === "promptInjection" ? (
					<div className="space-y-4">
						<EditorSection
							title="Prompt injection"
							description="Scan user-supplied request content for common prompt injection patterns before it reaches the model."
							compact
						>
							<div className="grid gap-2 md:max-w-sm">
								<Label>Handling</Label>
								<Select
									value={getHandlingState({
										enabled: form.promptInjectionEnabled,
										action: form.promptInjectionAction,
									})}
									onValueChange={(value) =>
										setPromptInjectionHandling(value as GuardrailHandlingState)
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select handling" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="disabled">Disabled</SelectItem>
										<SelectItem value="flag">Flag</SelectItem>
										<SelectItem value="redact">Redact</SelectItem>
										<SelectItem value="block">Block</SelectItem>
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									If multiple guardrails apply to the same key, the most restrictive
									action wins: Block, then Redact, then Flag.
								</p>
							</div>
						</EditorSection>
					</div>
				) : null}

				{activeView === "sensitiveInfo" ? (
					<div className="space-y-6">
						<EditorSection
							title="Sensitive info"
							description="Detect and handle common sensitive data before the request reaches the model."
							compact
						>
							<div className="grid gap-4">
								<div className="grid gap-2 md:max-w-sm">
									<Label>Default handling</Label>
									<Select
										value={getHandlingState({
											enabled: form.sensitiveInfoEnabled,
											action: form.sensitiveInfoDefaultAction,
										})}
										onValueChange={(value) => {
											const next = value as GuardrailHandlingState;
											if (next === "disabled") {
												setForm((prev) => ({ ...prev, sensitiveInfoEnabled: false }));
												return;
											}
											setForm((prev) => ({
												...prev,
												sensitiveInfoEnabled: true,
												sensitiveInfoDefaultAction: next,
											}));
										}}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select handling" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="disabled">Disabled</SelectItem>
											<SelectItem value="flag">Flag</SelectItem>
											<SelectItem value="redact">Redact</SelectItem>
											<SelectItem value="block">Block</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="rounded-xl border">
									<div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3">
										<div>
											<p className="text-sm font-medium">Patterns</p>
											<p className="text-xs text-muted-foreground">
												Identify and handle common sensitive data before a request is sent.
											</p>
										</div>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={enableAllSensitiveInfoBuiltinRules}
										>
											Enable all
										</Button>
									</div>
									<div className="divide-y">
										{sensitiveInfoRuleDefinitions.map((rule) => {
											const currentRule =
												form.sensitiveInfoRules.find((entry) => entry.id === rule.id) ??
												{
													id: rule.id,
													kind: "builtin" as const,
													enabled: true,
													action: form.sensitiveInfoDefaultAction,
												};
											return (
												<div
													key={rule.id}
													className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
												>
													<div className="min-w-0">
														<div className="flex flex-wrap items-center gap-2">
															<p className="text-sm font-medium">{rule.label}</p>
															{rule.addsLatency ? (
																<Badge variant="outline">Adds latency</Badge>
															) : null}
														</div>
														<p className="text-xs text-muted-foreground">
															{rule.description}
														</p>
													</div>
													<div className="flex flex-wrap items-center gap-3">
														<Select
															value={getHandlingState({
																enabled: form.sensitiveInfoEnabled && currentRule.enabled,
																action: currentRule.action,
															})}
															onValueChange={(value) =>
																setSensitiveInfoRuleHandling(
																	rule.id,
																	value as GuardrailHandlingState,
																)
															}
														>
															<SelectTrigger className="w-[140px]">
																<SelectValue placeholder="Select handling" />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="disabled">Disabled</SelectItem>
																<SelectItem value="flag">Flag</SelectItem>
																<SelectItem value="redact">Redact</SelectItem>
																<SelectItem value="block">Block</SelectItem>
															</SelectContent>
														</Select>
													</div>
												</div>
											);
										})}
									</div>
								</div>
								<div className="rounded-xl border bg-muted/10 p-4 space-y-4">
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div>
											<p className="text-sm font-medium">Custom patterns</p>
											<p className="text-xs text-muted-foreground">
												Add regex-based patterns to flag, redact, or block
												workspace-specific sensitive content.
											</p>
										</div>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={addCustomSensitiveInfoRule}
											disabled={!form.sensitiveInfoEnabled}
										>
											Add pattern
										</Button>
									</div>
									{customSensitiveInfoRules.length > 0 ? (
										<div className="space-y-3">
											{customSensitiveInfoRules.map((rule, index) => {
												const issue = sensitiveInfoRuleIssues.get(rule.id) ?? null;
												return (
													<div
														key={rule.id}
														className="rounded-xl border bg-background p-3 space-y-3"
													>
														<div className="flex flex-wrap items-center justify-between gap-2">
															<div className="text-sm font-medium">
																Pattern {index + 1}
															</div>
															<div className="flex items-center gap-2">
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	onClick={() =>
																		removeCustomSensitiveInfoRule(rule.id)
																	}
																>
																	<Trash2 className="mr-2 h-4 w-4" />
																	Remove
																</Button>
															</div>
														</div>
														<div className="grid gap-3 md:grid-cols-2">
															<div className="space-y-2">
																<Label htmlFor={`custom-rule-name-${rule.id}`}>
																	Name
																</Label>
																<Input
																	id={`custom-rule-name-${rule.id}`}
																	value={rule.name}
																	disabled={!form.sensitiveInfoEnabled}
																	onChange={(event) =>
																		setSensitiveInfoRule(rule.id, {
																			name: event.target.value,
																		})
																	}
																	placeholder="e.g. Internal ticket ID"
																/>
															</div>
															<div className="space-y-2">
																<Label htmlFor={`custom-rule-flags-${rule.id}`}>
																	Flags
																</Label>
																<Input
																	id={`custom-rule-flags-${rule.id}`}
																	value={rule.flags ?? ""}
																	disabled={!form.sensitiveInfoEnabled}
																	onChange={(event) =>
																		setSensitiveInfoRule(rule.id, {
																			flags: event.target.value,
																		})
																	}
																	placeholder="e.g. i"
																/>
																<p className="text-xs text-muted-foreground">
																	Supported: g, i, m, s, u. Global matching is always
																	applied automatically.
																</p>
															</div>
														</div>
														<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
															<div className="space-y-2">
																<Label htmlFor={`custom-rule-pattern-${rule.id}`}>
																	Regex pattern
																</Label>
																<Input
																	id={`custom-rule-pattern-${rule.id}`}
																	value={rule.pattern}
																	disabled={!form.sensitiveInfoEnabled}
																	onChange={(event) =>
																		setSensitiveInfoRule(rule.id, {
																			pattern: event.target.value,
																		})
																	}
																	placeholder="e.g. ACCT-[0-9]{6}"
																	className="font-mono"
																/>
															</div>
															<div className="space-y-2">
																<Label>Action</Label>
																<Select
																	value={getHandlingState({
																		enabled: form.sensitiveInfoEnabled && rule.enabled,
																		action: rule.action,
																	})}
																	onValueChange={(value) =>
																		setSensitiveInfoRuleHandling(
																			rule.id,
																			value as GuardrailHandlingState,
																		)
																	}
																>
																	<SelectTrigger>
																		<SelectValue placeholder="Select handling" />
																	</SelectTrigger>
																	<SelectContent>
																		<SelectItem value="disabled">Disabled</SelectItem>
																		<SelectItem value="flag">Flag</SelectItem>
																		<SelectItem value="redact">Redact</SelectItem>
																		<SelectItem value="block">Block</SelectItem>
																	</SelectContent>
																</Select>
															</div>
														</div>
														{issue ? (
															<p className="text-xs text-destructive">{issue}</p>
														) : (
															<p className="text-xs text-muted-foreground">
																Matches will redact to a placeholder derived from the
																pattern name.
															</p>
														)}
													</div>
												);
											})}
										</div>
									) : (
										<div className="rounded-lg border border-dashed bg-background p-4 text-sm text-muted-foreground">
											No custom patterns configured yet.
										</div>
									)}
								</div>
								<div className="rounded-xl border bg-muted/10 p-4 space-y-3">
									<div>
										<p className="text-sm font-medium">Preview</p>
										<p className="text-xs text-muted-foreground">
											Test sample text to see what would be flagged, redacted, or blocked.
										</p>
									</div>
									<Textarea
										value={form.sensitiveInfoPreviewInput}
										onChange={(e) => set("sensitiveInfoPreviewInput", e.target.value)}
										placeholder="e.g. My email is test@example.com and my card is 4242 4242 4242 4242"
									/>
									<div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
										<div className="rounded-lg border bg-background p-3">
											<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
												Result
											</div>
											<div className="mt-2 text-sm font-medium">
												{!form.sensitiveInfoPreviewInput.trim()
													? "Enter sample text"
													: !form.sensitiveInfoEnabled
														? "Detection disabled"
														: !sensitiveInfoPreview.action
															? "No matches"
															: sensitiveInfoPreview.action === "block"
																? "Would block"
																: sensitiveInfoPreview.action === "redact"
																	? "Would redact"
																	: "Would flag"}
											</div>
											{form.sensitiveInfoEnabled &&
											sensitiveInfoPreview.matches.length > 0 ? (
												<div className="mt-3 flex flex-wrap gap-2">
													{sensitiveInfoPreview.matches.map((match, index) => (
														<Badge
															key={`${match.ruleId}-${match.start}-${index}`}
															variant="outline"
														>
															{match.label}: {match.action}
														</Badge>
													))}
												</div>
											) : null}
										</div>
										<div className="rounded-lg border bg-background p-3">
											<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
												Transformed text
											</div>
											<div className="mt-2 whitespace-pre-wrap break-words text-sm">
												{form.sensitiveInfoEnabled &&
												sensitiveInfoPreview.action === "redact"
													? sensitiveInfoPreview.redactedText
													: form.sensitiveInfoPreviewInput || "Nothing to preview yet."}
											</div>
										</div>
									</div>
									<p className="text-xs text-muted-foreground">
										Names and physical addresses use contextual alpha heuristics and may
										add latency or require tuning before broad rollout.
									</p>
								</div>
							</div>
						</EditorSection>
					</div>
				) : null}

				{activeView === "budgets" ? (
					<div className="space-y-4">
						<EditorSection
							title="Budgets"
							description="Leave a field blank for unlimited. Each window is enforced independently."
							compact
						>
							<div className="space-y-4">
								<div className="grid gap-4 md:grid-cols-3">
									<div className="space-y-2">
										<Label>Daily requests</Label>
										<Input
											type="number"
											min="0"
											placeholder="Unlimited"
											value={form.dailyRequests}
											onChange={(e) => set("dailyRequests", e.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<Label>Weekly requests</Label>
										<Input
											type="number"
											min="0"
											placeholder="Unlimited"
											value={form.weeklyRequests}
											onChange={(e) => set("weeklyRequests", e.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<Label>Monthly requests</Label>
										<Input
											type="number"
											min="0"
											placeholder="Unlimited"
											value={form.monthlyRequests}
											onChange={(e) => set("monthlyRequests", e.target.value)}
										/>
									</div>
								</div>
								<div className="grid gap-4 md:grid-cols-3">
									<div className="space-y-2">
										<Label>Daily spend (USD)</Label>
										<Input
											type="number"
											min="0"
											step="0.01"
											placeholder="Unlimited"
											value={form.dailyCostUsd}
											onChange={(e) => set("dailyCostUsd", e.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<Label>Weekly spend (USD)</Label>
										<Input
											type="number"
											min="0"
											step="0.01"
											placeholder="Unlimited"
											value={form.weeklyCostUsd}
											onChange={(e) => set("weeklyCostUsd", e.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<Label>Monthly spend (USD)</Label>
										<Input
											type="number"
											min="0"
											step="0.01"
											placeholder="Unlimited"
											value={form.monthlyCostUsd}
											onChange={(e) => set("monthlyCostUsd", e.target.value)}
										/>
									</div>
								</div>
							</div>
						</EditorSection>
					</div>
				) : null}

				{activeView === "overview" ? (
					<div className="flex justify-end gap-2">
						<Button asChild type="button" variant="outline" disabled={saving || deleting}>
							<Link href={props.backHref}>Cancel</Link>
						</Button>
						<Button type="button" onClick={onSave} disabled={saving || deleting}>
							{saving ? "Saving..." : props.mode === "create" ? "Create" : "Save"}
						</Button>
					</div>
				) : null}
			</div>
		</div>
	);
}

