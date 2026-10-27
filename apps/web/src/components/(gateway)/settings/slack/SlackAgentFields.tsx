"use client";

import type { ReactNode } from "react";
import { Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Callout, type CalloutTone } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { EXTRA_ANSWER_NANOS, INCLUDED_ANSWERS_PER_PERSON, NANOS_PER_USD, PLAN_TIERS } from "@/lib/slack-agent/pricing";
import { GatewayModelCombobox, useGatewayModelOptions } from "../GatewayModelCombobox";
import {
	AUTO_SLACK_AGENT_MODEL,
	CUSTOM_PLAN,
	DEFAULT_ANSWERS_PER_PERSON_HOUR,
	DEFAULT_SLACK_AGENT_MODEL,
	formatUsd,
	isAutoModel,
	MAX_ALLOWED_MODELS,
	TURN_COST_LIMIT_USD,
	TURN_STEP_LIMIT,
	parseWhole,
	planPriceUsd,
	type SlackAccessMode,
	type SlackDraftField,
	type SlackDraftProblem,
	type SlackErrorKey,
	type SlackLimitsDraft,
	type SlackOverPlan,
} from "./slackAgentForm";

const TEXT_MODEL_CAPABILITY = "text.generate";

export function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
	return (
		<section className="space-y-4 border-t pt-6">
			<div>
				<h2 className="text-base font-semibold">{title}</h2>
				{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
			</div>
			{children}
		</section>
	);
}

const NOTICE_TONES: Record<"info" | "success" | "warning" | "error", CalloutTone> = {
	info: "info",
	success: "success",
	warning: "warning",
	error: "critical",
};

export function Notice({ tone = "info", children, role }: { tone?: keyof typeof NOTICE_TONES; children: ReactNode; role?: "alert" | "status" }) {
	return <Callout tone={NOTICE_TONES[tone]} role={role}>{children}</Callout>;
}

/** An error from a Slack settings action, with the next step linked where there is one. */
export function SlackError({ error }: { error: { key: SlackErrorKey; message?: string | null } }) {
	const t = useTranslations("SettingsUI.slack");
	return (
		<Notice tone="error" role="alert">
			{error.key === "invalid" && error.message ? t("errors.invalidWithMessage", { message: error.message }) : t(`errors.${error.key}`, { max: MAX_ALLOWED_MODELS })}
			{error.key === "privacyReview" ? <> <Link href="/chat" className="underline underline-offset-4">{t("openChat")}</Link></> : null}
			{error.key === "paymentDue" ? <> <Link href="/settings/credits" className="underline underline-offset-4">{t("addCredits")}</Link></> : null}
		</Notice>
	);
}

export function FieldProblem({ id, problem, field, help }: { id: string; problem: SlackDraftProblem | null; field: SlackDraftField; help?: ReactNode }) {
	const t = useTranslations("SettingsUI.slack");
	const own = problem?.field === field ? problem : null;
	if (!own && !help) return null;
	return <p id={id} className={cn("text-xs", own ? "text-destructive" : "text-muted-foreground")}>{own ? t(`problems.${own.code}`, own.values ?? {}) : help}</p>;
}

