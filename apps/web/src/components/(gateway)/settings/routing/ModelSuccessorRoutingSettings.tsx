"use client";

import { useRef, useState, useTransition } from "react";
import { useFormatter, useLocale, useTranslations } from "@/i18n/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
	removeSuccessorReplacement,
	saveSuccessorReplacement,
	updateSuccessorRouting,
	type SuccessorPricePolicy,
} from "@/app/(dashboard)/settings/routing/actions";
import { GatewayModelCombobox, useGatewayModelOptions } from "../GatewayModelCombobox";
import { useSettingsWrite, withPrivateSettings } from "../PrivateSettingsQuery";
import {
	priceChangePercent,
	redirectStartsAt,
	skippedCharges,
	successorOutcome,
	type SuccessorOutcome,
	type SuccessorOverviewModel,
	type SuccessorPolicyState,
} from "./modelSuccessorOutcome";

export type SuccessorRoutingData = {
	canManage: boolean;
	enabled: boolean;
	pricePolicy: SuccessorPricePolicy;
	maxPriceIncreasePercent: number;
	replacements: Array<{ model: string; successor: string | null; updatedAt: string | null }>;
	/** The workspace's models that are being retired or are no longer served. */
	models?: SuccessorOverviewModel[];
	modelsAvailable?: boolean;
	workspaceId: string;
};

type ActionResult = { ok: true } | { ok: false; status: number; code?: string | null };

export const MODEL_RETIREMENT_DOCS_URL = "https://phaseo.app/docs/v1/guides/model-retirement#route-requests-to-a-replacement-automatically";
const REPLACEMENT_ERRORS = new Set(["unknown_model", "unknown_successor", "inactive_successor", "successor_is_model", "invalid_model", "invalid_successor", "too_many_replacements"]);

const OUTCOME_KEYS: Record<SuccessorOutcome, string> = {
	redirecting: "outcome.redirecting",
	will_redirect: "outcome.willRedirect",
	off: "outcome.off",
	never: "outcome.never",
	no_replacement: "outcome.noReplacement",
	replacement_unavailable: "outcome.replacementUnavailable",
	free_to_paid: "outcome.freeToPaid",
	price_higher: "outcome.priceHigher",
	price_unknown: "outcome.priceUnknown",
};

