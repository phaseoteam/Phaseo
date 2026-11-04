"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Boxes, Check, EyeOff, Plus, ScanText, Server, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import GuardrailWizardAssign from "./GuardrailWizardAssign";
import {
	applyTemplate,
	describeGuardrail,
	draftGuardrailRow,
	enableSection,
	furthestReachableStep,
	GUARDRAIL_TEMPLATE_IDS,
	resetSection,
	stepIssue,
	WIZARD_SECTIONS,
	WIZARD_STEPS,
	type GuardrailTemplateId,
	type GuardrailWizardForm,
	type WizardIssue,
	type WizardSection,
	type WizardStep,
} from "./guardrailWizard";

const TEMPLATE_ICONS: Record<GuardrailTemplateId, LucideIcon> = {
	zdr: ShieldCheck,
	"no-training": EyeOff,
	"approved-providers": Server,
	"approved-models": Boxes,
	"block-prompt-injection": ShieldAlert,
	"redact-personal-info": ScanText,
};

const TEMPLATE_COPY: Record<GuardrailTemplateId, string> = {
	zdr: "templateZdr",
	"no-training": "templateNoTraining",
	"approved-providers": "templateApprovedProviders",
	"approved-models": "templateApprovedModels",
	"block-prompt-injection": "templateBlockPromptInjection",
	"redact-personal-info": "templateRedactPersonalInfo",
};

const SECTION_COPY: Record<WizardSection, string> = {
	access: "sectionAccess",
	"prompt-injection": "sectionPromptInjection",
	"sensitive-info": "sectionSensitiveInfo",
};

/**
 * The new-guardrail flow: say what it does (from a template or by picking checks), configure only
 * those checks, choose who it applies to while seeing what changes for each of them, then review.
 * The editor owns the form; this owns the steps.
 */