export function SwitchField({ label, help, checked, disabled, onChange }: { label: string; help: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
	return (
		<label className="flex items-start justify-between gap-4">
			<span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{help}</span></span>
			<Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
		</label>
	);
}

export function Choice<T extends string>({ label, value, options, disabled, onChange }: {
	label: string;
	value: T;
	options: Array<{ value: T; label: string }>;
	disabled?: boolean;
	onChange: (value: T) => void;
}) {
	return (
		<ToggleGroup type="single" variant="outline" value={value} disabled={disabled} aria-label={label} className="flex-wrap justify-start"
			onValueChange={(next: string) => { const option = options.find((entry) => entry.value === next); if (option) onChange(option.value); }}>
			{options.map((option) => <ToggleGroupItem key={option.value} value={option.value} className="rounded-md px-3">{option.label}</ToggleGroupItem>)}
		</ToggleGroup>
	);
}

function MoneyInput({ id, value, disabled, invalid, describedBy, placeholder, onChange }: {
	id: string; value: string; disabled?: boolean; invalid?: boolean; describedBy: string; placeholder?: string; onChange: (value: string) => void;
}) {
	return (
		<div className="relative">
			<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
			<Input id={id} inputMode="decimal" value={value} disabled={disabled} className="pl-7" placeholder={placeholder} aria-invalid={invalid || undefined} aria-describedby={describedBy} onChange={(event) => onChange(event.target.value)} />
		</div>
	);
}

/**
 * Auto, or one model from the gateway catalogue. Auto is offered only where the
 * workspace has Auto Routing: the gateway refuses phaseo/auto everywhere else.
 */
export function ModelField({ value, autoAvailable, disabled, problem, onChange }: {
	value: string;
	autoAvailable: boolean;
	disabled?: boolean;
	problem: SlackDraftProblem | null;
	onChange: (model: string) => void;
}) {
	const t = useTranslations("SettingsUI.slack");
	const models = useGatewayModelOptions();
	const auto = isAutoModel(value);
	const picker = (
		<GatewayModelCombobox
			value={auto ? "" : value}
			onChange={onChange}
			options={models.options}
			filter={(option) => option.capabilities.includes(TEXT_MODEL_CAPABILITY)}
			ariaLabel={t("model.label")}
			loading={models.loading}
			error={models.error}
		/>
	);
	return (
		<div className="space-y-2">
			{autoAvailable ? (
				<>
					<Choice
						label={t("model.label")}
						value={auto ? "auto" : "specific"}
						disabled={disabled}
						options={[{ value: "auto", label: t("model.auto") }, { value: "specific", label: t("model.specific") }]}
						onChange={(mode) => onChange(mode === "auto" ? AUTO_SLACK_AGENT_MODEL : DEFAULT_SLACK_AGENT_MODEL)}
					/>
					{auto ? <p className="text-xs text-muted-foreground">{t("model.autoHelp")}</p> : picker}
				</>
			) : (
				<>
					{/* Saved on Auto before access was checked: the agent can't answer until a model is chosen. */}
					{auto ? <Notice tone="warning" role="status">{t("model.autoUnavailable")}</Notice> : null}
					{picker}
				</>
			)}
			<FieldProblem id="slack-model-help" problem={problem} field="model" help={t("model.help")} />
		</div>
	);
}

/** How a message chooses its model; not translated, since people type it as is. */
const MODEL_PREFIX = "with <model>:";

/**
 * Model choice: whether people may start a message with `with <model>:`, and the
 * models they may name, from the gateway catalogue (and Auto, where the workspace
 * has Auto Routing). The agent's model above stays the default.
 */
export function ModelChoiceFields({ enabled, models, autoAvailable, disabled, problem, onEnabledChange, onModelsChange }: {
	enabled: boolean;
	models: string[];
	autoAvailable: boolean;
	disabled?: boolean;
	problem: SlackDraftProblem | null;
	onEnabledChange: (enabled: boolean) => void;
	onModelsChange: (models: string[]) => void;
}) {
	const t = useTranslations("SettingsUI.slack.modelChoice");
	const catalogue = useGatewayModelOptions();
	const byId = new Map(catalogue.options.map((option) => [option.id, option]));
	const auto = models.some(isAutoModel);
	const full = models.length >= MAX_ALLOWED_MODELS;
	const remove = (id: string) => onModelsChange(models.filter((model) => model !== id));
	return (
		<div className="space-y-4">
			<SwitchField label={t("enable")} help={t("enableHelp", { prefix: MODEL_PREFIX })} checked={enabled} disabled={disabled} onChange={onEnabledChange} />
			{enabled ? (
				<div className="space-y-3">
					<p id="slack-allowed-models" className="text-sm font-medium">{t("models", { count: models.length, max: MAX_ALLOWED_MODELS })}</p>
					{models.length ? (
						<ul className="divide-y rounded-md border" aria-labelledby="slack-allowed-models">
							{models.map((id) => {
								const option = byId.get(id);
								const label = isAutoModel(id) ? t("auto") : option ? `${option.organisationName}: ${option.label}` : id;
								return (
									<li key={id} className="flex items-center gap-3 px-3 py-2">
										{option ? <Logo id={option.organisationId} alt={option.organisationName} width={20} height={20} className="size-5 shrink-0 object-contain" /> : <Sparkles className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-medium">{label}</span>
											<span className="block truncate text-[11px] text-muted-foreground">{id}</span>
										</span>
										<Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={t("remove", { model: label })} onClick={() => remove(id)}>
											<X />
										</Button>
									</li>
								);
							})}
						</ul>
					) : null}
					{full ? <p className="text-xs text-muted-foreground">{t("full", { max: MAX_ALLOWED_MODELS })}</p> : (
						<GatewayModelCombobox
							value=""
							onChange={(id) => { if (id && !models.includes(id)) onModelsChange([...models, id]); }}
							options={catalogue.options}
							excludedIds={models}
							filter={(option) => option.capabilities.includes(TEXT_MODEL_CAPABILITY)}
							ariaLabel={t("add")}
							loading={catalogue.loading}
							error={catalogue.error}
						/>
					)}
					{autoAvailable || auto ? (
						<SwitchField
							label={t("includeAuto")}
							help={t("includeAutoHelp")}
							checked={auto}
							disabled={disabled || (!auto && (full || !autoAvailable))}
							onChange={(checked) => onModelsChange(checked ? [...models, AUTO_SLACK_AGENT_MODEL] : models.filter((model) => !isAutoModel(model)))}
						/>
					) : null}
					{/* Allowed before Auto Routing was checked here: asking with Auto fails until it is removed. */}
					{auto && !autoAvailable ? <Notice tone="warning" role="status">{t("autoUnavailable")}</Notice> : null}
					<FieldProblem id="slack-allowed-models-help" problem={problem} field="allowedModels" help={t("help", { cost: formatUsd(TURN_COST_LIMIT_USD), steps: TURN_STEP_LIMIT })} />
				</div>
			) : null}
		</div>
	);
}

export function AccessField({ value, disabled, onChange }: { value: SlackAccessMode; disabled?: boolean; onChange: (mode: SlackAccessMode) => void }) {
	const t = useTranslations("SettingsUI.slack");
	return (
		<div className="space-y-2">
			<Choice
				label={t("sections.access")}
				value={value}
				disabled={disabled}
				options={[{ value: "everyone", label: t("access.everyone") }, { value: "linked", label: t("access.linked") }]}
				onChange={onChange}
			/>
			<p className="text-xs text-muted-foreground">{value === "linked" ? t("access.linkedHelp") : t("access.everyoneHelp")}</p>
		</div>
	);
}

/** The plan, what happens beyond it, and the other limits, shared by install and settings. */
export function LimitsFields({ draft, disabled, problem, set }: {
	draft: SlackLimitsDraft;
	disabled?: boolean;
	problem: SlackDraftProblem | null;
	/** The install and settings forms' setters, which cover these fields and more. */
	set: (field: keyof SlackLimitsDraft, value: SlackLimitsDraft[keyof SlackLimitsDraft]) => void;
}) {
	const t = useTranslations("SettingsUI.slack.limits");
	const largest = PLAN_TIERS[PLAN_TIERS.length - 1].people;
	const planItems = [
		...PLAN_TIERS.map((tier) => ({ value: String(tier.people), label: t("planOption", { people: tier.people, price: formatUsd(tier.priceNanos / NANOS_PER_USD) }) })),
		{ value: CUSTOM_PLAN, label: t("planCustom", { people: largest }) },
	];
	const customPeople = parseWhole(draft.customPlanPeople);
	const invalid = (field: SlackDraftField) => problem?.field === field || undefined;
	return (
		<div className="space-y-5">
			<p className="text-sm text-muted-foreground">
				{t("pricing", { included: INCLUDED_ANSWERS_PER_PERSON, extra: formatUsd((EXTRA_ANSWER_NANOS * 1_000) / NANOS_PER_USD) })}
			</p>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor="slack-plan">{t("plan")}</Label>
					<Select value={draft.plan} items={planItems} disabled={disabled} onValueChange={(value) => set("plan", value)}>
						<SelectTrigger id="slack-plan" className="w-full rounded-md"><SelectValue /></SelectTrigger>
						<SelectContent>
							{planItems.map((item) => <SelectItem key={item.value} value={item.value} label={item.label}>{item.label}</SelectItem>)}
						</SelectContent>
					</Select>
				</div>
				{draft.plan === CUSTOM_PLAN ? (
					<div className="space-y-1.5">
						<Label htmlFor="slack-plan-people">{t("customPeople")}</Label>
						<Input id="slack-plan-people" inputMode="numeric" value={draft.customPlanPeople} disabled={disabled} aria-invalid={invalid("customPlanPeople")} aria-describedby="slack-plan-people-help" onChange={(event) => set("customPlanPeople", event.target.value)} />
						<FieldProblem id="slack-plan-people-help" problem={problem} field="customPlanPeople" help={customPeople && customPeople > largest ? t("customPrice", { price: formatUsd(planPriceUsd(customPeople)) }) : undefined} />
					</div>
				) : null}
			</div>
			<div className="space-y-2">
				<Label>{t("overPlan")}</Label>
				<Choice<SlackOverPlan>
					label={t("overPlan")}
					value={draft.overPlan}
					disabled={disabled}
					options={[{ value: "refuse", label: t("refuse") }, { value: "move_up", label: t("moveUp") }]}
					onChange={(value) => set("overPlan", value)}
				/>
				<p className="text-xs text-muted-foreground">{draft.overPlan === "move_up" ? t("moveUpHelp") : t("refuseHelp")}</p>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor="slack-max-people">{t("maxPeople")}</Label>
					<Input id="slack-max-people" inputMode="numeric" value={draft.maxPeople} disabled={disabled} placeholder={t("noLimit")} aria-invalid={invalid("maxPeople")} aria-describedby="slack-max-people-help" onChange={(event) => set("maxPeople", event.target.value)} />
					<FieldProblem id="slack-max-people-help" problem={problem} field="maxPeople" help={t("maxPeopleHelp")} />
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="slack-cap">{t("monthlyCap")}</Label>
					<MoneyInput id="slack-cap" value={draft.monthlyCapUsd} disabled={disabled} invalid={invalid("monthlyCapUsd")} describedBy="slack-cap-help" onChange={(value) => set("monthlyCapUsd", value)} />
					<FieldProblem id="slack-cap-help" problem={problem} field="monthlyCapUsd" help={t("monthlyCapHelp")} />
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="slack-hourly">{t("answersPerHour")}</Label>
					<Input id="slack-hourly" inputMode="numeric" value={draft.answersPerPersonHour} disabled={disabled} aria-invalid={invalid("answersPerPersonHour")} aria-describedby="slack-hourly-help" onChange={(event) => set("answersPerPersonHour", event.target.value)} />
					<FieldProblem id="slack-hourly-help" problem={problem} field="answersPerPersonHour" help={t("answersPerHourHelp", { default: DEFAULT_ANSWERS_PER_PERSON_HOUR })} />
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="slack-token-limit">{t("tokenLimit")}</Label>
					<MoneyInput id="slack-token-limit" value={draft.tokenLimitUsd} disabled={disabled} placeholder={t("noLimit")} invalid={invalid("tokenLimitUsd")} describedBy="slack-token-limit-help" onChange={(value) => set("tokenLimitUsd", value)} />
					<FieldProblem id="slack-token-limit-help" problem={problem} field="tokenLimitUsd" help={t("tokenLimitHelp")} />
				</div>
			</div>
			<div className="space-y-4">
				<SwitchField label={t("allowGuests")} help={t("allowGuestsHelp")} checked={draft.allowGuests} disabled={disabled} onChange={(checked) => set("allowGuests", checked)} />
				<SwitchField label={t("allowExternal")} help={t("allowExternalHelp")} checked={draft.allowExternalUsers} disabled={disabled} onChange={(checked) => set("allowExternalUsers", checked)} />
			</div>
		</div>
	);
}