function ModelSuccessorRoutingSettings({ initialData }: { initialData: SuccessorRoutingData }) {
	const t = useTranslations("SettingsUI.modelSuccessorRouting");
	const write = useSettingsWrite();
	const [isPending, startTransition] = useTransition();
	const [enabled, setEnabled] = useState(initialData.enabled);
	const [pricePolicy, setPricePolicy] = useState<SuccessorPricePolicy>(initialData.pricePolicy);
	const [percent, setPercent] = useState(String(initialData.pricePolicy === "limit" ? initialData.maxPriceIncreasePercent : 25));
	const [replacements, setReplacements] = useState(initialData.replacements);
	const [model, setModel] = useState("");
	const [successor, setSuccessor] = useState("");
	const [never, setNever] = useState(false);
	const modelInput = useRef<HTMLInputElement>(null);
	// Read once, so rendering stays pure.
	const [now] = useState(() => Date.now());
	const { options: modelOptions, loading: modelsLoading, error: modelsError } = useGatewayModelOptions();
	const disabled = !initialData.canManage || isPending;
	const percentValue = Number(percent);
	const percentValid = pricePolicy !== "limit" || (Number.isInteger(percentValue) && percentValue >= 0 && percentValue <= 1000);
	// The model list reflects the settings as edited, so the effect of a change shows before saving.
	const policy: SuccessorPolicyState = { enabled, pricePolicy, maxPriceIncreasePercent: percentValid && pricePolicy === "limit" ? percentValue : 0 };
	const priceOptions = [
		{ value: "never", label: t("priceNever") },
		{ value: "limit", label: t("priceLimit") },
		{ value: "any", label: t("priceAny") },
	];

	const report = (result: ActionResult, success: string) => {
		if (result.ok) {
			toast.success(success);
			return true;
		}
		const code = "code" in result ? result.code : null;
		toast.error(code && REPLACEMENT_ERRORS.has(code) ? t(`errors.${code}` as never) : result.status === 403 ? t("errors.forbidden") : t("errors.saveFailed"));
		return false;
	};

	const saveSettings = () => startTransition(async () => {
		const result = await write(updateSuccessorRouting({
			enabled,
			pricePolicy,
			maxPriceIncreasePercent: pricePolicy === "limit" ? percentValue : 0,
		}));
		report(result, t("saved"));
	});

	const addReplacement = () => startTransition(async () => {
		const entry = { model: model.trim().toLowerCase(), successor: never ? null : successor.trim().toLowerCase() };
		const result = await write(saveSuccessorReplacement(entry));
		if (!report(result, t("replacementSaved"))) return;
		setReplacements((rows) => [...rows.filter((row) => row.model !== entry.model), { ...entry, updatedAt: new Date().toISOString() }]
			.sort((a, b) => a.model.localeCompare(b.model)));
		setModel("");
		setSuccessor("");
		setNever(false);
	});

	const removeReplacement = (slug: string) => startTransition(async () => {
		const result = await write(removeSuccessorReplacement(slug));
		if (report(result, t("replacementRemoved"))) setReplacements((rows) => rows.filter((row) => row.model !== slug));
	});

	const chooseReplacementFor = (row: SuccessorOverviewModel) => {
		setModel(row.model);
		setSuccessor(row.workspaceOverride && row.replacement ? row.replacement : row.suggestedReplacement ?? "");
		setNever(false);
		modelInput.current?.scrollIntoView({ block: "center", behavior: "smooth" });
		modelInput.current?.focus({ preventScroll: true });
	};

	return (
		<section className="space-y-3">
			<div>
				<h2 className="text-base font-semibold">{t("title")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{t("description")}{" "}
					<a className="underline underline-offset-4 hover:text-foreground" href={MODEL_RETIREMENT_DOCS_URL} target="_blank" rel="noreferrer">{t("learnMore")}</a>
				</p>
			</div>
			<div className="overflow-hidden rounded-md border">
				<div className="flex items-center justify-between gap-4 px-4 py-3">
					<div>
						<label htmlFor="model-successor-redirect" className="text-sm font-medium">{t("enable")}</label>
						<p className="mt-1 text-sm text-muted-foreground">{t("enableDescription")}</p>
					</div>
					<Switch id="model-successor-redirect" checked={enabled} onCheckedChange={setEnabled} disabled={disabled} aria-label={t("enable")} />
				</div>
				<Separator />
				<div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] sm:items-center">
					<div>
						<label htmlFor="model-successor-price" className="text-sm font-medium">{t("price")}</label>
						<p className="mt-1 text-sm text-muted-foreground">{t("priceDescription")}</p>
					</div>
					<div className="flex gap-2">
						<Select value={pricePolicy} items={priceOptions} onValueChange={(value) => setPricePolicy(value as SuccessorPricePolicy)} disabled={disabled}>
							<SelectTrigger id="model-successor-price" className="w-full rounded-md">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{priceOptions.map((option) => (
									<SelectItem key={option.value} value={option.value} label={option.label}>{option.label}</SelectItem>
								))}
							</SelectContent>
						</Select>
						{pricePolicy === "limit" ? (
							<Input
								type="number"
								min={0}
								max={1000}
								step={1}
								inputMode="numeric"
								className="w-24"
								value={percent}
								onChange={(event) => setPercent(event.target.value)}
								disabled={disabled}
								aria-label={t("percent")}
								aria-invalid={!percentValid}
							/>
						) : null}
					</div>
				</div>
				<Separator />
				<div className="flex items-center justify-between gap-4 px-4 py-3">
					<p className="text-sm text-muted-foreground">{initialData.canManage ? t("delayNotice") : t("adminsOnly")}</p>
					<Button type="button" onClick={saveSettings} disabled={disabled || !percentValid}>{t("save")}</Button>
				</div>
			</div>

			<div className="overflow-hidden rounded-md border">
				<div className="px-4 py-3">
					<h3 className="text-sm font-medium">{t("models")}</h3>
					<p className="mt-1 text-sm text-muted-foreground">{t("modelsDescription")}</p>
				</div>
				<Separator />
				{initialData.modelsAvailable === false ? (
					<p className="px-4 py-3 text-sm text-muted-foreground">{t("modelsUnavailable")}</p>
				) : initialData.models?.length ? (
					<ul className="divide-y">
						{initialData.models.map((row) => (
							<AffectedModelRow key={row.model} row={row} now={now} policy={policy} canManage={initialData.canManage} disabled={disabled} onChoose={() => chooseReplacementFor(row)} />
						))}
					</ul>
				) : (
					<p className="px-4 py-3 text-sm text-muted-foreground">{t("modelsEmpty")}</p>
				)}
			</div>

			<div className="overflow-hidden rounded-md border">
				<div className="px-4 py-3">
					<h3 className="text-sm font-medium">{t("replacements")}</h3>
					<p className="mt-1 text-sm text-muted-foreground">{t("replacementsDescription")}</p>
				</div>
				<Separator />
				{replacements.length ? (
					<ul className="divide-y">
						{replacements.map((row) => (
							<li key={row.model} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
								<span className="font-mono text-xs">{row.model}</span>
								<span className="text-muted-foreground">→</span>
								{row.successor ? <span className="font-mono text-xs">{row.successor}</span> : <span className="text-xs text-muted-foreground">{t("neverRedirect")}</span>}
								<Button type="button" variant="ghost" size="sm" onClick={() => removeReplacement(row.model)} disabled={disabled}>
									{t("remove")}
								</Button>
							</li>
						))}
					</ul>
				) : (
					<p className="px-4 py-3 text-sm text-muted-foreground">{t("noReplacements")}</p>
				)}
				<Separator />
				<div className="space-y-3 px-4 py-3">
					<div className="grid gap-2 sm:grid-cols-2">
						<Input ref={modelInput} value={model} onChange={(event) => setModel(event.target.value)} placeholder={t("modelPlaceholder")} aria-label={t("model")} disabled={disabled} className="h-10 border-border bg-background px-3 dark:bg-transparent" />
						{never ? (
							<p className="flex min-h-10 items-center rounded-md border px-3 text-sm text-muted-foreground">{t("neverRedirect")}</p>
						) : (
							<GatewayModelCombobox
								value={successor}
								onChange={setSuccessor}
								options={modelOptions}
								excludedIds={[model.trim().toLowerCase()]}
								ariaLabel={t("successor")}
								loading={modelsLoading}
								error={modelsError}
							/>
						)}
					</div>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<label className="flex items-center gap-2 text-sm">
							<Switch checked={never} onCheckedChange={setNever} disabled={disabled} aria-label={t("neverToggle")} />
							{t("neverToggle")}
						</label>
						<Button type="button" variant="outline" onClick={addReplacement} disabled={disabled || !model.trim() || (!never && !successor.trim())}>{t("add")}</Button>
					</div>
				</div>
			</div>
		</section>
	);
}

