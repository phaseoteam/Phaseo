"use client";
import { gatewayMutationMessage, type GatewayPublicationResult } from "@/lib/settings/gatewayPublication";

import Link from "next/link";
import { useSettingsRouter as useRouter } from "../PrivateSettingsQuery";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import {
	formatProviderOfferVariantLabel,
	resolveProviderLogoId,
	type ProviderOfferScope,
} from "@/lib/providers/providerOffers";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
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
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronLeft, Info, KeyRound, Trash2, UserRound, X } from "lucide-react";

import {
	createGuardrail,
	deleteGuardrail,
	setGuardrailKeys,
	setGuardrailMembers,
	type SensitiveInfoAction,
	type SensitiveInfoCustomRulePayload,
	type SensitiveInfoRulePayload,
	updateGuardrail,
	type PromptInjectionAction,
	type ProviderRestrictionMode,
} from "@/app/(dashboard)/settings/guardrails/actions";
import {
	buildGuardrailRestrictionPreview,
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
const GUARDRAIL_SECTION_IDS = new Set([
	"access",
	"prompt-injection",
	"sensitive-info",
	"budgets",
]);
const expandedSectionsParser = parseAsArrayOf(parseAsString)
	.withDefault([])
	.withOptions({ shallow: true, clearOnDefault: true, history: "replace" });

type ProviderOption = {
	id: string;
	name: string;
	familyId: string;
	offerLabel: string | null;
	offerScope: ProviderOfferScope | null;
};
type ActiveProviderModel = {
	providerId: string;
	apiModelId: string;
	internalModelId: string | null;
	internalModelName?: string | null;
	organisationId?: string | null;
	organisationName?: string | null;
	providerPolicy?: {
		zeroDataRetention: boolean;
		dataPolicyTier: string;
		dataPolicyConfidence: string;
	};
	capabilities?: Array<{ id: string; dataPolicy: Record<string, unknown> | null }>;
};
type KeyOption = { id: string; name: string; prefix: string; status: string };
type MemberOption = { id: string; name: string; role: string };
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

function getHandlingState(args: {
	enabled: boolean;
	action: PromptInjectionAction | SensitiveInfoAction;
}): GuardrailHandlingState {
	return args.enabled ? args.action : "disabled";
}

function getRestrictionModeLabel(
	mode: ProviderRestrictionMode,
	subject: "providers" | "models",
): string {
	if (mode === "allowlist") return `Only allow selected ${subject}`;
	if (mode === "blocklist") return `Allow all except selected ${subject}`;
	return `Allow all ${subject}`;
}

function getHandlingLabel(value: GuardrailHandlingState): string {
	if (value === "disabled") return "Disabled";
	if (value === "flag") return "Flag matches";
	if (value === "redact") return "Redact matches";
	return "Block requests";
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
				? "Excluded by the model allowlist"
				: "No models selected in the allowlist";
		}
		if (args.modelMode === "blocklist") {
			return "Excluded by the model blocklist";
		}
	}
	const reasonCodes = new Set(args.providerStates.map((state) => state.reasonCode));
	if (reasonCodes.size === 1) {
		const [reasonCode] = reasonCodes;
		if (reasonCode === "zdr_required") return "ZDR eligibility is not verified";
		if (reasonCode === "data_policy_unknown") return "Data policy is unknown";
		if (reasonCode === "data_policy_unverified") return "Data policy is not confirmed";
		if (reasonCode === "logging_disabled") return "Prompt or output retention is not allowed";
		if (reasonCode === "training_disabled") return "Training on prompts or outputs is not allowed";
		if (reasonCode === "provider_restriction") return "Excluded by provider access rules";
	}
	const uniqueReasons = uniqStrings(args.providerStates.map((state) => state.reason));
	if (uniqueReasons.length === 1) {
		return uniqueReasons[0] ?? "No provider remains routable";
	}
	return "No provider meets every active rule";
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

