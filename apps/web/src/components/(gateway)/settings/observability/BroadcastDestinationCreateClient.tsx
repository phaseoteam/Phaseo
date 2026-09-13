"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	ArrowLeft,
	Check,
	ChevronsUpDown,
	Filter,
	FlaskConical,
	Gauge,
	KeyRound,
	CircleDollarSign,
	Fingerprint,
	Plus,
	Plug,
	Route,
	Save,
	SendHorizontal,
	Shield,
	Sparkles,
	Trash2,
	Webhook,
	X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { Separator } from "@/components/ui/separator";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	createBroadcastDestinationAction,
} from "@/app/(dashboard)/settings/broadcast/actions";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import type { DestinationDefinition } from "@/components/(gateway)/settings/observability/destinationCatalog";

type KeyOption = {
	id: string;
	name: string | null;
	prefix: string | null;
};

type Option = {
	value: string;
	label: string;
	logoId?: string | null;
	subtitle?: string | null;
};

type RuleField =
	| "model"
	| "provider"
	| "session_id"
	| "user_id"
	| "api_key_name"
	| "finish_reason"
	| "input"
	| "output"
	| "token_cost"
	| "total_cost"
	| "total_tokens"
	| "prompt_tokens"
	| "completion_tokens";

type RuleCondition =
	| "equals"
	| "not_equals"
	| "contains"
	| "not_contains"
	| "starts_with"
	| "ends_with"
	| "exists"
	| "not_exists"
	| "matches_regex";

type Rule = {
	id: string;
	field: RuleField;
	condition: RuleCondition;
	value: string;
};

type GroupLogic = "and" | "or";

type RuleGroup = {
	id: string;
	match: GroupLogic;
	rules: Rule[];
};

const RULE_FIELDS: Array<{ id: RuleField; label: string; textBased: boolean }> = [
	{ id: "model", label: "Model", textBased: true },
	{ id: "provider", label: "Provider", textBased: true },
	{ id: "session_id", label: "Session ID", textBased: true },
	{ id: "user_id", label: "User ID", textBased: true },
	{ id: "api_key_name", label: "API Key Name", textBased: true },
	{ id: "finish_reason", label: "Finish Reason", textBased: true },
	{ id: "input", label: "Input", textBased: true },
	{ id: "output", label: "Output", textBased: true },
	{ id: "token_cost", label: "Token Cost", textBased: false },
	{ id: "total_cost", label: "Total Cost", textBased: false },
	{ id: "total_tokens", label: "Total Tokens", textBased: false },
	{ id: "prompt_tokens", label: "Prompt Tokens", textBased: false },
	{ id: "completion_tokens", label: "Completion Tokens", textBased: false },
];

const RULE_FIELD_OPTIONS: Option[] = RULE_FIELDS.map((field) => ({
	value: field.id,
	label: field.label,
}));

const TEXT_CONDITIONS: RuleCondition[] = [
	"equals",
	"not_equals",
	"contains",
	"not_contains",
	"starts_with",
	"ends_with",
	"exists",
	"not_exists",
	"matches_regex",
];

const BASIC_CONDITIONS: RuleCondition[] = ["equals", "not_equals", "exists", "not_exists"];

const CONDITION_LABELS: Record<RuleCondition, string> = {
	equals: "Equals",
	not_equals: "Does Not Equal",
	contains: "Contains",
	not_contains: "Does Not Contain",
	starts_with: "Starts With",
	ends_with: "Ends With",
	exists: "Exists",
	not_exists: "Does Not Exist",
	matches_regex: "Matches Regex",
};

