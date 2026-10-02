"use client";

import { settingsStringKey } from "@/i18n/settings-string-keys";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSettingsWrite } from "../PrivateSettingsQuery";
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
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";

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

const RULE_FIELDS: Array<{ id: RuleField; labelKey: string; textBased: boolean }> = [
	{ id: "model", labelKey: "model", textBased: true }, { id: "provider", labelKey: "provider", textBased: true }, { id: "session_id", labelKey: "sessionId", textBased: true }, { id: "user_id", labelKey: "userId", textBased: true }, { id: "api_key_name", labelKey: "apiKeyName", textBased: true }, { id: "finish_reason", labelKey: "finishReason", textBased: true }, { id: "input", labelKey: "input", textBased: true }, { id: "output", labelKey: "output", textBased: true }, { id: "token_cost", labelKey: "tokenCost", textBased: false }, { id: "total_cost", labelKey: "totalCost", textBased: false }, { id: "total_tokens", labelKey: "totalTokens", textBased: false }, { id: "prompt_tokens", labelKey: "promptTokens", textBased: false }, { id: "completion_tokens", labelKey: "completionTokens", textBased: false },
];

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

const CONDITION_KEYS: Record<RuleCondition, string> = {
	equals: "equals", not_equals: "doesNotEqual", contains: "contains", not_contains: "doesNotContain", starts_with: "startsWith", ends_with: "endsWith", exists: "exists", not_exists: "doesNotExist", matches_regex: "matchesRegex",
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
	const t = useTranslations("SettingsUI");
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
							<CommandEmpty>{t("broadcastControls.noMatchingOptions")}</CommandEmpty>
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
	const t = useTranslations("SettingsUI");
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
				{props.title} <span className="font-normal text-muted-foreground">{t("broadcastControls.optional")}</span>
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
							{props.selected.length ? t("broadcastControls.selectedKeys", { count: props.selected.length }) : t("broadcastControls.selectApiKeys")}
						</span>
						<ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
					</Button>
				</PopoverTrigger>
				<PopoverContent initialFocus={false} align="start" className="w-(--anchor-width) min-w-[360px] rounded-md p-0">
					<Command className="rounded-md">
						<CommandInput ref={searchInputRef} placeholder={t("broadcastControls.searchApiKeys")} value={query} onValueChange={setQuery} />
						<ScrollArea
							className="h-72"
							viewportClassName="overscroll-contain p-1"
							viewportRef={listViewportRef}
							keepScrollbarMounted
						>
							<CommandList className="max-h-none overflow-visible p-0">
								<CommandEmpty>{t("broadcastControls.noApiKeys")}</CommandEmpty>
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
										{disabled ? <span className="text-[10px] text-muted-foreground">{t("broadcastControls.selectedOpposite")}</span> : null}
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
							<button type="button" aria-label={t("broadcastControls.remove", { label: props.getLabel(key) })} onClick={() => props.onChange(props.selected.filter((id) => id !== key.id))} className="rounded-md p-0.5 hover:bg-muted">
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
	const t = useTranslations("SettingsUI");
	const ruleFieldOptions = RULE_FIELDS.map((field) => ({ value: field.id, label: t(`broadcastControls.${field.labelKey}` as never) }));
	const write = useSettingsWrite();
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
			await write(createBroadcastDestinationAction({
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
			}));
			toast.success(t("strings.Destination saved" as never));
			router.push("/settings/broadcast");
			router.refresh();
		} catch (error) {
			const message = localizedSettingsError(error, t, "Action failed", t("broadcastControls.failedSave"));
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
				toast.success(t("strings.Connected" as never));
				return;
			}
			toast.error(t("strings.Connection check failed" as never));
		} catch (error) {
			const message = localizedSettingsError(error, t, "Action failed", t("broadcastControls.connectionCheckFailed"));
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
						{t("strings.Back to Destinations" as never)}
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
							{t("strings.New Destination" as never, { destination: destination.label } as never)}
						</h2>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button disabled={!canSave || isSaving} onClick={handleSave}>
						<Save className="mr-2 h-4 w-4" />
						{isSaving ? t("broadcastControls.saving") : t("broadcastControls.save")}
					</Button>
				</div>
			</div>

			<section className="space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<Plug className="h-4 w-4" />
						<h3 className="text-sm font-semibold">{t("strings.Connection" as never)}</h3>
					</div>
					<div className="flex items-center gap-2">
						<Button variant="outline" onClick={handleTestConnection} disabled={isTestingConnection || !hasAllRequiredConnectionValues}>
							<FlaskConical className="mr-2 h-4 w-4" />
							{isTestingConnection ? t("broadcastControls.testing") : t("broadcastControls.test")}
						</Button>
						<Button variant="outline" disabled title={t("strings.phraseSaveDestinationBeforeSendingASampleTrace" as never)}>
							<SendHorizontal className="mr-2 h-4 w-4" />
							{t("broadcastControls.sendSample")}
						</Button>
					</div>
				</div>
				<div className="grid gap-x-4 gap-y-3 lg:grid-cols-2">
					<div className="space-y-2">
						<Label>{t("strings.Destination Name" as never)}</Label>
						<Input
							value={destinationName}
							onChange={(e) => setDestinationName(e.target.value)}
							placeholder={`${destination.label} Production`}
						/>
					</div>
					{destination.fields.map((field) => (
						<div key={field.key} className="space-y-1.5">
							<Label className="text-xs font-medium">
								{t(settingsStringKey(field.label) as never)}
								{field.required === false ? (
											<span className="ml-1 text-muted-foreground">{t("broadcastControls.optional")}</span>
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
										<SelectValue placeholder={t("broadcastControls.selectMethod")} />
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
						<h3 className="text-sm font-semibold">{t("strings.Additional Metadata" as never)}</h3>
					</div>
						<p className="text-xs text-muted-foreground">{t("strings.phraseChooseWhichStructuredContextAccompaniesEachTrace" as never)}</p>
				</div>
				<div className="divide-y divide-border/50 rounded-md border border-border/60">
					{[
										{ label: t("broadcastControls.generationMetadata"), description: t("broadcastControls.generationMetadataDescription"), icon: Sparkles, checked: includeGenerationMetadata, change: setIncludeGenerationMetadata },
										{ label: t("broadcastControls.cost"), description: t("broadcastControls.costDescription"), icon: CircleDollarSign, checked: includeCostMetadata, change: setIncludeCostMetadata },
										{ label: t("broadcastControls.identity"), description: t("broadcastControls.identityDescription"), icon: Fingerprint, checked: includeIdentityMetadata, change: setIncludeIdentityMetadata },
										{ label: t("broadcastControls.requestContext"), description: t("broadcastControls.requestContextDescription"), icon: Route, checked: includeRequestContext, change: setIncludeRequestContext },
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
							<h3 className="text-sm font-semibold">{t("strings.Privacy" as never)}</h3>
						</div>
						<p className="text-xs text-muted-foreground">
							{t("broadcastControls.privacyDescription")}
						</p>
					</div>
					<div className="space-y-2">
						<Label className="text-xs font-medium">{t("broadcastControls.privacyMode")}</Label>
						<label className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
							<Checkbox
								checked={excludePromptsAndOutputs}
								onCheckedChange={(checked) => setExcludePromptsAndOutputs(Boolean(checked))}
								className="mt-0.5"
							/>
							<span className="text-sm text-foreground/90">
								{t("broadcastControls.excludeSensitive")}
							</span>
						</label>
					</div>
				</section>

				<section className="grid gap-4 py-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
					<div className="space-y-2">
						<div className="inline-flex items-center gap-2">
							<Gauge className="h-4 w-4 text-muted-foreground" />
							<h3 className="text-sm font-semibold">{t("strings.Sampling" as never)}</h3>
						</div>
						<p className="text-xs text-muted-foreground">
							{t("broadcastControls.samplingDescription")}
						</p>
					</div>
					<div className="space-y-2">
						<Label className="text-xs font-medium">{t("broadcastControls.rate")}</Label>
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
							<p className="text-xs text-destructive">{t("broadcastControls.samplingRateError")}</p>
						) : null}
					</div>
				</section>

				<section className="grid gap-4 py-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
					<div className="space-y-2">
						<div className="inline-flex items-center gap-2">
							<KeyRound className="h-4 w-4 text-muted-foreground" />
							<h3 className="text-sm font-semibold">{t("strings.API Key Filter" as never)}</h3>
						</div>
						<p className="text-xs text-muted-foreground">
							{t("broadcastControls.apiKeyFilterDescription")}
						</p>
					</div>
					{keys.length ? (
						<div className="space-y-4">
							<KeyMultiCombobox title={t("strings.Included API Keys" as never)} description={t("strings.phraseWhenSelectedOnlyTheseKeysSendTraces" as never)} keys={keys} selected={includedKeyIds} disabledIds={excludedKeyIds} onChange={setIncludedKeyIds} getLabel={getKeyLabel} />
							<KeyMultiCombobox title={t("strings.Excluded API Keys" as never)} description={t("strings.phraseTheseKeysNeverSendTracesToThisDestination" as never)} keys={keys} selected={excludedKeyIds} disabledIds={includedKeyIds} onChange={setExcludedKeyIds} getLabel={getKeyLabel} />
						</div>
					) : (
						<p className="text-xs text-muted-foreground">{t("broadcastControls.noKeysWorkspace")}</p>
					)}
				</section>
			</div>

			<section className="space-y-4">
				<div className="flex flex-wrap items-start justify-between gap-2">
					<div>
						<h3 className="inline-flex items-center gap-1.5 text-sm font-medium">
							<Filter className="h-4 w-4" />
							{t("broadcastControls.filterRules")}
						</h3>
						<p className="text-xs text-muted-foreground">
							{t("broadcastControls.filterRulesDescription")}
						</p>
					</div>
					<div className="flex items-center gap-2">
										<Label className="text-xs text-muted-foreground">{t("broadcastControls.betweenGroups")}</Label>
						<Select value={groupJoin} onValueChange={(value) => setGroupJoin(value as GroupLogic)}>
							<SelectTrigger className="h-8 w-[220px] rounded-md">
									<SelectValue>{groupJoin === "and" ? t("broadcastControls.allGroups") : t("broadcastControls.anyGroup")}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="or">{t("broadcastControls.anyGroup")}</SelectItem>
								<SelectItem value="and">{t("broadcastControls.allGroups")}</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="space-y-5">
					{ruleGroups.length === 0 ? (
						<div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
							{t("broadcastControls.noRuleGroups")}
						</div>
					) : null}
					{ruleGroups.map((group, groupIndex) => (
						<div key={group.id} className="space-y-3 rounded-md border border-border/60 p-3">
							<div className="space-y-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex min-w-0 flex-1 items-center gap-2">
									<p className="min-w-[140px] text-sm font-medium text-foreground/90">
																{t("broadcastControls.ruleGroup", { index: String(groupIndex + 1) })}
									</p>
									<Select
										value={group.match}
										onValueChange={(value) =>
											patchRuleGroup(group.id, { match: value as GroupLogic })
										}
									>
										<SelectTrigger className="h-8 w-[240px] rounded-md">
																	<SelectValue>{group.match === "and" ? t("broadcastControls.allRules") : t("broadcastControls.anyRule")}</SelectValue>
										</SelectTrigger>
										<SelectContent>
																	<SelectItem value="and">{t("broadcastControls.allRules")}</SelectItem>
																	<SelectItem value="or">{t("broadcastControls.anyRule")}</SelectItem>
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
																options={ruleFieldOptions}
																placeholder={t("broadcastControls.selectField")}
																searchPlaceholder={t("broadcastControls.searchFields")}
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
					<SelectValue>{t(`broadcastControls.${CONDITION_KEYS[rule.condition]}` as never)}</SelectValue>
												</SelectTrigger>
												<SelectContent>
													{conditions.map((condition) => (
														<SelectItem key={condition} value={condition}>
																	{t(`broadcastControls.${CONDITION_KEYS[condition]}` as never)}
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
																placeholder={t("broadcastControls.selectValue")}
																searchPlaceholder={rule.field === "provider" ? t("broadcastControls.searchProviders") : t("broadcastControls.searchModels")}
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
																																													rule.condition === "matches_regex" ? t("finalSettingsCopy.regexExample", { pattern: "^openai/" }) : t("broadcastControls.value")
															}
														/>
													)
												) : (
											<div className="flex h-9 items-center rounded-md border border-dashed bg-muted/20 px-2 text-xs text-muted-foreground">
																{t("broadcastControls.noValueRequired")}
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
															{t("broadcastControls.addRule")}
							</Button>
						</div>
							{groupIndex < ruleGroups.length - 1 ? (
								<div className="flex justify-center">
									<Badge variant="outline">{groupJoin === "and" ? t("broadcastControls.and") : t("broadcastControls.or")}</Badge>
								</div>
							) : null}
						</div>
					))}
				</div>

				<Button size="sm" variant="outline" onClick={addRuleGroup}>
					<Plus className="mr-1.5 h-3.5 w-3.5" />
													{t("broadcastControls.addRuleGroup")}
				</Button>
			</section>
		</div>
	);
}