const GOOD_OUTCOMES = new Set<SuccessorOutcome>(["redirecting", "will_redirect"]);

function AffectedModelRow({ row, now, policy, canManage, disabled, onChoose }: {
	row: SuccessorOverviewModel;
	now: number;
	policy: SuccessorPolicyState;
	canManage: boolean;
	disabled: boolean;
	onChoose: () => void;
}) {
	const t = useTranslations("SettingsUI.modelSuccessorRouting");
	const format = useFormatter();
	const locale = useLocale();
	const date = (value: string | Date) => format.dateTime(typeof value === "string" ? new Date(value) : value, { dateStyle: "medium" });
	const outcome = successorOutcome(row, policy);
	const startsAt = redirectStartsAt(row);
	const replacementLabel = row.replacement ? row.replacementName ?? row.replacement : null;
	const change = row.replacement ? priceChangePercent(row) : null;
	const charges = GOOD_OUTCOMES.has(outcome) ? skippedCharges(row, policy) : [];
	const retiresInFuture = row.retiredAt && Date.parse(row.retiredAt) > now;

	const target = replacementLabel ?? "";
	const outcomeText = outcome === "redirecting" ? t("outcome.redirecting", { model: target })
		: outcome !== "will_redirect" ? t(OUTCOME_KEYS[outcome] as never)
		: startsAt && startsAt.getTime() > now ? t("outcome.willRedirectFrom", { model: target, date: date(startsAt) })
		: t("outcome.willRedirect", { model: target });

	return (
		<li className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
			<div className="min-w-0 space-y-1">
				<p className="min-w-0">
					<span className="font-medium">{row.name ?? row.model}</span>{" "}
					<span className="break-all font-mono text-xs text-muted-foreground">{row.model}</span>
				</p>
				<p className="text-xs text-muted-foreground">
					{[
						row.unservedSince ? t("notServedSince", { date: date(row.unservedSince) }) : t("stillServed"),
						retiresInFuture ? t("retires", { date: date(row.retiredAt!) }) : null,
						row.requests && row.lastUsedAt ? t("usage", { count: row.requests, date: date(row.lastUsedAt) }) : t("notUsed"),
					].filter(Boolean).join(" · ")}
				</p>
				<p className="text-xs text-muted-foreground">
					{t("replacementLabel")}:{" "}
					{replacementLabel ? (
						<>
							<span className="text-foreground">{replacementLabel}</span>
							{row.workspaceOverride ? ` (${t("yourReplacement")})` : null}
							{" · "}
							{change == null ? t("priceUnknown") : change === 0 ? t("priceSame") : change > 0 ? t("priceMore", { percent: change }) : t("priceLess", { percent: -change })}
						</>
					) : row.reason === "never" ? t("neverRedirect") : t("noReplacement")}
				</p>
				{!row.replacement && row.suggestedReplacement && row.reason !== "never" ? (
					<p className="text-xs text-muted-foreground">{t("suggested", { model: row.suggestedReplacement })}</p>
				) : null}
				<p className={cn("text-sm", GOOD_OUTCOMES.has(outcome) ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>{outcomeText}</p>
				{charges.length ? (
					<p className="text-xs text-muted-foreground">
						{t("skipped", { charges: new Intl.ListFormat(locale, { type: "disjunction" }).format(charges.map((charge) => t(`charges.${charge}` as never))) })}
					</p>
				) : null}
				{row.servedBy.map((served) => (
					<p key={served.model} className="text-xs text-muted-foreground">{t("servedBy", { model: served.model, count: served.requests })}</p>
				))}
			</div>
			{canManage ? (
				<Button type="button" variant="outline" size="sm" className="shrink-0 self-start" onClick={onChoose} disabled={disabled}>
					{t("chooseReplacement")}
				</Button>
			) : null}
		</li>
	);
}

export default withPrivateSettings<SuccessorRoutingData>("/api/account/settings/routing/successor", ModelSuccessorRoutingSettings);
