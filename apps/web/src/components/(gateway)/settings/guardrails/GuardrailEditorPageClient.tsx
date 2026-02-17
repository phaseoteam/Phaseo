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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
import { Info, Trash2 } from "lucide-react";

import {
	createGuardrail,
	deleteGuardrail,
	setGuardrailKeys,
	updateGuardrail,
	type ProviderRestrictionMode,
} from "@/app/(dashboard)/settings/guardrails/actions";

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
	allowed_api_model_ids?: string[] | null;
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

function getProviderLogoId(providerId: string): string {
	const id = String(providerId ?? "").trim();
	if (!id) return "cloudflare";
	const normalized = id.toLowerCase();
	if (normalized === "bedrock" || normalized.includes("bedrock")) {
		return "amazon-bedrock";
	}
	return normalized;
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

	const modelOptions = useMemo(() => {
		const distinct = new Set<string>();
		for (const row of props.activeProviderModels) {
			if (row.apiModelId) distinct.add(row.apiModelId);
		}
		return Array.from(distinct)
			.sort((a, b) => a.localeCompare(b))
			.map((id) => ({ value: id, label: id }));
	}, [props.activeProviderModels]);

	const keyOptions = useMemo(() => {
		return props.keys.map((k) => ({
			value: k.id,
			label: `${k.name} (${k.prefix})`,
		}));
	}, [props.keys]);

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

			allowedApiModelIds: uniqStrings((g?.allowed_api_model_ids ?? []) as string[]),

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

	useEffect(() => {
		setForm(initial);
	}, [initial]);

	function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
		setForm((prev) => ({ ...prev, [key]: value }));
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
					allowedApiModelIds: form.allowedApiModelIds,
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
					allowedApiModelIds: form.allowedApiModelIds,
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
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-base font-semibold tracking-tight">
							{props.mode === "create" ? "Create guardrail" : "Edit guardrail"}
						</h2>
						<Badge variant="outline">Alpha</Badge>
					</div>
					<p className="text-sm text-muted-foreground">
						{props.teamName ? `Team: ${props.teamName}. ` : null}
						Guardrails are applied to one or more API keys.
					</p>
				</div>
				<div className="flex items-center gap-2">
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
					<Button asChild type="button" variant="outline" disabled={saving || deleting}>
						<Link href={props.backHref}>Cancel</Link>
					</Button>
					<Button type="button" onClick={onSave} disabled={saving || deleting}>
						{saving ? "Saving..." : props.mode === "create" ? "Create" : "Save"}
					</Button>
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
				<div className="space-y-6">
					<div className="rounded-2xl border bg-background p-5">
						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label>Name</Label>
								<Input
									value={form.name}
									onChange={(e) => set("name", e.target.value)}
									placeholder="e.g. Production ZDR Only"
								/>
							</div>
							<div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/10 px-3 py-2">
								<div className="min-w-0">
									<p className="text-sm font-medium">Enabled</p>
									<p className="text-xs text-muted-foreground">
										Disable to keep it configured without enforcing.
									</p>
								</div>
								<Switch
									checked={form.enabled}
									onCheckedChange={(checked) => set("enabled", checked)}
								/>
							</div>
						</div>

						<div className="mt-4 space-y-2">
							<Label>Description (optional)</Label>
							<Textarea
								value={form.description}
								onChange={(e) => set("description", e.target.value)}
								placeholder="Who is this for? What does it restrict?"
							/>
						</div>
					</div>

					<div className="rounded-2xl border bg-background p-5 space-y-4">
						<div>
							<h3 className="text-sm font-semibold">Eligibility & privacy</h3>
							<p className="mt-1 text-xs text-muted-foreground">
								These toggles further restrict what can be routed for keys using this
								guardrail.
							</p>
						</div>
						<div className="grid gap-2">
							<ToggleRow
								label="Allow paid endpoints that may train on inputs"
								description="Disabling further restricts paid endpoints flagged as training-on-inputs."
								checked={form.privacyEnablePaidMayTrain}
								onCheckedChange={(checked) =>
									set("privacyEnablePaidMayTrain", checked)
								}
							/>
							<ToggleRow
								label="Allow free models that may train on inputs"
								description="Disabling further restricts free models flagged as training-on-inputs."
								checked={form.privacyEnableFreeMayTrain}
								onCheckedChange={(checked) =>
									set("privacyEnableFreeMayTrain", checked)
								}
							/>
							<ToggleRow
								label="Allow free endpoints that may publish prompts"
								description="Disabling further restricts endpoints flagged as publishing prompts."
								checked={form.privacyEnableFreeMayPublishPrompts}
								onCheckedChange={(checked) =>
									set("privacyEnableFreeMayPublishPrompts", checked)
								}
							/>
							<ToggleRow
								label="Allow input/output logging"
								description="Disabling indicates this guardrail should avoid body logging where supported."
								checked={form.privacyEnableInputOutputLogging}
								onCheckedChange={(checked) =>
									set("privacyEnableInputOutputLogging", checked)
								}
							/>
							<Separator />
							<ToggleRow
								label="ZDR only"
								description="Further restrict routing to endpoints that meet ZDR requirements."
								checked={form.privacyZdrOnly}
								onCheckedChange={(checked) => set("privacyZdrOnly", checked)}
							/>
						</div>
					</div>

					<div className="rounded-2xl border bg-background p-5 space-y-4">
						<div>
							<h3 className="text-sm font-semibold">Budgets</h3>
							<p className="mt-1 text-xs text-muted-foreground">
								Leave a field blank for unlimited. Each window is enforced independently.
							</p>
						</div>
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
				</div>

				<div className="space-y-6">
					<div className="rounded-2xl border bg-background p-5 space-y-4">
						<div>
							<h3 className="text-sm font-semibold">Providers</h3>
							<p className="mt-1 text-xs text-muted-foreground">
								Allow or block specific providers for this guardrail. Leave empty to
								allow all.
							</p>
						</div>
						<div className="grid gap-3">
							<div className="grid gap-2">
								<Label>Mode</Label>
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
										<SelectItem value="none">Allow any provider</SelectItem>
										<SelectItem value="allowlist">
											Allow only selected providers
										</SelectItem>
										<SelectItem value="blocklist">Block selected providers</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								<SelectionDialog
									title="Select providers"
									description="Choose providers for this guardrail."
									options={providerOptions}
									selected={form.providerRestrictionProviderIds}
									onChange={(next) => set("providerRestrictionProviderIds", next)}
									renderLeading={(opt) => (
										<Logo
											id={getProviderLogoId(opt.value)}
											alt={`${opt.label} logo`}
											width={18}
											height={18}
											className="h-[18px] w-[18px] rounded-sm"
										/>
									)}
									trigger={
										<Button
											type="button"
											variant="outline"
											disabled={form.providerRestrictionMode === "none"}
										>
											{form.providerRestrictionMode === "none"
												? "No provider list"
												: `${form.providerRestrictionProviderIds.length || 0} selected`}
										</Button>
									}
								/>
								{form.providerRestrictionMode === "allowlist" ? (
									<div className="flex items-center gap-2 rounded-lg border bg-muted/10 px-3 py-2">
										<span className="text-xs text-muted-foreground">
											Always enforce
										</span>
										<Switch
											checked={form.providerRestrictionEnforceAllowed}
											onCheckedChange={(checked) =>
												set("providerRestrictionEnforceAllowed", checked)
											}
										/>
									</div>
								) : null}
							</div>
						</div>
					</div>

					<div className="rounded-2xl border bg-background p-5 space-y-4">
						<div>
							<h3 className="text-sm font-semibold">Models</h3>
							<p className="mt-1 text-xs text-muted-foreground">
								Restrict this guardrail to specific `api_model_id` values. Leave empty
								to allow all.
							</p>
						</div>
						<SelectionDialog
							title="Select allowed models"
							description="Restrict this guardrail to specific api_model_id values."
							options={modelOptions}
							selected={form.allowedApiModelIds}
							onChange={(next) => set("allowedApiModelIds", next)}
							trigger={
								<Button type="button" variant="outline">
									{form.allowedApiModelIds.length
										? `${form.allowedApiModelIds.length} selected`
										: "All models"}
								</Button>
							}
						/>
					</div>

					<div className="rounded-2xl border bg-background p-5 space-y-4">
						<div>
							<h3 className="text-sm font-semibold">Apply to keys</h3>
							<p className="mt-1 text-xs text-muted-foreground">
								Select one or more keys to apply this guardrail.
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

					<Alert className="border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-sky-50">
						<Info className="text-sky-600 dark:text-sky-300" />
						<div>
							<AlertTitle>Alpha feature</AlertTitle>
							<AlertDescription>
								Guardrails UI ships ahead of full enforcement metadata. Validate
								critical behavior with a staging key before rolling out broadly.
							</AlertDescription>
						</div>
					</Alert>
				</div>
			</div>
		</div>
	);
}

