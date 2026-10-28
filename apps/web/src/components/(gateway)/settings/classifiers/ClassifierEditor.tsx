"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Check, ChevronsUpDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { SettingsClassifier, SettingsClassifiersInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { createClassifier, deleteClassifier, updateClassifier, type ClassifierActionError } from "@/app/(dashboard)/settings/classifiers/actions";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { GatewayModelCombobox, useGatewayModelOptions } from "../GatewayModelCombobox";
import { CLASSIFIER_PRESETS, type ClassifierPresetId } from "./classifierPresets";
import {
	applyPreset,
	draftFromClassifier,
	draftToPayload,
	emptyDraft,
	formatUsd,
	logsHrefForLabel,
	problemLocation,
	type ClassifierDraft,
	type DraftProblem,
} from "./classifierForm";
import { DimensionsEditor } from "./DimensionsEditor";
import { ClassifierTestPanel } from "./ClassifierTestPanel";
import { CLASSIFIER_MODEL_CAPABILITIES, MAX_INSTRUCTIONS_LENGTH, MAX_SCOPE_ENTRIES, allowedValues, classifierRequestFormat } from "./requestClassifiers";

const CLASSIFIER_LABEL_KEY = "phaseo.classifier";

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
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

function MultiSelect({ label, emptyLabel, options, selected, onChange, disabled }: {
	label: string;
	emptyLabel: string;
	options: Array<{ value: string; label: string; detail?: string }>;
	selected: string[];
	onChange: (values: string[]) => void;
	disabled?: boolean;
}) {
	const t = useTranslations("SettingsUI.classifiers.scope");
	const [open, setOpen] = useState(false);
	const known = new Map(options.map((option) => [option.value, option]));
	// Saved ids that are no longer listed (a deleted key) stay visible so they can be removed.
	const all: Array<{ value: string; label: string; detail?: string }> = [...options, ...selected.filter((value) => !known.has(value)).map((value) => ({ value, label: value }))];
	return (
		<div className="space-y-1.5">
			<Label>{label}</Label>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button type="button" variant="outline" disabled={disabled} aria-label={label} className="w-full justify-between font-normal">
						<span className={cn("truncate", !selected.length && "text-muted-foreground")}>{selected.length ? t("selected", { count: selected.length }) : emptyLabel}</span>
						<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-[min(420px,calc(100vw-2rem))] p-0">
					<Command>
						<CommandInput placeholder={t("search")} />
						<CommandList className="max-h-72">
							<CommandEmpty>{t("none")}</CommandEmpty>
							<CommandGroup>
								{all.map((option) => {
									const active = selected.includes(option.value);
									return (
										<CommandItem key={option.value} value={`${option.label} ${option.value} ${option.detail ?? ""}`} disabled={!active && selected.length >= MAX_SCOPE_ENTRIES} onSelect={() => onChange(active ? selected.filter((value) => value !== option.value) : [...selected, option.value])}>
											<Check className={cn("size-4 shrink-0", !active && "opacity-0")} />
											<div className="min-w-0 flex-1"><p className="truncate">{option.label}</p>{option.detail ? <p className="truncate text-xs text-muted-foreground">{option.detail}</p> : null}</div>
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}

export default function ClassifierEditor({ classifier, keys, apps }: {
	classifier: SettingsClassifier | null;
	keys: SettingsClassifiersInitialData["keys"];
	apps: SettingsClassifiersInitialData["apps"];
}) {
	const t = useTranslations("SettingsUI.classifiers");
	// Locale-aware navigation; write() invalidates cached settings reads after every write.
	const router = useRouter();
	const write = useSettingsWrite();
	const [draft, setDraft] = useState<ClassifierDraft>(() => classifier ? draftFromClassifier(classifier) : emptyDraft());
	const [problem, setProblem] = useState<DraftProblem | null>(null);
	const [saving, startSaving] = useTransition();
	const [deleting, startDeleting] = useTransition();
	const models = useGatewayModelOptions();
	const selectedModel = models.options.find((option) => option.id === draft.model);
	const requestFormat = selectedModel ? classifierRequestFormat(selectedModel.routeCapabilities) : null;
	const set = <K extends keyof ClassifierDraft>(field: K, value: ClassifierDraft[K]) => {
		setDraft((current) => ({ ...current, [field]: value }));
		setProblem(null);
	};
	const location = problem?.field === "api" ? problemLocation(problem.message) : null;
	const busy = saving || deleting;

	function actionError(result: ClassifierActionError, fallback: string): string {
		return result.message ? t("errors.invalid", { message: result.message }) : fallback;
	}

	function save() {
		const built = draftToPayload(draft);
		if (!built.ok) {
			setProblem(built.problem);
			return;
		}
		startSaving(async () => {
			const result = classifier ? await write(updateClassifier(classifier.id, built.payload)) : await write(createClassifier(built.payload));
			if (!result.ok) {
				toast.error(actionError(result, t("errors.saveFailed")));
				return;
			}
			toast.success(classifier ? t("actions.saved") : t("actions.created"));
			if (!classifier) router.push(`/settings/classifiers/${result.id}`);
			else router.refresh();
		});
	}

	function remove() {
		if (!classifier) return;
		startDeleting(async () => {
			const result = await write(deleteClassifier(classifier.id));
			if (!result.ok) {
				toast.error(actionError(result, t("errors.deleteFailed")));
				return;
			}
			toast.success(t("actions.deleted"));
			router.push("/settings/classifiers");
		});
	}

	function testRequest() {
		const built = draftToPayload(draft);
		if (!built.ok) {
			setProblem(built.problem);
			return null;
		}
		return { model: built.payload.model, instructions: built.payload.instructions, dimensions: built.payload.dimensions };
	}

	const keyOptions = useMemo(() => keys.map((key) => ({ value: key.id, label: key.name || key.prefix, detail: key.prefix })), [keys]);
	const appOptions = useMemo(() => apps.map((app) => ({ value: app.id, label: app.title || app.id })), [apps]);
	const modelScopeOptions = useMemo(() => models.options.map((option) => ({ value: option.id, label: `${option.organisationName}: ${option.label}`, detail: option.id })), [models.options]);
	const savedDimensions = classifier?.dimensions ?? [];

	return (
		<div className="space-y-6">
			<Callout>{t("billingNote")}</Callout>

			{!classifier ? (
				<section className="space-y-3">
					<div>
						<h2 className="text-base font-semibold">{t("presets.title")}</h2>
						<p className="mt-1 text-sm text-muted-foreground">{t("presets.description")}</p>
					</div>
					<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{CLASSIFIER_PRESETS.map((preset) => (
							<button
								key={preset.id}
								type="button"
								disabled={busy}
								onClick={() => { setDraft((current) => applyPreset(current, preset, t(`presets.${preset.id as ClassifierPresetId}.title`))); setProblem(null); }}
								className="rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
							>
								<span className="block text-sm font-medium">{t(`presets.${preset.id}.title`)}</span>
								<span className="mt-0.5 block text-xs text-muted-foreground">{t(`presets.${preset.id}.summary`)}</span>
							</button>
						))}
					</div>
				</section>
			) : null}

			<Section title={t("sections.details")}>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-1.5">
						<Label htmlFor="classifier-name">{t("fields.name")}</Label>
						<Input id="classifier-name" value={draft.name} maxLength={100} disabled={busy} placeholder={t("fields.namePlaceholder")} onChange={(event) => set("name", event.target.value)} />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="classifier-description">{t("fields.description")}</Label>
						<Input id="classifier-description" value={draft.description} maxLength={500} disabled={busy} onChange={(event) => set("description", event.target.value)} />
					</div>
				</div>
				<label className="flex items-start justify-between gap-4">
					<span><span className="block text-sm font-medium">{t("fields.enabled")}</span><span className="block text-xs text-muted-foreground">{t("fields.enabledDescription")}</span></span>
					<Switch checked={draft.enabled} disabled={busy} onCheckedChange={(enabled) => set("enabled", enabled)} />
				</label>
			</Section>

			<Section title={t("sections.model")} description={t("model.help")}>
				<GatewayModelCombobox
					value={draft.model}
					onChange={(model) => set("model", model)}
					options={models.options}
					filter={(option) => option.capabilities.some((capability) => CLASSIFIER_MODEL_CAPABILITIES.includes(capability))}
					ariaLabel={t("model.label")}
					loading={models.loading}
					error={models.error}
				/>
				{requestFormat ? <p className="text-xs text-muted-foreground">{t(`model.format.${requestFormat}`)}</p> : null}
			</Section>

			<Section title={t("sections.dimensions")}>
				<DimensionsEditor dimensions={draft.dimensions} disabled={busy} problem={location} onChange={(dimensions) => set("dimensions", dimensions)} />
			</Section>

			<Section title={t("sections.instructions")} description={t("instructions.help")}>
				<Textarea aria-label={t("sections.instructions")} value={draft.instructions} rows={3} maxLength={MAX_INSTRUCTIONS_LENGTH} disabled={busy} placeholder={t("instructions.placeholder")} onChange={(event) => set("instructions", event.target.value)} />
			</Section>

			<Section title={t("sections.sampling")}>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-1.5">
						<Label htmlFor="classifier-sample">{t("sampling.percent")}</Label>
						<div className="relative">
							<Input id="classifier-sample" inputMode="decimal" value={draft.samplePercent} disabled={busy} className="pr-8" aria-invalid={problem?.field === "samplePercent" || undefined} aria-describedby="classifier-sample-help" onChange={(event) => set("samplePercent", event.target.value)} />
							<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
						</div>
						<p id="classifier-sample-help" className={cn("text-xs", problem?.field === "samplePercent" ? "text-destructive" : "text-muted-foreground")}>{problem?.field === "samplePercent" ? t("errors.samplePercent") : t("sampling.percentHelp")}</p>
					</div>
					<div className="space-y-1.5">
						<Label>{t("sampling.sampleBy")}</Label>
						<ToggleGroup type="single" variant="outline" value={draft.sampleBy} disabled={busy} onValueChange={(value: string) => { if (value === "request" || value === "session") set("sampleBy", value); }} aria-label={t("sampling.sampleBy")}>
							<ToggleGroupItem value="request" className="rounded-md">{t("sampling.byRequest")}</ToggleGroupItem>
							<ToggleGroupItem value="session" className="rounded-md">{t("sampling.bySession")}</ToggleGroupItem>
						</ToggleGroup>
						<p className="text-xs text-muted-foreground">{draft.sampleBy === "session" ? t("sampling.bySessionHelp") : t("sampling.byRequestHelp")}</p>
					</div>
				</div>
				<label className="flex items-start justify-between gap-4">
					<span><span className="block text-sm font-medium">{t("sampling.includeResponse")}</span><span className="block text-xs text-muted-foreground">{t("sampling.includeResponseHelp")}</span></span>
					<Switch checked={draft.includeResponse} disabled={busy} onCheckedChange={(includeResponse) => set("includeResponse", includeResponse)} />
				</label>
			</Section>

			<Section title={t("sections.scope")} description={t("scope.help")}>
				<div className="grid gap-4 sm:grid-cols-3">
					<MultiSelect label={t("scope.keys")} emptyLabel={t("scope.allKeys")} options={keyOptions} selected={draft.keyIds} disabled={busy} onChange={(keyIds) => set("keyIds", keyIds)} />
					<MultiSelect label={t("scope.apps")} emptyLabel={t("scope.allApps")} options={appOptions} selected={draft.appIds} disabled={busy} onChange={(appIds) => set("appIds", appIds)} />
					<MultiSelect label={t("scope.models")} emptyLabel={t("scope.allModels")} options={modelScopeOptions} selected={draft.models} disabled={busy} onChange={(selected) => set("models", selected)} />
				</div>
			</Section>

			<Section title={t("sections.budget")} description={t("budget.help")}>
				<div className="max-w-xs space-y-1.5">
					<Label htmlFor="classifier-budget">{t("budget.label")}</Label>
					<div className="relative">
						<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
						<Input id="classifier-budget" inputMode="decimal" value={draft.budgetUsd} disabled={busy} className="pl-7" placeholder={t("budget.placeholder")} aria-invalid={problem?.field === "budgetUsd" || undefined} onChange={(event) => set("budgetUsd", event.target.value)} />
					</div>
					{problem?.field === "budgetUsd" ? <p className="text-xs text-destructive">{t("errors.budgetUsd")}</p> : null}
				</div>
				{classifier ? <p className="text-sm">{t("budget.spent", { spend: formatUsd(classifier.usage.costUsd), count: classifier.usage.classifications })}</p> : null}
			</Section>

			<Section title={t("sections.results")} description={t("resultsNote")}>
				{savedDimensions.length ? (
					<ul className="space-y-2 text-sm">
						{savedDimensions.map((dimension) => (
							<li key={dimension.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
								<span className="font-mono font-medium">{dimension.key}</span>
								<span className="text-muted-foreground">{t("results.viewValue")}</span>
								{allowedValues(dimension).map((value, index) => (
									<span key={value}>
										{index ? <span className="text-muted-foreground">, </span> : null}
										<Link href={logsHrefForLabel(dimension.key, value)} className="font-mono underline-offset-4 hover:underline">{value}</Link>
									</span>
								))}
							</li>
						))}
						{classifier ? (
							<li className="pt-2 text-muted-foreground">
								<Link href={logsHrefForLabel(CLASSIFIER_LABEL_KEY, classifier.id)} className="underline underline-offset-4">{t("results.classifierRequests")}</Link>
							</li>
						) : null}
					</ul>
				) : <p className="text-sm text-muted-foreground">{t("results.afterSave")}</p>}
			</Section>

			<Section title={t("sections.test")}>
				<ClassifierTestPanel classifierId={classifier?.id ?? null} buildRequest={testRequest} includeResponse={draft.includeResponse} />
			</Section>

			<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
				<div className="flex flex-wrap items-center gap-2">
					<Button type="button" onClick={save} disabled={busy}>{saving ? t("actions.saving") : classifier ? t("actions.save") : t("actions.create")}</Button>
					<Button type="button" variant="ghost" asChild><Link href="/settings/classifiers">{t("actions.cancel")}</Link></Button>
				</div>
				{classifier ? (
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy}><Trash2 className="size-4" />{t("actions.delete")}</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>{t("actions.deleteTitle", { name: classifier.name })}</AlertDialogTitle>
								<AlertDialogDescription>{t("actions.deleteBody")}</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
								<AlertDialogAction onClick={remove} className="bg-destructive text-white hover:bg-destructive/90">{t("actions.deleteConfirm")}</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				) : null}
			</div>
			{problem?.field === "api" ? <p role="alert" className="text-sm text-destructive">{t("errors.invalid", { message: problem.message })}</p> : null}
		</div>
	);
}
