"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Plus, Shield } from "lucide-react";

import {
	type PromptInjectionAction,
	type ProviderRestrictionMode,
	type SensitiveInfoRulePayload,
} from "@/app/(dashboard)/settings/guardrails/actions";
import { describeProviderRestrictionMode } from "./guardrailPreview";
import {
	getDefaultSensitiveInfoRules,
	getSensitiveInfoRuleDefinitions,
} from "./sensitiveInfoPreview";

const NANOS_PER_USD = 1_000_000_000;

type ProviderOption = { id: string; name: string };
type ActiveProviderModel = {
	providerId: string;
	apiModelId: string;
	internalModelId: string | null;
};
type KeyOption = { id: string; name: string; prefix: string; status: string };

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

function summarizeList(values: string[], limit = 3): string {
	if (!values.length) return "All";
	if (values.length <= limit) return values.join(", ");
	return `${values.slice(0, limit).join(", ")} +${values.length - limit}`;
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

function normalizePromptInjectionAction(value: unknown): PromptInjectionAction {
	const raw = String(value ?? "flag").toLowerCase();
	if (raw === "redact") return "redact";
	if (raw === "block") return "block";
	return "flag";
}

function countEnabledSensitiveInfoRules(
	rules: SensitiveInfoRulePayload[] | null | undefined,
): number {
	if (!Array.isArray(rules) || rules.length === 0) {
		return getDefaultSensitiveInfoRules("redact").filter((rule) => rule.enabled).length;
	}
	return rules.filter((rule) => rule.enabled).length;
}

type Props = {
	providers: ProviderOption[];
	activeProviderModels: ActiveProviderModel[];
	keys: KeyOption[];
	guardrails: GuardrailRow[];
	guardrailKeyIdsByGuardrailId: Record<string, string[]>;
};

export default function GuardrailsSettingsClient(props: Props) {
	const { providers, activeProviderModels, keys, guardrails, guardrailKeyIdsByGuardrailId } =
		props;

	const providerLabelById = useMemo(() => {
		const map = new Map<string, string>();
		for (const p of providers) map.set(p.id, p.name);
		return map;
	}, [providers]);

	return (
		<GuardrailsSection
			providers={providers}
			activeProviderModels={activeProviderModels}
			keys={keys}
			guardrails={guardrails}
			guardrailKeyIdsByGuardrailId={guardrailKeyIdsByGuardrailId}
			providerLabelById={providerLabelById}
		/>
	);
}

function ToggleRow(props: {
	label: string;
	description: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
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

function SelectionDialog(props: {
	title: string;
	description?: string;
	options: Array<{ value: string; label: string }>;
	selected: string[];
	onChange: (next: string[]) => void;
	renderLeading?: (opt: { value: string; label: string }) => ReactNode;
	trigger: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [draft, setDraft] = useState<string[]>(props.selected);

	useEffect(() => {
		if (!open) return;
		setDraft(props.selected);
		setQuery("");
	}, [open, props.selected]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return props.options;
		return props.options.filter(
			(opt) =>
				opt.label.toLowerCase().includes(q) ||
				opt.value.toLowerCase().includes(q),
		);
	}, [props.options, query]);

	const selectedSet = useMemo(() => new Set(draft), [draft]);

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
					<div className="max-h-[340px] overflow-y-auto rounded-lg border bg-background">
						{filtered.length ? (
							<ul className="divide-y">
								{filtered.map((opt) => {
									const checked = selectedSet.has(opt.value);
									return (
										<li
											key={opt.value}
											className="flex items-center justify-between gap-3 px-3 py-2"
										>
											<div className="min-w-0 flex items-center gap-2">
												{props.renderLeading ? (
													<span className="shrink-0">
														{props.renderLeading(opt)}
													</span>
												) : null}
												<div className="min-w-0">
													<div className="truncate text-sm font-medium">
														{opt.label}
													</div>
													<div className="truncate text-xs text-muted-foreground">
														{opt.value}
													</div>
												</div>
											</div>
											<button
												type="button"
												className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
												onClick={() => {
													setDraft((prev) => {
														if (prev.includes(opt.value)) {
															return prev.filter((v) => v !== opt.value);
														}
														return [...prev, opt.value];
													});
												}}
											>
												{checked ? "Selected" : "Select"}
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
				<DialogFooter className="gap-2 sm:gap-0">
					<DialogClose asChild>
						<Button type="button" variant="outline">
							Cancel
						</Button>
					</DialogClose>
					<Button
						type="button"
						onClick={() => {
							props.onChange(uniqStrings(draft));
							setOpen(false);
						}}
					>
						Save ({draft.length})
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function formatUsdFromNanos(nanos: number): string {
	if (!Number.isFinite(nanos) || nanos <= 0) return "";
	const usd = nanos / NANOS_PER_USD;
	return String(usd);
}

function parseUsdToNanos(value: string): number | null | undefined {
	if (!value || value.trim().length === 0) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return undefined;
	return Math.round(parsed * NANOS_PER_USD);
}

function parseInteger(value: string): number | null | undefined {
	if (!value || value.trim().length === 0) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return undefined;
	return Math.floor(parsed);
}

function GuardrailsSection(props: {
	providers: ProviderOption[];
	activeProviderModels: ActiveProviderModel[];
	keys: KeyOption[];
	guardrails: GuardrailRow[];
	guardrailKeyIdsByGuardrailId: Record<string, string[]>;
	providerLabelById: Map<string, string>;
}) {
	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-sm font-semibold tracking-tight">Guardrails</h2>
					<p className="text-sm text-muted-foreground">
						Additional restrictions you can apply to one or more API keys.
					</p>
				</div>
				<Button asChild type="button">
					<Link href="/settings/guardrails/new">
						<Plus className="mr-2 h-4 w-4" />
						New guardrail
					</Link>
				</Button>
			</div>

			{props.guardrails.length ? (
				<div className="overflow-hidden rounded-xl border bg-background">
					<div className="divide-y">
						{props.guardrails.map((g) => (
							<GuardrailCard
								key={g.id}
								guardrail={g}
								providers={props.providers}
								activeProviderModels={props.activeProviderModels}
								keys={props.keys}
								keyIds={props.guardrailKeyIdsByGuardrailId[g.id] ?? []}
								providerLabelById={props.providerLabelById}
							/>
						))}
					</div>
				</div>
			) : (
				<Empty className="rounded-xl border border-dashed border-border/80 p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Shield className="h-5 w-5" />
						</EmptyMedia>
						<EmptyTitle>No guardrails yet</EmptyTitle>
						<EmptyDescription>
							Create one to restrict models/providers and set budgets per key group.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</div>
	);
}

function GuardrailCard(props: {
	guardrail: GuardrailRow;
	providers: ProviderOption[];
	activeProviderModels: ActiveProviderModel[];
	keys: KeyOption[];
	keyIds: string[];
	providerLabelById: Map<string, string>;
}) {
	const mode = normalizeMode(props.guardrail.provider_restriction_mode);
	const providerIds = uniqStrings(
		(props.guardrail.provider_restriction_provider_ids ?? []) as string[],
	);
	const allowedModels = uniqStrings(
		(props.guardrail.allowed_api_model_ids ?? []) as string[],
	);
	const modelMode = normalizeMode(props.guardrail.model_restriction_mode);

	const providerRuleText =
		mode === "none"
			? "Allow all"
			: describeProviderRestrictionMode(mode);
	const providerRuleDetail =
		mode === "none"
			? "No restrictions"
			: summarizeList(
					providerIds.map((id) => props.providerLabelById.get(id) ?? id),
					2,
				);

	return (
		<Link
			href={`/settings/guardrails/${props.guardrail.id}`}
			className="block px-4 py-4 hover:bg-muted/20 transition-colors"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<p className="truncate text-base font-semibold">
							{props.guardrail.name ?? "Untitled"}
						</p>
						{props.guardrail.enabled ? (
							<Badge variant="secondary">Enabled</Badge>
						) : (
							<Badge variant="outline">Disabled</Badge>
						)}
						{props.guardrail.privacy_zdr_only ? (
							<Badge variant="outline">ZDR</Badge>
						) : null}
						{props.guardrail.prompt_injection_enabled ? (
							<Badge variant="outline">
								Prompt injection:{" "}
								{normalizePromptInjectionAction(
									props.guardrail.prompt_injection_action,
								)}
							</Badge>
						) : null}
						{props.guardrail.sensitive_info_enabled ? (
							<Badge variant="outline">
								Sensitive info:{" "}
								{countEnabledSensitiveInfoRules(
									props.guardrail.sensitive_info_rules,
								)}{" "}
								rules
							</Badge>
						) : null}
					</div>
					{props.guardrail.description ? (
						<p className="text-sm text-muted-foreground">
							{props.guardrail.description}
						</p>
					) : (
						<p className="text-sm text-muted-foreground">
							No description.
						</p>
					)}

					<div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						<span className="inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1">
							<span className="font-medium text-foreground">
								Keys
							</span>
							<span>{props.keyIds.length}</span>
						</span>

						<span className="inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1">
							<span className="font-medium text-foreground">
								Providers
							</span>
							<span>{providerRuleText}</span>
							{mode !== "none" && providerIds.length ? (
								<span className="ml-1 flex -space-x-2">
									{providerIds.slice(0, 4).map((id) => (
										<span
											key={id}
											className="inline-flex h-6 w-6 items-center justify-center rounded-full border bg-background"
											title={props.providerLabelById.get(id) ?? id}
										>
											<Logo
												id={getProviderLogoId(id)}
												alt={`${id} logo`}
												width={14}
												height={14}
												className="h-3.5 w-3.5"
											/>
										</span>
									))}
								</span>
							) : null}
						</span>

						<span className="inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1">
							<span className="font-medium text-foreground">
								Models
							</span>
							<span>
								{modelMode === "none"
									? "Allow all"
									: modelMode === "allowlist"
										? allowedModels.length
											? `${allowedModels.length} allowed`
											: "Allowlist"
										: allowedModels.length
											? `${allowedModels.length} blocked`
											: "Blocklist"}
							</span>
						</span>
					</div>

					{mode !== "none" ? (
						<p className="mt-2 text-xs text-muted-foreground">
							{providerRuleDetail}
						</p>
					) : null}
				</div>
			</div>
		</Link>
	);
}
