"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Info, Shield } from "lucide-react";

import {
	updateGlobalGuardrailsSettings,
	type ProviderRestrictionMode,
} from "@/app/(dashboard)/settings/guardrails/actions";

const AUTO_SAVE_DEBOUNCE_MS = 650;

type ProviderOption = { id: string; name: string };
type ActiveProviderModel = {
	providerId: string;
	apiModelId: string;
	internalModelId: string | null;
};

type TeamGlobalRow = {
	privacy_enable_paid_may_train?: boolean | null;
	privacy_enable_free_may_train?: boolean | null;
	privacy_enable_free_may_publish_prompts?: boolean | null;
	privacy_enable_input_output_logging?: boolean | null;
	privacy_zdr_only?: boolean | null;
	provider_restriction_mode?: string | null;
	provider_restriction_provider_ids?: string[] | null;
	provider_restriction_enforce_allowed?: boolean | null;
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

function applyProviderRestriction(
	rows: ActiveProviderModel[],
	mode: ProviderRestrictionMode,
	providerIds: string[],
) {
	const set = new Set(providerIds);
	if (mode === "allowlist") return rows.filter((r) => set.has(r.providerId));
	if (mode === "blocklist") return rows.filter((r) => !set.has(r.providerId));
	return rows;
}

function computeEligiblePreview(args: {
	activeProviderModels: ActiveProviderModel[];
	mode: ProviderRestrictionMode;
	providerIds: string[];
}) {
	const filtered = applyProviderRestriction(
		args.activeProviderModels,
		args.mode,
		args.providerIds,
	);

	const providers = new Set(filtered.map((row) => row.providerId));
	const models = new Set(filtered.map((row) => row.apiModelId));

	const modelsByProvider = new Map<string, Set<string>>();
	for (const row of filtered) {
		const set = modelsByProvider.get(row.providerId) ?? new Set<string>();
		set.add(row.apiModelId);
		modelsByProvider.set(row.providerId, set);
	}

	return {
		providerCount: providers.size,
		modelCount: models.size,
		modelsByProvider,
	};
}

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

function EligibilityHero(props: {
	teamName: string | null;
	providerLabelById: Map<string, string>;
	globalMode: ProviderRestrictionMode;
	globalProviderIds: string[];
	zdrOnly: boolean;
	eligiblePreview: {
		providerCount: number;
		modelCount: number;
		modelsByProvider: Map<string, Set<string>>;
	};
}) {
	const [modelQuery, setModelQuery] = useState("");

	const providerRows = useMemo(() => {
		return Array.from(props.eligiblePreview.modelsByProvider.entries())
			.map(([providerId, modelSet]) => ({
				providerId,
				label: props.providerLabelById.get(providerId) ?? providerId,
				logoId: getProviderLogoId(providerId),
				modelCount: modelSet.size,
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [props.eligiblePreview.modelsByProvider, props.providerLabelById]);

	const eligibleModels = useMemo(() => {
		const set = new Set<string>();
		for (const models of props.eligiblePreview.modelsByProvider.values()) {
			for (const id of models) set.add(id);
		}
		const list = Array.from(set).sort((a, b) => a.localeCompare(b));
		const q = modelQuery.trim().toLowerCase();
		if (!q) return list;
		return list.filter((m) => m.toLowerCase().includes(q));
	}, [props.eligiblePreview.modelsByProvider, modelQuery]);

	const ruleText =
		props.globalMode === "none"
			? "No provider restrictions"
			: props.globalMode === "allowlist"
				? "Allowlist"
				: "Blocklist";

	const selectedProviderLabels = props.globalProviderIds.map(
		(id) => props.providerLabelById.get(id) ?? id,
	);

	return (
		<div className="rounded-2xl border bg-gradient-to-b from-muted/30 to-background p-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-base font-semibold tracking-tight">
							Eligibility Preview
						</h2>
						<Badge variant="outline" className="gap-1">
							<Shield className="h-3.5 w-3.5" />
							Alpha
						</Badge>
						{props.zdrOnly ? <Badge variant="secondary">ZDR Only</Badge> : null}
					</div>
					<p className="text-sm text-muted-foreground">
						Gateway-active models eligible based on your current global settings
						{props.teamName ? ` (${props.teamName})` : ""}.
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<div className="rounded-xl border bg-background/70 px-3 py-2">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Providers
						</div>
						<div className="mt-1 text-xl font-semibold">
							{props.eligiblePreview.providerCount}
						</div>
					</div>
					<div className="rounded-xl border bg-background/70 px-3 py-2">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Models
						</div>
						<div className="mt-1 text-xl font-semibold">
							{props.eligiblePreview.modelCount}
						</div>
					</div>
					<div className="rounded-xl border bg-background/70 px-3 py-2">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Rule
						</div>
						<div className="mt-1 text-sm font-semibold">{ruleText}</div>
						{props.globalMode !== "none" ? (
							<div className="mt-2 flex items-center gap-2">
								<div className="flex -space-x-2">
									{props.globalProviderIds.slice(0, 6).map((id) => (
										<span
											key={id}
											className="inline-flex h-7 w-7 items-center justify-center rounded-full border bg-background"
										>
											<Logo
												id={getProviderLogoId(id)}
												alt={`${id} logo`}
												width={16}
												height={16}
												className="h-4 w-4"
											/>
										</span>
									))}
								</div>
								<p className="text-xs text-muted-foreground">
									{summarizeList(selectedProviderLabels, 2)}
								</p>
							</div>
						) : null}
					</div>
				</div>
			</div>

			<div className="mt-5">
				<p className="text-xs font-medium text-muted-foreground">
					Eligible providers
				</p>
				<div className="mt-2 flex gap-2 overflow-x-auto pb-1">
					{providerRows.length ? (
						providerRows.map((p) => (
							<div
								key={p.providerId}
								className="flex shrink-0 items-center gap-2 rounded-full border bg-background/70 px-3 py-2"
							>
								<Logo
									id={p.logoId}
									alt={`${p.label} logo`}
									width={18}
									height={18}
									className="h-[18px] w-[18px]"
								/>
								<div className="max-w-[190px] truncate text-sm font-medium">
									{p.label}
								</div>
								<Badge variant="secondary">{p.modelCount}</Badge>
							</div>
						))
					) : (
						<div className="text-sm text-muted-foreground">
							No eligible providers.
						</div>
					)}
				</div>
			</div>

			<div className="mt-5 rounded-xl border bg-background/70 p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="space-y-1">
						<p className="text-sm font-semibold">Eligible models</p>
						<p className="text-xs text-muted-foreground">
							This list is derived from Gateway-active provider model entries.
							Privacy metadata (train/publish/ZDR) will refine eligibility as it
							lands in the catalogue.
						</p>
					</div>
					<Input
						value={modelQuery}
						onChange={(e) => setModelQuery(e.target.value)}
						placeholder="Search models..."
						className="h-9 w-full sm:w-[260px]"
					/>
				</div>

				<div className="mt-3 max-h-[240px] overflow-y-auto rounded-lg border bg-background/70">
					{eligibleModels.length ? (
						<ul className="divide-y">
							{eligibleModels.slice(0, 250).map((modelId) => (
								<li key={modelId} className="px-3 py-2">
									<div className="truncate font-mono text-xs text-foreground">
										{modelId}
									</div>
								</li>
							))}
						</ul>
					) : (
						<div className="p-6 text-sm text-muted-foreground">No matches.</div>
					)}
				</div>
			</div>
		</div>
	);
}

export default function PrivacySettingsClient(props: {
	teamName: string | null;
	initialGlobal: TeamGlobalRow | null;
	providers: ProviderOption[];
	activeProviderModels: ActiveProviderModel[];
}) {
	const providerLabelById = useMemo(() => {
		const map = new Map<string, string>();
		for (const p of props.providers) map.set(p.id, p.name);
		return map;
	}, [props.providers]);

	const defaultGlobal = useMemo(
		() => ({
			privacyEnablePaidMayTrain:
				Boolean(props.initialGlobal?.privacy_enable_paid_may_train ?? true),
			privacyEnableFreeMayTrain:
				Boolean(props.initialGlobal?.privacy_enable_free_may_train ?? true),
			privacyEnableFreeMayPublishPrompts: Boolean(
				props.initialGlobal?.privacy_enable_free_may_publish_prompts ?? true,
			),
			privacyEnableInputOutputLogging: Boolean(
				props.initialGlobal?.privacy_enable_input_output_logging ?? true,
			),
			privacyZdrOnly: Boolean(props.initialGlobal?.privacy_zdr_only ?? false),
			providerRestrictionMode: normalizeMode(
				props.initialGlobal?.provider_restriction_mode,
			),
			providerRestrictionProviderIds: uniqStrings(
				(props.initialGlobal?.provider_restriction_provider_ids ?? []) as string[],
			),
			providerRestrictionEnforceAllowed: Boolean(
				props.initialGlobal?.provider_restriction_enforce_allowed ?? false,
			),
		}),
		[props.initialGlobal],
	);

	const [global, setGlobal] = useState(defaultGlobal);
	const [savedGlobal, setSavedGlobal] = useState(defaultGlobal);
	const [savingGlobal, setSavingGlobal] = useState(false);
	const globalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const globalSaveSeqRef = useRef(0);
	const globalFirstRunRef = useRef(true);

	useEffect(() => {
		setGlobal(defaultGlobal);
		setSavedGlobal(defaultGlobal);
	}, [defaultGlobal]);

	useEffect(() => {
		if (globalFirstRunRef.current) {
			globalFirstRunRef.current = false;
			return;
		}

		if (globalTimerRef.current) clearTimeout(globalTimerRef.current);

		globalTimerRef.current = setTimeout(async () => {
			const saveSeq = ++globalSaveSeqRef.current;
			setSavingGlobal(true);
			try {
				await toast.promise(
					updateGlobalGuardrailsSettings({
						privacyEnablePaidMayTrain: global.privacyEnablePaidMayTrain,
						privacyEnableFreeMayTrain: global.privacyEnableFreeMayTrain,
						privacyEnableFreeMayPublishPrompts:
							global.privacyEnableFreeMayPublishPrompts,
						privacyEnableInputOutputLogging:
							global.privacyEnableInputOutputLogging,
						privacyZdrOnly: global.privacyZdrOnly,
						providerRestrictionMode: global.providerRestrictionMode,
						providerRestrictionProviderIds:
							global.providerRestrictionProviderIds,
						providerRestrictionEnforceAllowed:
							global.providerRestrictionEnforceAllowed,
					}),
					{
						loading: "Saving privacy settings...",
						success: "Privacy settings updated",
						error: "Failed to update privacy settings",
					},
				);
				if (saveSeq === globalSaveSeqRef.current) {
					setSavedGlobal(global);
				}
			} finally {
				if (saveSeq === globalSaveSeqRef.current) setSavingGlobal(false);
			}
		}, AUTO_SAVE_DEBOUNCE_MS);

		return () => {
			if (globalTimerRef.current) {
				clearTimeout(globalTimerRef.current);
				globalTimerRef.current = null;
			}
		};
	}, [global]);

	const globalDirty = JSON.stringify(global) !== JSON.stringify(savedGlobal);
	const globalStateText = savingGlobal
		? "Saving..."
		: globalDirty
			? "Pending sync"
			: "Synced";

	const eligiblePreview = useMemo(() => {
		return computeEligiblePreview({
			activeProviderModels: props.activeProviderModels,
			mode: global.providerRestrictionMode,
			providerIds: global.providerRestrictionProviderIds,
		});
	}, [
		props.activeProviderModels,
		global.providerRestrictionMode,
		global.providerRestrictionProviderIds,
	]);

	return (
		<div className="space-y-6">
			<EligibilityHero
				teamName={props.teamName}
				providerLabelById={providerLabelById}
				globalMode={global.providerRestrictionMode}
				globalProviderIds={global.providerRestrictionProviderIds}
				zdrOnly={global.privacyZdrOnly}
				eligiblePreview={eligiblePreview}
			/>

			<section className="space-y-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<h2 className="text-sm font-semibold tracking-tight">
							Privacy defaults
						</h2>
						<p className="text-sm text-muted-foreground">
							Global defaults applied to all requests.
						</p>
					</div>
					<span className="text-xs text-muted-foreground">{globalStateText}</span>
				</div>

				<div className="grid gap-2">
					<ToggleRow
						label="Enable paid endpoints that may train on inputs"
						description="When disabled, paid endpoints flagged as training-on-inputs become ineligible."
						checked={global.privacyEnablePaidMayTrain}
						onCheckedChange={(checked) =>
							setGlobal((prev) => ({ ...prev, privacyEnablePaidMayTrain: checked }))
						}
					/>
					<ToggleRow
						label="Enable free models that may train on inputs"
						description="When disabled, free models flagged as training-on-inputs become ineligible."
						checked={global.privacyEnableFreeMayTrain}
						onCheckedChange={(checked) =>
							setGlobal((prev) => ({ ...prev, privacyEnableFreeMayTrain: checked }))
						}
					/>
					<ToggleRow
						label="Enable free endpoints that may publish prompts"
						description="When disabled, free endpoints flagged as publishing prompts become ineligible."
						checked={global.privacyEnableFreeMayPublishPrompts}
						onCheckedChange={(checked) =>
							setGlobal((prev) => ({
								...prev,
								privacyEnableFreeMayPublishPrompts: checked,
							}))
						}
					/>
					<ToggleRow
						label="Enable input/output logging for all requests"
						description="When disabled, the Gateway should avoid storing prompt/response bodies where supported."
						checked={global.privacyEnableInputOutputLogging}
						onCheckedChange={(checked) =>
							setGlobal((prev) => ({
								...prev,
								privacyEnableInputOutputLogging: checked,
							}))
						}
					/>
					<ToggleRow
						label="Enable ZDR endpoints only"
						description="Restrict routing to endpoints that meet ZDR requirements (may reduce availability)."
						checked={global.privacyZdrOnly}
						onCheckedChange={(checked) =>
							setGlobal((prev) => ({ ...prev, privacyZdrOnly: checked }))
						}
					/>
				</div>
			</section>

			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-sm font-semibold tracking-tight">
						Provider restrictions
					</h2>
					<p className="text-sm text-muted-foreground">
						Globally allow or exclude providers for all requests.
					</p>
				</div>

				<div className="rounded-xl border bg-muted/10 p-4 space-y-4">
					<div className="grid gap-3 md:grid-cols-[220px_1fr] md:items-center">
						<Label className="text-sm font-medium">Mode</Label>
						<Select
							value={global.providerRestrictionMode}
							onValueChange={(value) =>
								setGlobal((prev) => ({
									...prev,
									providerRestrictionMode: value as ProviderRestrictionMode,
									providerRestrictionEnforceAllowed:
										value === "allowlist"
											? prev.providerRestrictionEnforceAllowed
											: false,
								}))
							}
						>
							<SelectTrigger className="max-w-sm">
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

					<div className="grid gap-3 md:grid-cols-[220px_1fr] md:items-center">
						<Label className="text-sm font-medium">Providers</Label>
						<div className="flex flex-wrap items-center gap-2">
							<SelectionDialog
								title="Select providers"
								description="Choose providers to allow/block globally."
								options={[...props.providers]
									.sort((a, b) => a.name.localeCompare(b.name))
									.map((p) => ({ value: p.id, label: p.name }))}
								selected={global.providerRestrictionProviderIds}
								onChange={(next) =>
									setGlobal((prev) => ({
										...prev,
										providerRestrictionProviderIds: next,
									}))
								}
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
										disabled={global.providerRestrictionMode === "none"}
									>
										{global.providerRestrictionMode === "none"
											? "No provider list"
											: `${global.providerRestrictionProviderIds.length || 0} selected`}
									</Button>
								}
							/>
							<p className="text-xs text-muted-foreground">
								{global.providerRestrictionMode === "none"
									? "No provider restrictions are applied."
									: global.providerRestrictionMode === "allowlist"
										? "Only these providers will be eligible."
										: "These providers will be excluded."}
							</p>
						</div>
					</div>

					{global.providerRestrictionMode === "allowlist" ? (
						<>
							<Separator />
							<div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
								<div className="min-w-0">
									<p className="text-sm font-medium">
										Always enforce allowed providers
									</p>
									<p className="text-xs text-muted-foreground">
										This might reduce fallback options and impact availability.
									</p>
								</div>
								<Switch
									checked={global.providerRestrictionEnforceAllowed}
									onCheckedChange={(checked) =>
										setGlobal((prev) => ({
											...prev,
											providerRestrictionEnforceAllowed: checked,
										}))
									}
									aria-label="Always enforce allowed providers"
								/>
							</div>
							<Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-50">
								<Info className="text-amber-700 dark:text-amber-200" />
								<div>
									<AlertTitle>Availability warning</AlertTitle>
									<AlertDescription>
										Allowlisting providers may remove fallback routes. Consider
										keeping at least two providers enabled for critical paths.
									</AlertDescription>
								</div>
							</Alert>
						</>
					) : null}
				</div>
			</section>
		</div>
	);
}