export default function GuardrailCreateWizard(props: {
	form: GuardrailWizardForm;
	defaults: GuardrailWizardForm;
	onFormChange: (update: (form: GuardrailWizardForm) => GuardrailWizardForm) => void;
	sections: WizardSection[];
	onSectionsChange: (sections: WizardSection[]) => void;
	/** The editor's sections for the chosen checks. */
	configure: ReactNode;
	modelCoverage: { available: number; total: number };
	saving: boolean;
	onCreate: () => void;
	backHref: string;
}) {
	const t = useTranslations("SettingsUI.guardrailWizard");
	const tSettings = useTranslations("SettingsUI");
	const tGuardrail = useTranslations("SettingsUI.guardrailEditorCopy");
	const tx = (key: string, values?: Record<string, unknown>) => t(key as never, values as never);
	const [step, setStep] = useState<WizardStep>("start");
	const [templateId, setTemplateId] = useState<GuardrailTemplateId | null>(null);
	const translateRuleIssue = (key: string, values?: Record<string, unknown>) => tGuardrail(key as never, values as never);
	const issue = stepIssue(step, props.form, props.sections, translateRuleIssue);
	const reachable = furthestReachableStep(props.form, props.sections, translateRuleIssue);
	const stepIndex = WIZARD_STEPS.indexOf(step);
	const reachableIndex = WIZARD_STEPS.indexOf(reachable);
	const draft = useMemo(() => draftGuardrailRow(props.form), [props.form]);

	function issueText(value: WizardIssue): string {
		return typeof value === "string" ? tx(`issue.${value}`) : value.sensitiveRule;
	}

	function goTo(next: WizardStep) {
		if (WIZARD_STEPS.indexOf(next) > reachableIndex) return;
		setStep(next);
		window.scrollTo({ top: 0 });
	}

	function chooseTemplate(id: GuardrailTemplateId) {
		const result = applyTemplate({
			form: props.form,
			defaults: props.defaults,
			templateId: id,
			previousTemplateName: templateId ? tx(`${TEMPLATE_COPY[templateId]}.name`) : null,
			templateName: tx(`${TEMPLATE_COPY[id]}.name`),
		});
		setTemplateId(id);
		props.onFormChange(() => result.form);
		props.onSectionsChange(result.sections);
	}

	function toggleSection(section: WizardSection, on: boolean) {
		props.onFormChange((form) => on ? enableSection(form, section) : resetSection(form, props.defaults, section));
		props.onSectionsChange(on
			? WIZARD_SECTIONS.filter((id) => id === section || props.sections.includes(id))
			: props.sections.filter((id) => id !== section));
		// A template no longer describes the guardrail once its checks change.
		setTemplateId(null);
	}

	const isLast = step === "review";
	const actions = (
		<div className="flex flex-col items-end gap-1">
			<div className="flex flex-wrap items-center gap-2">
				<Button asChild type="button" variant="outline" disabled={props.saving} className="rounded-md">
					<Link href={props.backHref}>{t("cancel")}</Link>
				</Button>
				{stepIndex > 0 ? (
					<Button type="button" variant="outline" disabled={props.saving} className="rounded-md" onClick={() => goTo(WIZARD_STEPS[stepIndex - 1]!)}>
						{t("back")}
					</Button>
				) : null}
				<Button
					type="button"
					className="rounded-md"
					disabled={props.saving || Boolean(issue)}
					onClick={() => isLast ? props.onCreate() : goTo(WIZARD_STEPS[stepIndex + 1]!)}
				>
					{isLast ? (props.saving ? t("creating") : t("create")) : t("continue")}
				</Button>
			</div>
			{issue ? <p className="text-right text-xs text-muted-foreground" role="status">{issueText(issue)}</p> : null}
		</div>
	);

	return (
		<div className="space-y-6">
			<div className="space-y-5">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="min-w-0">
						<h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
						<p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
					</div>
					{actions}
				</div>
				<nav aria-label={t("stepsLabel")}>
					<ol className="flex items-center gap-2">
						{WIZARD_STEPS.map((id, index) => {
							const done = index < stepIndex;
							const current = index === stepIndex;
							const enabled = index <= reachableIndex && !props.saving;
							return (
								<li key={id} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
									<button
										type="button"
										disabled={!enabled || current}
										onClick={() => goTo(id)}
										aria-current={current ? "step" : undefined}
										className="flex shrink-0 items-center gap-2 rounded-md py-1 pr-1 text-sm disabled:cursor-default"
									>
										<span
											className={cn(
												"flex h-6 w-6 items-center justify-center rounded-md border text-xs font-medium",
												current ? "border-primary bg-primary text-primary-foreground" : done ? "border-primary/40 text-primary" : "text-muted-foreground",
											)}
										>
											{done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
										</span>
										<span className={cn("hidden sm:inline", current ? "font-medium" : enabled ? "text-foreground" : "text-muted-foreground")}>
											{tx(`step.${id}`)}
										</span>
									</button>
									{index < WIZARD_STEPS.length - 1 ? <span className="h-px min-w-4 flex-1 bg-border" aria-hidden="true" /> : null}
								</li>
							);
						})}
					</ol>
				</nav>
			</div>

			{step === "start" ? (
				<div className="space-y-8">
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="guardrail-wizard-name">
								{t("nameLabel")} <span className="text-destructive">*</span>
							</Label>
							<Input
								id="guardrail-wizard-name"
								value={props.form.name}
								onChange={(event) => { const name = event.target.value; props.onFormChange((form) => ({ ...form, name })); }}
								placeholder={t("namePlaceholder")}
								autoFocus
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="guardrail-wizard-description">{t("descriptionLabel")}</Label>
							<Input
								id="guardrail-wizard-description"
								value={props.form.description}
								onChange={(event) => { const description = event.target.value; props.onFormChange((form) => ({ ...form, description })); }}
								placeholder={t("descriptionPlaceholder")}
							/>
						</div>
					</div>

					<section className="space-y-3">
						<div>
							<h2 className="text-sm font-semibold">{t("templatesTitle")}</h2>
							<p className="mt-1 text-sm text-muted-foreground">{t("templatesBody")}</p>
						</div>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{GUARDRAIL_TEMPLATE_IDS.map((id) => {
								const Icon = TEMPLATE_ICONS[id];
								const selected = templateId === id;
								return (
									<button
										key={id}
										type="button"
										onClick={() => chooseTemplate(id)}
										aria-pressed={selected}
										className={cn(
											"flex items-start gap-3 rounded-md border p-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											selected && "border-primary bg-primary/5 hover:bg-primary/5",
										)}
									>
										<Icon className={cn("mt-0.5 h-4 w-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
										<span className="min-w-0 flex-1">
											<span className="block text-sm font-medium">{tx(`${TEMPLATE_COPY[id]}.name`)}</span>
											<span className="mt-1 block text-sm text-muted-foreground">{tx(`${TEMPLATE_COPY[id]}.body`)}</span>
										</span>
										{selected ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : null}
									</button>
								);
							})}
						</div>
					</section>

					<section className="space-y-3">
						<div>
							<h2 className="text-sm font-semibold">{t("sectionsTitle")}</h2>
							<p className="mt-1 text-sm text-muted-foreground">{t("sectionsBody")}</p>
						</div>
						<div className="divide-y rounded-md border">
							{WIZARD_SECTIONS.map((section) => (
								<label key={section} className="flex cursor-pointer items-start gap-3 p-4 hover:bg-muted/20">
									<Checkbox
										checked={props.sections.includes(section)}
										onCheckedChange={(checked) => toggleSection(section, checked === true)}
										className="mt-0.5"
									/>
									<span className="min-w-0">
										<span className="block text-sm font-medium">{tx(`${SECTION_COPY[section]}.name`)}</span>
										<span className="mt-1 block text-sm text-muted-foreground">{tx(`${SECTION_COPY[section]}.body`)}</span>
									</span>
								</label>
							))}
						</div>
					</section>
				</div>
			) : null}

			{step === "configure" ? (
				<div className="space-y-6">
					{props.configure}
					{WIZARD_SECTIONS.some((section) => !props.sections.includes(section)) ? (
						<div className="flex flex-wrap items-center gap-2 border-t pt-4">
							<span className="text-sm text-muted-foreground">{t("addCheck")}</span>
							{WIZARD_SECTIONS.filter((section) => !props.sections.includes(section)).map((section) => (
								<Button key={section} type="button" variant="outline" size="sm" className="rounded-md" onClick={() => toggleSection(section, true)}>
									<Plus className="h-3.5 w-3.5" aria-hidden="true" />
									{tx(`${SECTION_COPY[section]}.name`)}
								</Button>
							))}
						</div>
					) : null}
				</div>
			) : null}

			{step === "assign" ? (
				<div className="space-y-4">
					<div>
						<h2 className="text-sm font-semibold">{t("assignTitle", { name: props.form.name.trim() })}</h2>
						<p className="mt-1 text-sm text-muted-foreground">{t("assignBody")}</p>
					</div>
					<GuardrailWizardAssign
						draft={draft}
						keyIds={props.form.keyIds}
						memberIds={props.form.memberIds}
						onChange={({ keyIds, memberIds }) => props.onFormChange((form) => ({ ...form, keyIds, memberIds }))}
					/>
				</div>
			) : null}

			{step === "review" ? (
				<Review
					form={props.form}
					sections={props.sections}
					modelCoverage={props.modelCoverage}
					onEdit={goTo}
					onEnabledChange={(enabled) => props.onFormChange((form) => ({ ...form, enabled }))}
					actionLabel={(action) => tSettings(`guardrailsControls.${action}` as never)}
				/>
			) : null}

			{step !== "start" ? <div className="flex justify-end border-t pt-4">{actions}</div> : null}
		</div>
	);
}

function Review(props: {
	form: GuardrailWizardForm;
	sections: WizardSection[];
	modelCoverage: { available: number; total: number };
	onEdit: (step: WizardStep) => void;
	onEnabledChange: (enabled: boolean) => void;
	actionLabel: (action: string) => string;
}) {
	const t = useTranslations("SettingsUI.guardrailWizard");
	const tx = (key: string, values?: Record<string, unknown>) => t(key as never, values as never);
	const lines = describeGuardrail(props.form, props.sections);
	const targets = props.form.keyIds.length + props.form.memberIds.length;
	const showCoverage = props.sections.includes("access") && props.modelCoverage.total > 0;
	return (
		<div className="divide-y rounded-md border">
			<ReviewRow title={t("reviewWhat")} onEdit={() => props.onEdit("configure")} editLabel={t("change")}>
				<p className="text-sm font-medium">{props.form.name.trim()}</p>
				{props.form.description.trim() ? <p className="text-sm text-muted-foreground">{props.form.description.trim()}</p> : null}
				<ul className="mt-2 space-y-1">
					{lines.map((line) => (
						<li key={line.key} className="flex items-start gap-2 text-sm">
							<Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
							<span>{tx(line.key, line.key === "summaryPromptInjection" ? { action: props.actionLabel(String(line.values?.action)) } : line.values)}</span>
						</li>
					))}
				</ul>
			</ReviewRow>
			{showCoverage ? (
				<ReviewRow title={t("reviewModels")}>
					<p className="text-sm">{t("modelsAvailable", { available: props.modelCoverage.available, total: props.modelCoverage.total })}</p>
					{props.modelCoverage.available === 0 ? (
						<Callout tone="critical" role="alert" className="mt-2">{t("blocksEverything")}</Callout>
					) : null}
				</ReviewRow>
			) : null}
			<ReviewRow title={t("reviewWho")} onEdit={() => props.onEdit("assign")} editLabel={t("change")}>
				<p className="text-sm">
					{targets
						? t("appliesTo", { keys: props.form.keyIds.length, members: props.form.memberIds.length })
						: t("appliesToNothing")}
				</p>
			</ReviewRow>
			<div className="flex items-center justify-between gap-4 p-4">
				<div>
					<p className="text-sm font-medium">{t("turnOnNow")}</p>
					<p className="mt-1 text-sm text-muted-foreground">{t("turnOnNowBody")}</p>
				</div>
				<Switch checked={props.form.enabled} onCheckedChange={props.onEnabledChange} aria-label={t("turnOnNow")} />
			</div>
		</div>
	);
}

function ReviewRow(props: { title: string; children: ReactNode; onEdit?: () => void; editLabel?: string }) {
	return (
		<div className="grid gap-2 p-4 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:gap-4">
			<p className="text-sm text-muted-foreground">{props.title}</p>
			<div className="min-w-0">{props.children}</div>
			{props.onEdit ? (
				<Button type="button" variant="ghost" size="sm" className="justify-self-start rounded-md sm:justify-self-end" onClick={props.onEdit}>
					{props.editLabel}
				</Button>
			) : null}
		</div>
	);
}