function id(prefix: string) {
	return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function getProviderLogoId(providerId: string) {
	const normalized = providerId.toLowerCase();
	if (normalized === "bedrock" || normalized.includes("bedrock")) {
		return "amazon-bedrock";
	}
	return normalized;
}

function defaultRule(): Rule {
	return { id: id("rule"), field: "model", condition: "equals", value: "" };
}

function defaultRuleGroup(index: number): RuleGroup {
	return {
		id: id("group"),
		match: "and",
		rules: [defaultRule()],
	};
}

function RuleOptionItem({ option, isProvider }: { option: Option; isProvider?: boolean }) {
	const logoId = option.logoId
		? isProvider
			? getProviderLogoId(option.logoId)
			: option.logoId
		: null;

	return (
		<div className="flex min-w-0 items-center gap-2">
			{logoId ? (
				<Logo
					id={logoId}
					variant="auto"
					width={14}
					height={14}
					className="h-3.5 w-3.5 shrink-0 object-contain"
				/>
			) : null}
			<div className="min-w-0">
				<div className="truncate">{option.label}</div>
				{option.subtitle ? (
					<div className="truncate text-[10px] text-muted-foreground">{option.subtitle}</div>
				) : null}
			</div>
		</div>
	);
}

function RuleCombobox(props: {
	value: string;
	options: Option[];
	placeholder: string;
	searchPlaceholder: string;
	onChange: (value: string) => void;
	isProvider?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const listViewportRef = useRef<HTMLDivElement>(null);
	const pageScrollTopRef = useRef(0);
	const selected = props.options.find((option) => option.value === props.value);

	useLayoutEffect(() => {
		if (!open) return;
		window.scrollTo({ top: pageScrollTopRef.current, left: window.scrollX });
		const frame = window.requestAnimationFrame(() => {
			window.scrollTo({ top: pageScrollTopRef.current, left: window.scrollX });
			searchInputRef.current?.focus({ preventScroll: true });
		});
		return () => window.cancelAnimationFrame(frame);
	}, [open]);

	return (
		<Popover open={open} onOpenChange={(next) => {
			if (next) pageScrollTopRef.current = window.scrollY;
			setOpen(next);
		}}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-label={selected ? `${props.placeholder}: ${selected.label}` : props.placeholder}
					className="h-9 w-full min-w-0 justify-between rounded-md px-3 text-xs font-normal"
				>
					<span className="min-w-0 truncate">
						{selected ? selected.label : props.placeholder}
					</span>
					<ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent initialFocus={false} align="start" className="w-(--anchor-width) min-w-[240px] rounded-md p-0">
				<Command className="rounded-md">
					<CommandInput ref={searchInputRef} placeholder={props.searchPlaceholder} />
					<ScrollArea
						className="h-72"
						viewportClassName="overscroll-contain p-1"
						viewportRef={listViewportRef}
						keepScrollbarMounted
					>
						<CommandList className="max-h-none overflow-visible p-0">
							<CommandEmpty>No matching options.</CommandEmpty>
							{props.options.map((option) => (
								<CommandItem
									key={option.value}
									value={`${option.label} ${option.subtitle ?? ""} ${option.value}`}
									className="rounded-md"
									onSelect={() => {
										props.onChange(option.value);
										setOpen(false);
									}}
								>
									<Check className={`h-4 w-4 ${props.value === option.value ? "opacity-100" : "opacity-0"}`} />
									<RuleOptionItem option={option} isProvider={props.isProvider} />
								</CommandItem>
							))}
						</CommandList>
					</ScrollArea>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function KeyMultiCombobox(props: {
	title: string;
	description: string;
	keys: KeyOption[];
	selected: string[];
	disabledIds: string[];
	onChange: (next: string[]) => void;
	getLabel: (key: KeyOption) => string;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const searchInputRef = useRef<HTMLInputElement>(null);
	const listViewportRef = useRef<HTMLDivElement>(null);
	const pageScrollTopRef = useRef(0);
	const selectedKeys = props.keys.filter((key) => props.selected.includes(key.id));

	useLayoutEffect(() => {
		if (!open) return;
		window.scrollTo({ top: pageScrollTopRef.current, left: window.scrollX });
		const frame = window.requestAnimationFrame(() => {
			window.scrollTo({ top: pageScrollTopRef.current, left: window.scrollX });
			searchInputRef.current?.focus({ preventScroll: true });
		});
		return () => window.cancelAnimationFrame(frame);
	}, [open]);
	return (
		<div className="space-y-1.5">
			<Label className="text-xs font-medium">
				{props.title} <span className="font-normal text-muted-foreground">(optional)</span>
			</Label>
			<p className="sr-only">{props.description}</p>
			<Popover open={open} onOpenChange={(next) => {
				if (next) pageScrollTopRef.current = window.scrollY;
				setOpen(next);
				if (!next) setQuery("");
			}}>
				<PopoverTrigger asChild>
					<Button variant="outline" role="combobox" aria-expanded={open} className="h-10 w-full justify-between rounded-md px-3 font-normal">
						<span className={props.selected.length ? "text-foreground" : "text-muted-foreground"}>
							{props.selected.length ? `${props.selected.length} key${props.selected.length === 1 ? "" : "s"} selected` : "Select API keys"}
						</span>
						<ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
					</Button>
				</PopoverTrigger>
				<PopoverContent initialFocus={false} align="start" className="w-(--anchor-width) min-w-[360px] rounded-md p-0">
					<Command className="rounded-md">
						<CommandInput ref={searchInputRef} placeholder="Search API keys..." value={query} onValueChange={setQuery} />
						<ScrollArea
							className="h-72"
							viewportClassName="overscroll-contain p-1"
							viewportRef={listViewportRef}
							keepScrollbarMounted
						>
							<CommandList className="max-h-none overflow-visible p-0">
								<CommandEmpty>No API keys found.</CommandEmpty>
								{props.keys.map((key) => {
								const checked = props.selected.includes(key.id);
								const disabled = props.disabledIds.includes(key.id);
								return (
									<CommandItem
										key={key.id}
										value={`${props.getLabel(key)} ${key.prefix ?? ""} ${key.id}`}
										disabled={disabled}
										data-checked={checked}
										className="rounded-md"
										onSelect={() => { props.onChange(checked ? props.selected.filter((id) => id !== key.id) : [...props.selected, key.id]); setQuery(""); }}
									>
										<Check className={`h-4 w-4 ${checked ? "opacity-100" : "opacity-0"}`} />
										<span className="min-w-0 flex-1 truncate">{props.getLabel(key)}</span>
										{disabled ? <span className="text-[10px] text-muted-foreground">Selected opposite</span> : null}
									</CommandItem>
								);
								})}
							</CommandList>
						</ScrollArea>
					</Command>
				</PopoverContent>
			</Popover>
			{selectedKeys.length ? (
				<div className="flex flex-wrap gap-1.5 pt-0.5">
					{selectedKeys.map((key) => (
						<Badge key={key.id} variant="outline" className="max-w-full gap-1 rounded-md pr-1 font-normal">
							<span className="truncate">{props.getLabel(key)}</span>
							<button type="button" aria-label={`Remove ${props.getLabel(key)}`} onClick={() => props.onChange(props.selected.filter((id) => id !== key.id))} className="rounded-md p-0.5 hover:bg-muted">
								<X className="h-3 w-3" />
							</button>
						</Badge>
					))}
				</div>
			) : null}
		</div>
	);
}

export default function BroadcastDestinationCreateClient(props: {
	destination: DestinationDefinition;
	teamName: string | null;
	workspaceId: string;
	providerOptions: Option[];
	modelOptions: Option[];
	keys: KeyOption[];
}) {
	const { destination, keys, providerOptions, modelOptions, workspaceId } = props;
	const router = useRouter();
	const [destinationName, setDestinationName] = useState(destination.label);
	const [excludePromptsAndOutputs, setExcludePromptsAndOutputs] = useState(
		destination.id === "otel_collector",
	);
	const [samplingRate, setSamplingRate] = useState("1");
	const [config, setConfig] = useState<Record<string, string>>(
		Object.fromEntries(
			destination.fields.map((field) => [field.key, field.key === "method" ? "POST" : ""]),
		),
	);
	const [isTestingConnection, setIsTestingConnection] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [includedKeyIds, setIncludedKeyIds] = useState<string[]>([]);
	const [excludedKeyIds, setExcludedKeyIds] = useState<string[]>([]);
	const [includeGenerationMetadata, setIncludeGenerationMetadata] = useState(true);
	const [includeCostMetadata, setIncludeCostMetadata] = useState(true);
	const [includeIdentityMetadata, setIncludeIdentityMetadata] = useState(true);
	const [includeRequestContext, setIncludeRequestContext] = useState(true);
	const [groupJoin, setGroupJoin] = useState<GroupLogic>("or");
	const [ruleGroups, setRuleGroups] = useState<RuleGroup[]>([]);

	const parsedSamplingRate = Number(samplingRate);
	const samplingValid =
		Number.isFinite(parsedSamplingRate) && parsedSamplingRate >= 0 && parsedSamplingRate <= 1;
	const hasDestinationName = destinationName.trim().length > 0;

	const hasAllRequiredConnectionValues = useMemo(
		() =>
			destination.fields.every((field) => {
				const required = field.required !== false;
				if (!required) return true;
				return (config[field.key] ?? "").trim().length > 0;
			}),
		[config, destination.fields],
	);

	const canSave = hasDestinationName && hasAllRequiredConnectionValues && samplingValid;

	async function handleSave() {
		if (!canSave || isSaving) return;
		setIsSaving(true);
		try {
			await createBroadcastDestinationAction({
				destinationId: destination.id,
				name: destinationName.trim(),
				config,
				privacyExcludePromptsAndOutputs: excludePromptsAndOutputs,
				samplingRate: parsedSamplingRate,
				groupJoin,
				includeKeyIds: includedKeyIds,
				excludeKeyIds: excludedKeyIds,
				includeGenerationMetadata,
				includeCostMetadata,
				includeIdentityMetadata,
				includeRequestContext,
				ruleGroups: ruleGroups.map((group) => ({
					match: group.match,
					rules: group.rules.map((rule) => ({
						field: rule.field,
						condition: rule.condition,
						value: rule.value,
					})),
				})),
			});
			toast.success("Broadcast destination saved");
			router.push("/settings/broadcast");
			router.refresh();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to save destination";
			toast.error(message);
		} finally {
			setIsSaving(false);
		}
	}

	async function handleTestConnection() {
		if (isTestingConnection) return;
		setIsTestingConnection(true);
		try {
			const result = await fetchAccountWebApi<
				| { ok: true; status: string; httpStatus: number | null; endpoint: string; headerCount: number }
				| { ok: false; status: string }
			>("/api/account/settings/broadcast/test-config", await getBrowserAccessToken(), {
				method: "POST",
				body: JSON.stringify({ destinationId: destination.id, config, workspaceId }),
			});
			if (result.ok) {
				toast.success("Connection verified");
				return;
			}
			toast.error("Connection check failed");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Connection check failed";
			toast.error(message);
		} finally {
			setIsTestingConnection(false);
		}
	}

	function addRuleGroup() {
		setRuleGroups((prev) => [...prev, defaultRuleGroup(prev.length)]);
	}

	function removeRuleGroup(groupId: string) {
		setRuleGroups((prev) => prev.filter((group) => group.id !== groupId));
	}

	function patchRuleGroup(groupId: string, patch: Partial<RuleGroup>) {
		setRuleGroups((prev) =>
			prev.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
		);
	}

	function addRule(groupId: string) {
		setRuleGroups((prev) =>
			prev.map((group) =>
				group.id === groupId ? { ...group, rules: [...group.rules, defaultRule()] } : group,
			),
		);
	}

	function removeRule(groupId: string, ruleId: string) {
		setRuleGroups((prev) =>
			prev.map((group) => {
				if (group.id !== groupId) return group;
				return { ...group, rules: group.rules.filter((rule) => rule.id !== ruleId) };
			}),
		);
	}

	function patchRule(groupId: string, ruleId: string, patch: Partial<Rule>) {
		setRuleGroups((prev) =>
			prev.map((group) => {
				if (group.id !== groupId) return group;
				return {
					...group,
					rules: group.rules.map((rule) =>
						rule.id === ruleId ? { ...rule, ...patch } : rule,
					),
				};
			}),
		);
	}

	function getKeyLabel(key: KeyOption) {
		return key.name ?? key.prefix ?? key.id.slice(0, 8);
	}

	return (
		<div className="space-y-8 [&_[data-slot=button]]:rounded-md [&_[data-slot=input]]:rounded-md [&_[data-slot=select-trigger]]:rounded-md">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<Link
						href="/settings/broadcast"
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
						prefetch={false}
					>
						<ArrowLeft className="h-3.5 w-3.5" />
						Back to Destinations
					</Link>
					<div className="flex items-center gap-2">
						{destination.id === "webhook" ? (
							<div className="flex h-5 w-5 items-center justify-center rounded bg-muted/60 text-muted-foreground">
								<Webhook className="h-3.5 w-3.5" />
							</div>
						) : destination.logoId ? (
							<Logo
								id={destination.logoId}
								variant="auto"
								width={20}
								height={20}
								className="h-5 w-5 object-contain"
							/>
						) : null}
						<h2 className="text-base font-semibold tracking-tight">
							New {destination.label} Destination
						</h2>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button disabled={!canSave || isSaving} onClick={handleSave}>
						<Save className="mr-2 h-4 w-4" />
						{isSaving ? "Saving..." : "Save Destination"}
					</Button>
				</div>
			</div>

			<section className="space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<Plug className="h-4 w-4" />
						<h3 className="text-sm font-semibold">Connection</h3>
					</div>
					<div className="flex items-center gap-2">
						<Button variant="outline" onClick={handleTestConnection} disabled={isTestingConnection || !hasAllRequiredConnectionValues}>
							<FlaskConical className="mr-2 h-4 w-4" />
							{isTestingConnection ? "Testing..." : "Test Connection"}
						</Button>
						<Button variant="outline" disabled title="Save destination before sending a sample trace.">
							<SendHorizontal className="mr-2 h-4 w-4" />
							Send Sample Trace
						</Button>
					</div>
				</div>
				<div className="grid gap-x-4 gap-y-3 lg:grid-cols-2">
					<div className="space-y-2">
						<Label>Destination Name</Label>
						<Input
							value={destinationName}
							onChange={(e) => setDestinationName(e.target.value)}
							placeholder={`${destination.label} Production`}
						/>
					</div>
					{destination.fields.map((field) => (
						<div key={field.key} className="space-y-1.5">
							<Label className="text-xs font-medium">
								{field.label.replace(/\s*\(Optional\)$/i, "")}
								{field.required === false ? (
									<span className="ml-1 text-muted-foreground">(optional)</span>
								) : null}
							</Label>
							{field.key === "method" ? (
								<Select
									value={(config[field.key] ?? "POST").toUpperCase()}
									onValueChange={(value) =>
										setConfig((prev) => ({ ...prev, [field.key]: value }))
									}
								>
									<SelectTrigger className="w-full rounded-md">
										<SelectValue placeholder="Select method" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="POST">POST</SelectItem>
										<SelectItem value="PUT">PUT</SelectItem>
									</SelectContent>
								</Select>
							) : (
								<Input
									type={field.type === "password" ? "password" : "text"}
									value={config[field.key] ?? ""}
									onChange={(e) =>
										setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))
									}
									placeholder={field.placeholder}
								/>
							)}
						</div>
					))}
				</div>
			</section>

			<section className="grid gap-4 border-y border-border/60 py-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
				<div className="space-y-2">
					<div className="inline-flex items-center gap-2">
						<Sparkles className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold">Additional Metadata</h3>
					</div>
					<p className="text-xs text-muted-foreground">Choose which structured context accompanies each trace.</p>
				</div>
				<div className="divide-y divide-border/50 rounded-md border border-border/60">
					{[
						{ label: "Generation Metadata", description: "Model, provider, routing outcome, token usage and generation timing.", icon: Sparkles, checked: includeGenerationMetadata, change: setIncludeGenerationMetadata },
						{ label: "Cost", description: "Calculated request cost and billing currency.", icon: CircleDollarSign, checked: includeCostMetadata, change: setIncludeCostMetadata },
						{ label: "Identity", description: "Application, API key, user origin and request identity fields.", icon: Fingerprint, checked: includeIdentityMetadata, change: setIncludeIdentityMetadata },
						{ label: "Request Context", description: "Correlation, endpoint, model, routing and request context fields.", icon: Route, checked: includeRequestContext, change: setIncludeRequestContext },
					].map((option) => (
						<label key={option.label} className="flex items-center gap-3 px-3 py-2.5">
							<option.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
							<span className="min-w-0 flex-1">
								<span className="block text-sm font-medium">{option.label}</span>
								<span className="block text-xs text-muted-foreground">{option.description}</span>
							</span>
							<Checkbox checked={option.checked} onCheckedChange={(checked) => option.change(Boolean(checked))} />
						</label>
					))}
				</div>
			</section>

			<div className="divide-y divide-border/60 border-b border-border/60">
				<section className="grid gap-4 py-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
					<div className="space-y-2">
						<div className="inline-flex items-center gap-2">
							<Shield className="h-4 w-4 text-muted-foreground" />
							<h3 className="text-sm font-semibold">Privacy</h3>
						</div>
						<p className="text-xs text-muted-foreground">
							Control what data is sent to this destination.
						</p>
					</div>
					<div className="space-y-2">
						<Label className="text-xs font-medium">Privacy Mode</Label>
						<label className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
							<Checkbox
								checked={excludePromptsAndOutputs}
								onCheckedChange={(checked) => setExcludePromptsAndOutputs(Boolean(checked))}
								className="mt-0.5"
							/>
							<span className="text-sm text-foreground/90">
								When enabled, excludes prompt and completion data from traces.
							</span>
						</label>
					</div>
				</section>

				<section className="grid gap-4 py-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
					<div className="space-y-2">
						<div className="inline-flex items-center gap-2">
							<Gauge className="h-4 w-4 text-muted-foreground" />
							<h3 className="text-sm font-semibold">Sampling</h3>
						</div>
						<p className="text-xs text-muted-foreground">
							Set the probability that an eligible trace is sent to this destination.
						</p>
					</div>
					<div className="space-y-2">
						<Label className="text-xs font-medium">Rate</Label>
						<Input
							type="number"
							min="0"
							max="1"
							step="0.001"
							value={samplingRate}
							onChange={(e) => setSamplingRate(e.target.value)}
							className="h-10 w-full"
						/>
						{samplingRate.length > 0 && !samplingValid ? (
							<p className="text-xs text-destructive">Sampling rate must be between 0 and 1.</p>
						) : null}
					</div>
				</section>

				<section className="grid gap-4 py-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
					<div className="space-y-2">
						<div className="inline-flex items-center gap-2">
							<KeyRound className="h-4 w-4 text-muted-foreground" />
							<h3 className="text-sm font-semibold">API Key Filter</h3>
						</div>
						<p className="text-xs text-muted-foreground">
							Optionally filter traces by API key.
						</p>
					</div>
					{keys.length ? (
						<div className="space-y-4">
							<KeyMultiCombobox title="Included API Keys" description="When selected, only these keys send traces." keys={keys} selected={includedKeyIds} disabledIds={excludedKeyIds} onChange={setIncludedKeyIds} getLabel={getKeyLabel} />
							<KeyMultiCombobox title="Excluded API Keys" description="These keys never send traces to this destination." keys={keys} selected={excludedKeyIds} disabledIds={includedKeyIds} onChange={setExcludedKeyIds} getLabel={getKeyLabel} />
						</div>
					) : (
						<p className="text-xs text-muted-foreground">No API keys found for this workspace.</p>
					)}
				</section>
			</div>

			<section className="space-y-4">
				<div className="flex flex-wrap items-start justify-between gap-2">
					<div>
						<h3 className="inline-flex items-center gap-1.5 text-sm font-medium">
							<Filter className="h-4 w-4" />
							Filter Rules
						</h3>
						<p className="text-xs text-muted-foreground">
							Only traces matching these rule groups will be sent.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Label className="text-xs text-muted-foreground">Between Groups</Label>
						<Select value={groupJoin} onValueChange={(value) => setGroupJoin(value as GroupLogic)}>
							<SelectTrigger className="h-8 w-[220px] rounded-md">
								<SelectValue>{groupJoin === "and" ? "All Groups (AND)" : "Any Group (OR)"}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="or">Any Group (OR)</SelectItem>
								<SelectItem value="and">All Groups (AND)</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="space-y-5">
					{ruleGroups.length === 0 ? (
						<div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
							No rule groups yet. Add a rule group to start filtering traces.
						</div>
					) : null}
					{ruleGroups.map((group, groupIndex) => (
						<div key={group.id} className="space-y-3 rounded-md border border-border/60 p-3">
							<div className="space-y-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex min-w-0 flex-1 items-center gap-2">
									<p className="min-w-[140px] text-sm font-medium text-foreground/90">
										Rule Group {groupIndex + 1}
									</p>
									<Select
										value={group.match}
										onValueChange={(value) =>
											patchRuleGroup(group.id, { match: value as GroupLogic })
										}
									>
										<SelectTrigger className="h-8 w-[240px] rounded-md">
											<SelectValue>{group.match === "and" ? "All Rules Must Match (AND)" : "Any Rule Can Match (OR)"}</SelectValue>
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="and">All Rules Must Match (AND)</SelectItem>
											<SelectItem value="or">Any Rule Can Match (OR)</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<Button
									size="icon"
									variant="ghost"
									onClick={() => removeRuleGroup(group.id)}
									className="hover:text-destructive"
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>

							<div className="space-y-2">
								{group.rules.map((rule) => {
									const field = RULE_FIELDS.find((f) => f.id === rule.field) ?? RULE_FIELDS[0]!;
									const isEnumeratedField = rule.field === "model" || rule.field === "provider";
									const conditions = field.textBased
											? TEXT_CONDITIONS
											: BASIC_CONDITIONS;
									const useEnumeratedValue = isEnumeratedField && ["equals", "not_equals"].includes(rule.condition);
									const requiresValue = rule.condition !== "exists" && rule.condition !== "not_exists";
									const enumeratedOptions =
										rule.field === "provider"
											? providerOptions
											: rule.field === "model"
												? modelOptions
												: [];

									return (
										<div
											key={rule.id}
											className="grid gap-2 md:grid-cols-[minmax(160px,0.8fr)_minmax(160px,0.8fr)_minmax(260px,2fr)_auto]"
										>
											<RuleCombobox
												value={rule.field}
												options={RULE_FIELD_OPTIONS}
												placeholder="Select field"
												searchPlaceholder="Search fields..."
												onChange={(value) =>
													patchRule(group.id, rule.id, {
														field: value as RuleField,
														condition: "equals",
														value: "",
													})
												}
											/>

											<Select
												value={rule.condition}
												onValueChange={(value) =>
													patchRule(group.id, rule.id, {
														condition: value as RuleCondition,
														value: value === "exists" || value === "not_exists" ? "" : rule.value,
													})
												}
											>
												<SelectTrigger className="h-9 w-full rounded-md text-xs">
									<SelectValue>{CONDITION_LABELS[rule.condition]}</SelectValue>
												</SelectTrigger>
												<SelectContent>
													{conditions.map((condition) => (
														<SelectItem key={condition} value={condition}>
															{CONDITION_LABELS[condition]}
														</SelectItem>
													))}
												</SelectContent>
											</Select>

											<div>
												{requiresValue ? (
													useEnumeratedValue ? (
													<RuleCombobox
														value={rule.value}
														options={enumeratedOptions}
														placeholder="Select value"
														searchPlaceholder={`Search ${rule.field === "provider" ? "providers" : "models"}...`}
														onChange={(value) => patchRule(group.id, rule.id, { value })}
														isProvider={rule.field === "provider"}
													/>
													) : (
														<Input
															value={rule.value}
															onChange={(e) =>
																patchRule(group.id, rule.id, { value: e.target.value })
															}
															placeholder={
																rule.condition === "matches_regex" ? "e.g. ^openai/" : "Value"
															}
														/>
													)
												) : (
											<div className="flex h-9 items-center rounded-md border border-dashed bg-muted/20 px-2 text-xs text-muted-foreground">
														No value required
													</div>
												)}
											</div>

											<Button
												size="icon"
												variant="ghost"
												onClick={() => removeRule(group.id, rule.id)}
												className="hover:text-destructive"
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									);
								})}
							</div>

							<Button size="sm" variant="outline" onClick={() => addRule(group.id)}>
								<Plus className="mr-1.5 h-3.5 w-3.5" />
								Add Rule
							</Button>
						</div>
							{groupIndex < ruleGroups.length - 1 ? (
								<div className="flex justify-center">
									<Badge variant="outline">{groupJoin === "and" ? "AND" : "OR"}</Badge>
								</div>
							) : null}
						</div>
					))}
				</div>

				<Button size="sm" variant="outline" onClick={addRuleGroup}>
					<Plus className="mr-1.5 h-3.5 w-3.5" />
					Add Rule Group
				</Button>
			</section>
		</div>
	);
}