function formatProviderIdVariant(providerId: string, familyId: string): string {
	if (providerId === familyId) return "Standard";
	const suffix = providerId.startsWith(`${familyId}-`)
		? providerId.slice(familyId.length + 1)
		: providerId;
	return suffix
		.split("-")
		.filter(Boolean)
		.map((part) => {
			const normalized = part.toLowerCase();
			if (["aws", "eu", "us"].includes(normalized)) return normalized.toUpperCase();
			return normalized.charAt(0).toUpperCase() + normalized.slice(1);
		})
		.join(" ") || "Standard";
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

type SelectionOption = { value: string; label: string; group?: string; variant?: string };

function SelectionCombobox(props: {
	title: string;
	description?: string;
	options: SelectionOption[];
	selected: string[];
	onChange: (next: string[]) => void;
	renderLeading?: (opt: SelectionOption) => React.ReactNode;
	trigger: React.ReactNode;
	inlineGroups?: boolean;
	groupActions?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

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
	const groupedOptions = useMemo(() => {
		const groups = new Map<string, SelectionOption[]>();
		for (const option of props.options) {
			const group = option.group?.trim() || "";
			groups.set(group, [...(groups.get(group) ?? []), option]);
		}
		return Array.from(groups.entries());
	}, [props.options]);
	const inlineFamilies = useMemo(() => {
		const families = new Map<string, SelectionOption[]>();
		for (const option of filtered) {
			const family = option.group?.trim() || option.label;
			families.set(family, [...(families.get(family) ?? []), option]);
		}
		return Array.from(families.entries());
	}, [filtered]);

	function toggleSelection(value: string) {
		if (props.selected.includes(value)) {
			props.onChange(props.selected.filter((v) => v !== value));
			return;
		}
		props.onChange([...props.selected, value]);
	}

	return (
		<Popover open={open} onOpenChange={(next) => {
			setOpen(next);
			if (!next) setQuery("");
		}}>
			<PopoverTrigger asChild>{props.trigger}</PopoverTrigger>
			<PopoverContent align="end" className="w-[min(420px,calc(100vw-2rem))] gap-0 overflow-hidden rounded-xl p-0">
				<PopoverHeader className="border-b px-3 py-2.5">
					<div className="flex items-center justify-between gap-3">
						<PopoverTitle className="text-sm font-medium">{props.title}</PopoverTitle>
						<span className="text-xs tabular-nums text-muted-foreground">{props.selected.length} selected</span>
					</div>
					{props.description ? <PopoverDescription className="sr-only">{props.description}</PopoverDescription> : null}
				</PopoverHeader>
				<Command className="rounded-none p-0" shouldFilter={!props.inlineGroups}>
					<CommandInput
						placeholder={`Search ${props.title.toLowerCase().replace("select ", "")}...`}
						value={query}
						onValueChange={setQuery}
						wrapperClassName="border-b p-2"
					/>
					<CommandList className="max-h-72 p-1">
						{props.inlineGroups ? (
							inlineFamilies.length ? (
								<div className="divide-y">
									{inlineFamilies.map(([family, options]) => (
										<div key={family} role="group" aria-label={family} className="flex min-h-10 items-center gap-2 px-2 py-1.5">
											{props.renderLeading && options[0] ? <span className="shrink-0">{props.renderLeading(options[0])}</span> : null}
											<span className="min-w-0 flex-1 truncate text-sm font-medium">{family}</span>
											<div className="flex shrink-0 flex-wrap justify-end gap-1">
												{options.map((option) => {
													const checked = selectedSet.has(option.value);
													return (
														<button
															key={option.value}
															type="button"
															aria-pressed={checked}
															onClick={() => toggleSelection(option.value)}
															className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs transition-colors ${checked ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"}`}
														>
															{checked ? <Check className="size-3" /> : null}
															{option.variant ?? option.label}
														</button>
													);
												})}
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="py-6 text-center text-sm text-muted-foreground">No matches.</div>
							)
						) : (
							<>
							<CommandEmpty>No matches.</CommandEmpty>
							{groupedOptions.map(([group, options]) => {
								const groupValues = options.map((option) => option.value);
								const allGroupSelected = groupValues.every((value) => selectedSet.has(value));
								const anyGroupSelected = groupValues.some((value) => selectedSet.has(value));
								return (
							<CommandGroup
								key={group || "all"}
								heading={group ? (
									<div className="flex items-center justify-between gap-2">
										<span className="truncate">{group}</span>
										{props.groupActions ? (
											<span className="flex shrink-0 items-center gap-1">
												<button
													type="button"
													disabled={allGroupSelected}
													onMouseDown={(event) => event.preventDefault()}
													onClick={() => props.onChange(uniqStrings([...props.selected, ...groupValues]))}
													className="h-5 rounded-md px-1.5 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-35"
												>
													All
												</button>
												<button
													type="button"
													disabled={!anyGroupSelected}
													onMouseDown={(event) => event.preventDefault()}
													onClick={() => props.onChange(props.selected.filter((value) => !groupValues.includes(value)))}
													className="h-5 rounded-md px-1.5 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-35"
												>
													Clear
												</button>
											</span>
										) : null}
									</div>
								) : undefined}
							>
								{options.map((opt) => {
									const checked = selectedSet.has(opt.value);
									return (
										<CommandItem
											key={opt.value}
											value={opt.value}
											keywords={[opt.label, opt.group ?? ""]}
											data-checked={checked}
											onSelect={() => toggleSelection(opt.value)}
											className="min-h-8 rounded-md px-2 py-1.5 [&>svg:last-child]:hidden"
										>
											<span className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${checked ? "border-foreground bg-foreground text-background" : "border-border text-transparent"}`}>
												<Check className="size-3" />
											</span>
											{props.renderLeading ? <span className="shrink-0">{props.renderLeading(opt)}</span> : null}
											<span className="min-w-0 flex-1 truncate">{opt.label}</span>
										</CommandItem>
									);
								})}
							</CommandGroup>
								);
							})}
							</>
						)}
					</CommandList>
				</Command>
				<div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
					<Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!props.selected.length} onClick={() => props.onChange([])}>
						Clear
					</Button>
					{filteredValues.length ? (
						<Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => props.onChange(allFilteredSelected ? props.selected.filter((value) => !filteredValues.includes(value)) : uniqStrings([...props.selected, ...filteredValues]))}>
							{allFilteredSelected ? "Deselect matches" : "Select matches"}
						</Button>
					) : null}
				</div>
			</PopoverContent>
		</Popover>
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
	const viewportRef = useRef<HTMLDivElement>(null);
	// TanStack Virtual intentionally exposes imperative functions tied to the scroll viewport.
	// eslint-disable-next-line react-hooks/incompatible-library
	const rowVirtualizer = useVirtualizer({
		count: props.items.length,
		getScrollElement: () => viewportRef.current,
		estimateSize: () => (props.compact ? 49 : 57),
		overscan: 8,
	});

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
			viewportRef={viewportRef}
		>
			<ul className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
				{rowVirtualizer.getVirtualItems().map((virtualRow) => {
					const item = props.items[virtualRow.index];
					if (!item) return null;
					return (
					<li
						key={item.id}
						data-index={virtualRow.index}
						ref={rowVirtualizer.measureElement}
						className={`absolute left-0 top-0 flex w-full items-center justify-between border-b px-3 ${
							props.compact ? "gap-2.5 py-2" : "gap-3 py-2.5"
						}`}
						style={{ transform: `translateY(${virtualRow.start}px)` }}
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
					);
				})}
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
	compact?: boolean;
}) {
	if (!props.items.length) {
		return (
			<div className={props.compact ? "text-xs text-muted-foreground" : "rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground"}>
				{props.empty}
			</div>
		);
	}

	return (
		<div className={`flex flex-wrap ${props.compact ? "gap-1.5" : "gap-2"}`}>
			{props.items.map((item) => (
				<button
					key={item.id}
					type="button"
					onClick={() => props.onRemove(item.id)}
					className={`group inline-flex items-center border bg-background transition-colors hover:border-rose-200 hover:bg-rose-50 ${props.compact ? "gap-1.5 rounded-md px-2 py-1 text-xs" : "gap-2 rounded-full px-3 py-1.5 text-sm"}`}
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
	pickerTitle: string;
	pickerDescription?: string;
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
	inlineGroups?: boolean;
	groupActions?: boolean;
}) {
	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="space-y-1">
					<Label>{props.label}</Label>
					<p className="text-xs text-muted-foreground">{props.description}</p>
				</div>
				<SelectionCombobox
					title={props.pickerTitle}
					description={props.pickerDescription}
					options={props.options}
					selected={props.selected}
					onChange={props.onChange}
					renderLeading={props.renderLeading}
					inlineGroups={props.inlineGroups}
					groupActions={props.groupActions}
					trigger={
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={props.disabled}
							className="h-8 min-w-[148px]"
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
				compact
			/>
		</div>
	);
}

type PreviewModelProviderState = {
	providerId: string;
	accessible: boolean;
	reason: string;
	reasonCode: "available" | "provider_restriction" | "model_restriction" | "zdr_required" | "data_policy_unknown" | "data_policy_unverified" | "logging_disabled" | "training_disabled";
};

function capabilityPrivacyDecision(args: {
	row: ActiveProviderModel;
	capability: { id: string; dataPolicy: Record<string, unknown> | null };
	privacyZdrOnly: boolean;
	privacyEnableInputOutputLogging: boolean;
	privacyEnablePaidMayTrain: boolean;
	privacyEnableFreeMayTrain: boolean;
}): { accessible: boolean; reason: string; reasonCode: PreviewModelProviderState["reasonCode"] } {
	const policy = args.capability.dataPolicy;
	const stateful = ["batch", "files.upload", "files.list", "files.retrieve"].includes(args.capability.id);
	const tier = String(policy?.tier ?? (stateful ? "logs" : args.row.providerPolicy?.dataPolicyTier ?? "unknown"));
	const confidence = String(policy?.confidence ?? (stateful ? "confirmed" : args.row.providerPolicy?.dataPolicyConfidence ?? "unknown"));
	const zdrEligibility = String(policy?.zdrEligibility ?? (
		stateful
			? "ineligible"
			: args.row.providerPolicy?.zeroDataRetention === true
				? "eligible"
				: "ineligible"
	));

	if (args.privacyZdrOnly && zdrEligibility !== "eligible") {
		return {
			accessible: false,
			reasonCode: "zdr_required",
			reason: `${args.capability.id} is not verified as ZDR eligible (${zdrEligibility}).`,
		};
	}
	const privacyRestricted = args.privacyZdrOnly || !args.privacyEnableInputOutputLogging || !args.privacyEnablePaidMayTrain || !args.privacyEnableFreeMayTrain;
	if (privacyRestricted && tier === "unknown") {
		return { accessible: false, reasonCode: "data_policy_unknown", reason: `${args.capability.id} has no confirmed data policy.` };
	}
	if (privacyRestricted && confidence !== "confirmed") {
		return { accessible: false, reasonCode: "data_policy_unverified", reason: `${args.capability.id} data policy is ${confidence}, not confirmed.` };
	}
	if (!args.privacyEnableInputOutputLogging && tier === "logs") {
		return { accessible: false, reasonCode: "logging_disabled", reason: `${args.capability.id} may retain prompts or outputs.` };
	}
	if ((!args.privacyEnablePaidMayTrain && !args.privacyEnableFreeMayTrain) && tier === "trains") {
		return { accessible: false, reasonCode: "training_disabled", reason: `${args.capability.id} may train on prompts or outputs.` };
	}
	return { accessible: true, reasonCode: "available", reason: `${args.capability.id} meets the current privacy settings.` };
}

function buildProviderReason(args: {
	row: ActiveProviderModel;
	providerId: string;
	providerAllowed: boolean;
	modelAllowed: boolean;
	providerMode: ProviderRestrictionMode;
	selectedProviderIds: string[];
	selectedModelIds: string[];
	privacyZdrOnly: boolean;
	privacyEnableInputOutputLogging: boolean;
	privacyEnablePaidMayTrain: boolean;
	privacyEnableFreeMayTrain: boolean;
	accountProviderAllowed: boolean;
	accountModelAllowed: boolean;
}) {
	if (!args.accountProviderAllowed) return { reasonCode: "provider_restriction" as const, reason: "Blocked by the account provider rule." };
	if (!args.accountModelAllowed) return { reasonCode: "model_restriction" as const, reason: "Blocked by the account model rule." };
	if (!args.providerAllowed) {
		if (args.providerMode === "allowlist") {
			return { reasonCode: "provider_restriction" as const, reason: args.selectedProviderIds.length
				? "Blocked because this provider is outside the provider allowlist."
				: "Blocked because no providers were selected in the provider allowlist." };
		}
		if (args.providerMode === "blocklist") {
			return { reasonCode: "provider_restriction" as const, reason: "Blocked because this provider is included in the provider blocklist." };
		}
	}
	if (!args.modelAllowed) {
		return { reasonCode: "model_restriction" as const, reason: args.selectedModelIds.length
			? "Blocked because this model is outside the selected model allowlist."
			: "Blocked by the current model restriction." };
	}
	const capabilities = args.row?.capabilities?.length ? args.row.capabilities : [{ id: "inference", dataPolicy: null }];
	const decisions = capabilities.map((capability) => capabilityPrivacyDecision({ ...args, capability }));
	const available = decisions.filter((decision) => decision.accessible);
	if (available.length) {
		const blocked = decisions.length - available.length;
		return {
			reasonCode: "available" as const,
			reason: blocked ? `Reachable for ${available.length} capabilities; ${blocked} excluded by privacy settings.` : "Reachable with the current settings.",
		};
	}
	return decisions[0] ?? { reasonCode: "data_policy_unknown" as const, reason: "No capability has a confirmed compatible data policy." };
}

export default function GuardrailEditorPageClient(props: {
	accountPolicy: import("@/lib/fetchers/internal/settingsTypes").AccountPrivacyPolicy;
	mode: "create" | "edit";
	guardrailId: string | null;
	teamName: string | null;
	providers: ProviderOption[];
	activeProviderModels: ActiveProviderModel[];
	keys: KeyOption[];
	members: MemberOption[];
	initialGuardrail: GuardrailRow | null;
	initialKeyIds: string[];
	initialMemberIds: string[];
	backHref: string;
}) {
	const router = useRouter();
	const [expandedSections, setExpandedSections] = useQueryState(
		"sections",
		expandedSectionsParser,
	);
	const validExpandedSections = useMemo(
		() => expandedSections.filter((section) => GUARDRAIL_SECTION_IDS.has(section)),
		[expandedSections],
	);
	const activeSection = validExpandedSections[0] ?? null;
	const activeSectionDetails = activeSection
		? {
			access: {
				title: "Access",
				description: "Control data handling, provider access, and model access.",
			},
			"prompt-injection": {
				title: "Prompt Injection",
				description: "Detect and handle prompt injection before a request reaches a model.",
			},
			"sensitive-info": {
				title: "Sensitive Info Detection",
				description: "Detect and handle sensitive data before it leaves Phaseo.",
			},
			budgets: {
				title: "Budget Policies",
				description: "Set request and spend limits for this guardrail.",
			},
		}[activeSection]
		: null;
	const g = props.initialGuardrail;

	const normalizedProviders = useMemo(() => {
		const activeProviderIds = new Set(props.activeProviderModels.map((row) => row.providerId));
		const sourceProviders = activeProviderIds.size
			? props.providers.filter((provider) => activeProviderIds.has(provider.id))
			: props.providers;
		const providersByName = new Map<string, ProviderOption[]>();
		for (const provider of sourceProviders) {
			const key = String(provider.name ?? provider.id).trim().toLowerCase();
			providersByName.set(key, [...(providersByName.get(key) ?? []), provider]);
		}
		const inferredFamilyByName = new Map<string, string>();
		for (const [name, providers] of providersByName) {
			if (providers.length < 2) continue;
			const base = [...providers].sort((a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id))[0];
			if (base) inferredFamilyByName.set(name, base.id);
		}
		return sourceProviders.map((provider) => {
			const name = String(provider.name ?? provider.id).trim() || provider.id;
			const nameKey = name.toLowerCase();
			const explicitFamilyId = String(provider.familyId ?? "").trim();
			const scope = String(provider.offerScope ?? "").trim();
			return {
				...provider,
				name,
				familyId: explicitFamilyId || inferredFamilyByName.get(nameKey) || provider.id,
				offerLabel: String(provider.offerLabel ?? "").trim() || null,
				offerScope: (["global", "regional", "specialized"].includes(scope) ? scope : null) as ProviderOfferScope | null,
			};
		});
	}, [props.activeProviderModels, props.providers]);
	const providerFamilyNameById = useMemo(() => {
		const names = new Map<string, string>();
		for (const provider of normalizedProviders) {
			if (provider.id === provider.familyId || provider.offerScope === "global") {
				names.set(provider.familyId, provider.name);
			}
		}
		for (const provider of normalizedProviders) {
			if (!names.has(provider.familyId)) names.set(provider.familyId, provider.name);
		}
		return names;
	}, [normalizedProviders]);
	const providerById = useMemo(() => new Map(normalizedProviders.map((provider) => [provider.id, provider])), [normalizedProviders]);
	const providerOptions = useMemo(() => {
		const familyCounts = new Map<string, number>();
		for (const provider of normalizedProviders) {
			familyCounts.set(provider.familyId, (familyCounts.get(provider.familyId) ?? 0) + 1);
		}
		return normalizedProviders
			.map((provider) => {
				const familyName = providerFamilyNameById.get(provider.familyId) ?? provider.name;
				const hasVariants = (familyCounts.get(provider.familyId) ?? 0) > 1;
				const variant = provider.offerLabel || provider.offerScope
					? formatProviderOfferVariantLabel({
						providerId: provider.id,
						offerLabel: provider.offerLabel,
						offerScope: provider.offerScope,
					})
					: formatProviderIdVariant(provider.id, provider.familyId);
				return {
					value: provider.id,
					label: hasVariants ? `${familyName} — ${variant}` : provider.name,
					group: hasVariants ? familyName : undefined,
					variant,
					variantOrder: variant === "Standard" ? 0 : 1,
				};
			})
			.sort((a, b) =>
				(a.group ?? a.label).localeCompare(b.group ?? b.label) ||
				a.variantOrder - b.variantOrder ||
				a.label.localeCompare(b.label),
			);
	}, [normalizedProviders, providerFamilyNameById]);

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
		const options = new Map<string, SelectionOption>();
		for (const row of props.activeProviderModels) {
			if (options.has(row.apiModelId)) continue;
			const group = row.organisationName?.trim() || row.organisationId?.trim() || "Other";
			options.set(row.apiModelId, {
				value: row.apiModelId,
				label: formatModelPreviewTitle({
					organisationName: row.organisationName,
					organisationId: row.organisationId,
					internalModelName: row.internalModelName,
					internalModelId: row.internalModelId,
					apiModelId: row.apiModelId,
				}),
				group,
			});
		}
		return Array.from(options.values()).sort((a, b) =>
			(a.group ?? "").localeCompare(b.group ?? "") || a.label.localeCompare(b.label),
		);
	}, [props.activeProviderModels]);

	const keyOptions = useMemo(() => {
		return props.keys.map((k) => ({
			value: k.id,
			label: k.name,
		}));
	}, [props.keys]);
	const memberOptions = useMemo(() => props.members
		.map((member) => ({ value: member.id, label: member.name }))
		.sort((a, b) => a.label.localeCompare(b.label)), [props.members]);

	const providerLabelById = useMemo(() => {
		return new Map(providerOptions.map((provider) => [provider.value, provider.label]));
	}, [providerOptions]);
	const keyById = useMemo(() => {
		return new Map(props.keys.map((key) => [key.id, key]));
	}, [props.keys]);
	const memberById = useMemo(() => new Map(props.members.map((member) => [member.id, member])), [props.members]);
	const modelOrganisationByModelId = useMemo(() => {
		const map = new Map<string, { id: string; name: string }>();
		for (const row of props.activeProviderModels) {
			if (map.has(row.apiModelId)) continue;
			const fallbackId = row.apiModelId.split("/")[0] || "cloudflare";
			const id = row.organisationId?.trim() || fallbackId;
			map.set(row.apiModelId, { id, name: row.organisationName?.trim() || id });
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
			memberIds: props.initialMemberIds ?? [],
		};
	}, [g, props.initialKeyIds, props.initialMemberIds]);

	const [form, setForm] = useState(initial);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
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
				accountProviderRestrictionMode: props.accountPolicy.providerRestrictionMode,
				accountProviderRestrictionProviderIds: props.accountPolicy.providerRestrictionProviderIds,
				accountModelRestrictionMode: props.accountPolicy.modelRestrictionMode,
				accountModelRestrictionModelIds: props.accountPolicy.modelRestrictionModelIds,
			}),
		[
			form.allowedApiModelIds,
			form.modelRestrictionMode,
			form.providerRestrictionMode,
			form.providerRestrictionProviderIds,
			props.activeProviderModels,
			props.accountPolicy,
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
	const selectedMemberItems = useMemo(() => form.memberIds
		.map((memberId) => {
			const member = memberById.get(memberId);
			if (!member) return null;
			return { id: member.id, title: member.name, leading: <UserRound className="h-3.5 w-3.5 text-muted-foreground" /> };
		})
		.filter((item): item is NonNullable<typeof item> => Boolean(item)), [form.memberIds, memberById]);
	const selectedProviderItems = useMemo(() => {
		return form.providerRestrictionProviderIds.map((providerId) => ({
			id: providerId,
			title: providerLabelById.get(providerId) ?? providerId,
			leading: (
				<Logo
					id={resolveProviderLogoId({
						providerId,
						providerFamilyId: providerById.get(providerId)?.familyId,
					})}
					alt={`${providerLabelById.get(providerId) ?? providerId} logo`}
					width={14}
					height={14}
					className="h-3.5 w-3.5 rounded-sm"
				/>
			),
		}));
	}, [form.providerRestrictionProviderIds, providerById, providerLabelById]);
	const selectedModelItems = useMemo(() => {
		return form.allowedApiModelIds.map((modelId) => {
			const organisation = modelOrganisationByModelId.get(modelId) ?? { id: "cloudflare", name: "Model organisation" };
			return {
				id: modelId,
				title: modelLabelById.get(modelId) ?? modelId,
				leading: (
					<Logo
						id={getProviderLogoId(organisation.id)}
						alt={`${organisation.name} logo`}
						width={14}
						height={14}
						className="h-3.5 w-3.5 rounded-sm"
					/>
				),
			};
		});
	}, [form.allowedApiModelIds, modelLabelById, modelOrganisationByModelId]);
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
				const accountModelIds = props.accountPolicy.modelRestrictionModelIds;
				const accountModelAllowed = props.accountPolicy.modelRestrictionMode === "allowlist"
					? accountModelIds.includes(modelId)
					: props.accountPolicy.modelRestrictionMode === "blocklist"
						? !accountModelIds.includes(modelId)
						: true;
				const uniqueRouteRows = Array.from(new Map(rows.map((row) => [row.providerId, row])).values());
				const providerStates: PreviewModelProviderState[] = uniqueRouteRows
					.map((row) => {
						const providerAllowed = providerAllowedSet.has(row.providerId);
						const accountProviderIds = props.accountPolicy.providerRestrictionProviderIds;
						const accountProviderAllowed = props.accountPolicy.providerRestrictionMode === "allowlist"
							? accountProviderIds.includes(row.providerId)
							: props.accountPolicy.providerRestrictionMode === "blocklist"
								? !accountProviderIds.includes(row.providerId)
								: true;
						const decision = buildProviderReason({
							row,
							providerId: row.providerId,
							providerAllowed,
							modelAllowed,
							providerMode: form.providerRestrictionMode,
							selectedProviderIds: form.providerRestrictionProviderIds,
							selectedModelIds: form.allowedApiModelIds,
							privacyZdrOnly: form.privacyZdrOnly,
							privacyEnableInputOutputLogging: form.privacyEnableInputOutputLogging,
							privacyEnablePaidMayTrain: form.privacyEnablePaidMayTrain,
							privacyEnableFreeMayTrain: form.privacyEnableFreeMayTrain,
							accountProviderAllowed,
							accountModelAllowed,
						});
						return {
							providerId: row.providerId,
							accessible: providerAllowed && modelAllowed && decision.reasonCode === "available",
							reason: decision.reason,
							reasonCode: decision.reasonCode,
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
					organisationLabel: primary?.organisationName ?? primary?.organisationId ?? "Other",
					modelLabel: primary?.internalModelName ?? primary?.internalModelId ?? modelId,
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
							id={getProviderLogoId(primary?.organisationId ?? modelId.split("/")[0] ?? "cloudflare")}
							alt={`${primary?.organisationName ?? primary?.organisationId ?? "Model organisation"} logo`}
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
												id={resolveProviderLogoId({
													providerId: state.providerId,
													providerFamilyId: providerById.get(state.providerId)?.familyId,
												})}
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
			.sort((a, b) =>
				a.organisationLabel.localeCompare(b.organisationLabel) ||
				a.modelLabel.localeCompare(b.modelLabel),
			);
	}, [
		form.allowedApiModelIds,
		form.modelRestrictionMode,
		form.privacyEnableFreeMayTrain,
		form.privacyEnableInputOutputLogging,
		form.privacyEnablePaidMayTrain,
		form.privacyZdrOnly,
		form.providerRestrictionMode,
		form.providerRestrictionProviderIds,
		props.accountPolicy,
		props.activeProviderModels,
		providerLabelById,
		providerById,
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
	const modelCoverageCounts = useMemo(() => ({
		available: modelCoverageItems.filter((item) => item.available).length,
		unavailable: modelCoverageItems.filter((item) => !item.available).length,
	}), [modelCoverageItems]);

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

	function removeSelectedMember(memberId: string) {
		set("memberIds", form.memberIds.filter((id) => id !== memberId));
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
			const publications: GatewayPublicationResult[] = [];
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
				publications.push(created);
			} else if (props.mode === "edit" && props.guardrailId) {
				const updated = await updateGuardrail(props.guardrailId, {
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
				publications.push(updated);
			}

			if (guardrailId) {
				publications.push(...await Promise.all([
					setGuardrailKeys(guardrailId, form.keyIds),
					setGuardrailMembers(guardrailId, form.memberIds),
				]));
			}

			toast.success(gatewayMutationMessage("Guardrail saved", ...publications), { id: toastId });
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
			const result = await deleteGuardrail(props.guardrailId);
			toast.success(gatewayMutationMessage("Guardrail deleted", result), { id: toastId });
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
		<div className="space-y-6 [&_[data-slot=button]]:!rounded-md [&_[data-slot=select-trigger]]:!rounded-md">
			<div className="w-full space-y-6">
				{activeSection ? (
					<div className="space-y-4 border-b pb-5">
						<button
							type="button"
							onClick={() => void setExpandedSections([])}
							className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							<ChevronLeft className="h-4 w-4" />
							<span>Overview / {activeSectionDetails?.title}</span>
						</button>
						<div>
							<h1 className="text-2xl font-semibold tracking-tight">{activeSectionDetails?.title}</h1>
							<p className="mt-1 text-sm text-muted-foreground">{activeSectionDetails?.description}</p>
						</div>
					</div>
				) : null}
				{!activeSection ? <>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="min-w-0 flex-1">
						<Label htmlFor="guardrail-name" className="sr-only">
							Guardrail name
						</Label>
						<Input
							id="guardrail-name"
							value={form.name}
							onChange={(e) => set("name", e.target.value)}
							placeholder="New Guardrail"
							className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-4xl font-semibold leading-tight tracking-tight shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 md:text-3xl"
						/>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button asChild type="button" variant="outline" disabled={saving || deleting} className="rounded-md">
							<Link href={props.backHref}>Cancel</Link>
						</Button>
						<Button type="button" onClick={onSave} disabled={saving || deleting} className="rounded-md">
							{saving ? "Saving..." : props.mode === "create" ? "Create" : "Save"}
						</Button>
						{props.mode === "edit" ? (
							<Button type="button" variant="destructive" onClick={onDelete} disabled={saving || deleting} className="rounded-md">
								<Trash2 className="mr-2 h-4 w-4" />
								Delete
							</Button>
						) : null}
					</div>
				</div>

				<div className="space-y-6">
						<div className="space-y-5">
							<div className="space-y-3">
								<Textarea
									value={form.description}
									onChange={(e) => set("description", e.target.value)}
									placeholder="Who is this for? What does it restrict?"
									className="min-h-0 h-10 resize-none overflow-hidden rounded-none border-0 bg-transparent px-0 py-2 text-base text-muted-foreground shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0"
								/>
							</div>
							<div className="space-y-4 border-t pt-5">
								<div>
									<h2 className="text-sm font-semibold">Status & Assignments</h2>
									<p className="mt-1 text-sm text-muted-foreground">Enable this guardrail and choose who it protects.</p>
								</div>
								<div className="flex items-center justify-between gap-4 py-2">
									<div>
										<p className="text-sm font-medium">Enabled</p>
										<p className="mt-1 text-xs text-muted-foreground">Disabled guardrails remain configured but are not enforced.</p>
									</div>
									<Switch checked={form.enabled} onCheckedChange={(checked) => set("enabled", checked)} />
								</div>
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<div className="text-sm font-medium">Apply to members</div>
										<p className="text-xs text-muted-foreground">
											Enforce this policy on API keys created for selected members.
										</p>
									</div>
									<SelectionCombobox
										title="Select members"
										description="Members cannot edit or remove policies assigned by workspace owners or admins."
										options={memberOptions}
										selected={form.memberIds}
										onChange={(next) => set("memberIds", next)}
										trigger={<Button type="button" variant="outline" size="sm" className="h-8 rounded-md">{form.memberIds.length ? `${form.memberIds.length} selected` : "Select members"}</Button>}
									/>
								</div>
								<SelectedItemBadges items={selectedMemberItems} empty="No members selected yet." onRemove={removeSelectedMember} />
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<div className="text-sm font-medium">Apply to keys</div>
										<p className="text-xs text-muted-foreground">
											Attach this guardrail during creation instead of after the fact.
										</p>
									</div>
									<SelectionCombobox
										title="Select keys"
										description="Apply this guardrail to one or more keys."
										options={keyOptions}
										selected={form.keyIds}
										onChange={(next) => set("keyIds", next)}
										trigger={
											<Button type="button" variant="outline" size="sm" className="h-8 rounded-md">
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

					</div>

				<div>
					<h2 className="text-sm font-semibold">Configuration Groups</h2>
					<p className="mt-1 text-sm text-muted-foreground">Configure access, safety, and spending policies.</p>
				</div>
				</> : null}
				<Accordion
					type="multiple"
					value={validExpandedSections}
					onValueChange={(sections) => void setExpandedSections(sections.slice(-1))}
					className={activeSection ? "space-y-0" : "border-y border-border/70 py-1"}
				>
					<AccordionItem value="access" className={activeSection && activeSection !== "access" ? "hidden" : "border-0"}>
						<AccordionTrigger className={activeSection ? "hidden" : "gap-4 px-4 py-4 hover:bg-muted/20 hover:no-underline [&>svg:last-child]:-rotate-90"}>
							<div className="min-w-0 flex-1 text-left">
								<div className="text-sm font-medium">Access</div>
								<p className="mt-1 text-sm font-normal text-muted-foreground">
									Control privacy, provider access, and model access.
								</p>
							</div>
							<span className="hidden shrink-0 text-sm font-normal text-muted-foreground md:block">
								{privacyRestrictionCount ? `${privacyRestrictionCount} privacy rules, ` : ""}{describeProviderRestrictionMode(form.providerRestrictionMode)}
							</span>
						</AccordionTrigger>
						<AccordionContent disableAnimation className="pb-2 pt-0">
							<div className="space-y-4">
						<EditorSection
							title="Access"
							description="Control privacy eligibility first, then provider and model access."
							compact
						>
							<div className="space-y-6">
								<div>
									<h4 className="text-sm font-semibold">Data handling</h4>
									<p className="mt-1 text-xs text-muted-foreground">
										Set the minimum privacy requirements every routed request must meet.
									</p>
								</div>
								<div className="divide-y border-y">
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

								<div>
									<h4 className="text-sm font-semibold">Route access</h4>
									<p className="mt-1 text-xs text-muted-foreground">
										Narrow eligible routes by provider or model.
									</p>
								</div>
								{props.accountPolicy.providerRestrictionMode !== "none" || props.accountPolicy.modelRestrictionMode !== "none" ? (
									<div className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
										<span className="text-muted-foreground">
											Account Privacy applies first; blocked routes remain unavailable here.
										</span>
										<Button asChild type="button" variant="ghost" size="sm" className="h-7 justify-start px-2 sm:justify-center">
											<Link href="/settings/privacy">Review workspace privacy</Link>
										</Button>
									</div>
								) : null}
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
											<SelectTrigger className="w-full">
												<SelectValue>{getRestrictionModeLabel(form.providerRestrictionMode, "providers")}</SelectValue>
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
										pickerTitle="Select providers"
										pickerDescription="Choose providers for this guardrail."
											options={providerOptions}
											selected={form.providerRestrictionProviderIds}
											onChange={(next) => set("providerRestrictionProviderIds", next)}
											selectedItems={selectedProviderItems}
											onRemove={removeSelectedProvider}
										empty={
											form.providerRestrictionMode === "none"
												? "No providers restricted."
												: "No providers selected yet."
											}
											triggerLabel={
												form.providerRestrictionMode === "none"
													? "Choose providers"
													: form.providerRestrictionProviderIds.length
														? `${form.providerRestrictionProviderIds.length} selected`
														: "Choose providers"
											}
										renderLeading={(opt) => (
												<Logo
											id={resolveProviderLogoId({
												providerId: opt.value,
												providerFamilyId: providerById.get(opt.value)?.familyId,
											})}
													alt={`${opt.label} logo`}
													width={18}
													height={18}
													className="h-[18px] w-[18px] rounded-sm"
												/>
										)}
										inlineGroups
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
											<SelectTrigger className="w-full">
												<SelectValue>{getRestrictionModeLabel(form.modelRestrictionMode, "models")}</SelectValue>
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
										pickerTitle="Select models"
										pickerDescription="Choose models for this guardrail after provider filtering."
											options={modelOptions}
											selected={form.allowedApiModelIds}
											onChange={(next) => set("allowedApiModelIds", next)}
											selectedItems={selectedModelItems}
											onRemove={removeSelectedModel}
										empty={
											form.modelRestrictionMode === "none"
												? "No models restricted."
												: "No models selected yet."
											}
											triggerLabel={
												form.modelRestrictionMode === "none"
													? "Choose models"
													: form.allowedApiModelIds.length
														? `${form.allowedApiModelIds.length} selected`
														: "Choose models"
											}
										renderLeading={(opt) => {
											const organisation = modelOrganisationByModelId.get(opt.value) ?? { id: "cloudflare", name: "Model organisation" };
											return (
												<Logo
													id={getProviderLogoId(organisation.id)}
													alt={`${organisation.name} logo`}
														width={18}
														height={18}
														className="h-[18px] w-[18px] rounded-sm"
													/>
											);
										}}
										groupActions
									/>
									</div>
								</div>

								<Separator />

								<div className="rounded-xl border bg-muted/10 p-4">
									<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
										<div>
											<div className="text-sm font-medium text-muted-foreground">
												Effective availability
											</div>
											<div className="mt-1 text-2xl font-semibold tracking-tight">
												{modelCoverageCounts.available} of {modelCoverageItems.length} models routable
											</div>
										</div>
										<div className="text-xs text-muted-foreground sm:text-right">
											<div>{restrictionPreview.reachableModelIds.length} passed access rules</div>
											<div>{modelCoverageCounts.unavailable} excluded after all checks</div>
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
											All ({modelCoverageItems.length})
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
											Available ({modelCoverageCounts.available})
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
											Unavailable ({modelCoverageCounts.unavailable})
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
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="prompt-injection" className={activeSection && activeSection !== "prompt-injection" ? "hidden" : "border-0"}>
						<AccordionTrigger className={activeSection ? "hidden" : "gap-4 px-4 py-4 hover:bg-muted/20 hover:no-underline [&>svg:last-child]:-rotate-90"}>
							<div className="min-w-0 flex-1 text-left">
								<div className="text-sm font-medium">Prompt Injection</div>
								<p className="mt-1 text-sm font-normal text-muted-foreground">Scan request content before routing.</p>
							</div>
							<span className="hidden shrink-0 text-sm font-normal capitalize text-muted-foreground md:block">
								{form.promptInjectionEnabled ? form.promptInjectionAction : "Disabled"}
							</span>
						</AccordionTrigger>
						<AccordionContent disableAnimation className="pb-2 pt-0">
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
									<SelectValue>{getHandlingLabel(getHandlingState({ enabled: form.promptInjectionEnabled, action: form.promptInjectionAction }))}</SelectValue>
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
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="sensitive-info" className={activeSection && activeSection !== "sensitive-info" ? "hidden" : "border-0"}>
						<AccordionTrigger className={activeSection ? "hidden" : "gap-4 px-4 py-4 hover:bg-muted/20 hover:no-underline [&>svg:last-child]:-rotate-90"}>
							<div className="min-w-0 flex-1 text-left">
								<div className="text-sm font-medium">Sensitive Info Detection</div>
								<p className="mt-1 text-sm font-normal text-muted-foreground">Detect and handle sensitive data before requests leave Phaseo.</p>
							</div>
							<span className="hidden shrink-0 text-sm font-normal text-muted-foreground md:block">
								{form.sensitiveInfoEnabled ? `${enabledSensitiveInfoRuleCount} rules enabled` : "Disabled"}
							</span>
						</AccordionTrigger>
						<AccordionContent disableAnimation className="pb-2 pt-0">
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
										<SelectValue>{getHandlingLabel(getHandlingState({ enabled: form.sensitiveInfoEnabled, action: form.sensitiveInfoDefaultAction }))}</SelectValue>
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
														<SelectValue>{getHandlingLabel(getHandlingState({ enabled: form.sensitiveInfoEnabled && currentRule.enabled, action: currentRule.action }))}</SelectValue>
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
																		<SelectValue>{getHandlingLabel(getHandlingState({ enabled: form.sensitiveInfoEnabled && rule.enabled, action: rule.action }))}</SelectValue>
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
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="budgets" className={activeSection && activeSection !== "budgets" ? "hidden" : "border-0"}>
						<AccordionTrigger className={activeSection ? "hidden" : "gap-4 px-4 py-4 hover:bg-muted/20 hover:no-underline [&>svg:last-child]:-rotate-90"}>
							<div className="min-w-0 flex-1 text-left">
								<div className="text-sm font-medium">Budget Policies</div>
								<p className="mt-1 text-sm font-normal text-muted-foreground">Set request and spend ceilings by time window.</p>
							</div>
							<span className="hidden shrink-0 text-sm font-normal text-muted-foreground md:block">
								{configuredBudgetCount ? `${configuredBudgetCount} limits configured` : "No limits"}
							</span>
						</AccordionTrigger>
						<AccordionContent disableAnimation className="pb-2 pt-0">
							<div className="space-y-4">
						<EditorSection
							title="Budgets"
							description="Leave a field blank for unlimited."
							compact
						>
							<div className="space-y-4">
								<Alert>
									<Info />
									<div>
										<AlertTitle>Aggregate guardrail budgets are not yet enforced</AlertTitle>
										<AlertDescription>
											Use API key limits for hard request and spend enforcement while member and workspace aggregation is completed.
										</AlertDescription>
									</div>
								</Alert>
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
						</AccordionContent>
					</AccordionItem>
				</Accordion>

				{activeSection ? <div className="flex justify-end gap-2 border-t pt-4">
					<Button asChild type="button" variant="outline" disabled={saving || deleting} className="rounded-md">
						<Link href={props.backHref}>Cancel</Link>
					</Button>
					<Button type="button" onClick={onSave} disabled={saving || deleting} className="rounded-md">
						{saving ? "Saving..." : props.mode === "create" ? "Create" : "Save"}
					</Button>
				</div> : null}
			</div>
		</div>
	);
}
