"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { INCLUDED_ANSWERS_PER_PERSON } from "@/lib/slack-agent/pricing";
import { startSlackInstall, uninstallSlackAgent, updateSlackAgent } from "@/app/(dashboard)/settings/slack/actions";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { AccessField, Choice, FieldProblem, LimitsFields, ModelChoiceFields, ModelField, Notice, Section, SlackError } from "./SlackAgentFields";
import { SlackCustomAppSection } from "./SlackCustomAppSection";
import { SlackMemorySection } from "./SlackMemorySection";
import { SlackSchedulesSection } from "./SlackSchedulesSection";
import {
	MAX_INSTRUCTIONS_CHARS,
	callbackNotice,
	chargeMonth,
	formatUsd,
	installDraftDefaults,
	installPayload,
	settingsDraftFrom,
	settingsPatch,
	slackErrorKey,
	type SlackAgentInstallation,
	type SlackAgentManagerView,
	type SlackAgentMemberView,
	type SlackAgentView,
	type SlackDraftProblem,
	type SlackErrorKey,
	type SlackInstallDraft,
	type SlackSettingsDraft,
	type SlackUsageDataMode,
} from "./slackAgentForm";

type ActionError = { key: SlackErrorKey; message?: string | null };

const CALLBACK_PARAMS = ["installed", "error", "workspaceId"];

export default function SlackAgentSettingsClient({ view }: { view: SlackAgentView }) {
	const t = useTranslations("SettingsUI.slack");
	const params = useSearchParams();
	// The OAuth callback lands here with ?installed=1 or ?error=<code>: show it once.
	const [notice] = useState(() => callbackNotice(params));
	useEffect(() => {
		if (!notice) return;
		const url = new URL(window.location.href);
		for (const name of CALLBACK_PARAMS) url.searchParams.delete(name);
		window.history.replaceState(window.history.state, "", url);
	}, [notice]);
	const team = view.installation?.team_name || t("teamFallback");

	return (
		<div className="space-y-6">
			{notice?.kind === "installed" ? <Notice tone="success" role="status">{t("notices.installed", { team })}</Notice> : null}
			{notice?.kind === "error" ? <SlackError error={{ key: notice.key }} /> : null}
			{!view.canManage ? <MemberView view={view} />
				: view.installation ? <InstalledView key={view.installation.id} view={view} installation={view.installation} />
				: !view.configured.hosted_app && !view.configured.custom_app ? <Notice>{t("notAvailable")}</Notice>
				: <InstallView view={view} />}
		</div>
	);
}

function MemberView({ view }: { view: SlackAgentMemberView }) {
	const t = useTranslations("SettingsUI.slack");
	return (
		<div className="space-y-2 text-sm">
			<p className="font-medium">{view.installation ? t("member.installed", { team: view.installation.team_name || t("teamFallback") }) : t("member.notInstalled")}</p>
			<p className="text-muted-foreground">{t("member.askAdmin")}</p>
			{view.installation ? <p className="text-muted-foreground">{t("member.linkHint")}</p> : null}
		</div>
	);
}

function InstallView({ view }: { view: SlackAgentManagerView }) {
	const t = useTranslations("SettingsUI.slack");
	const hosted = view.configured.hosted_app;
	const customApp = view.configured.custom_app ? view.custom_app : null;
	const [draft, setDraft] = useState<SlackInstallDraft>(() => installDraftDefaults(!hosted && Boolean(customApp), view.auto_routing === true));
	const [problem, setProblem] = useState<SlackDraftProblem | null>(null);
	const [error, setError] = useState<ActionError | null>(null);
	const [pending, startInstall] = useTransition();
	const [redirecting, setRedirecting] = useState(false);
	const busy = pending || redirecting;
	// Without the hosted app, only a saved company app can be installed.
	const useCustomApp = customApp ? draft.useCustomApp || !hosted : false;
	const canInstall = hosted || Boolean(customApp);
	const set = <K extends keyof SlackInstallDraft>(field: K, value: SlackInstallDraft[K]) => {
		setDraft((current) => ({ ...current, [field]: value }));
		setProblem(null);
		setError(null);
	};

	function install() {
		const built = installPayload({ ...draft, useCustomApp }, customApp?.id ?? null);
		if (!built.ok) {
			setProblem(built.problem);
			return;
		}
		startInstall(async () => {
			const result = await startSlackInstall(built.value);
			if (!result.ok) {
				setError({ key: slackErrorKey(result.code, result.status), message: result.message });
				return;
			}
			setRedirecting(true);
			window.location.assign(result.url);
		});
	}

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-base font-semibold">{t("install.title")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("install.description")}</p>
			</div>
			{!hosted ? <Notice>{customApp ? t("install.customAppOnly", { appId: customApp.slack_app_id }) : t("install.hostedUnavailable")}</Notice> : null}

			<Section title={t("sections.agent")}>
				<ModelField value={draft.model} autoAvailable={view.auto_routing === true} disabled={busy} problem={problem} onChange={(model) => set("model", model)} />
			</Section>
			<Section title={t("sections.access")}>
				<AccessField value={draft.accessMode} disabled={busy} onChange={(mode) => set("accessMode", mode)} />
			</Section>
			<Section title={t("sections.limits")}>
				<LimitsFields draft={draft} disabled={busy} problem={problem} set={set} />
			</Section>

			<div className="space-y-4 border-t pt-6">
				{hosted && customApp ? (
					<div className="space-y-2">
						<Label>{t("install.appChoice")}</Label>
						<Choice
							label={t("install.appChoice")}
							value={useCustomApp ? "custom" : "hosted"}
							disabled={busy}
							options={[{ value: "hosted", label: t("install.hostedApp") }, { value: "custom", label: t("install.customApp", { appId: customApp.slack_app_id }) }]}
							onChange={(choice) => set("useCustomApp", choice === "custom")}
						/>
					</div>
				) : null}
				{problem ? <p className="text-sm text-destructive">{t("fixFirst")}</p> : null}
				{error ? <SlackError error={error} /> : null}
				<Button type="button" onClick={install} disabled={busy || !canInstall}>{busy ? t("install.redirecting") : t("install.submit")}</Button>
			</div>

			<SlackCustomAppSection view={view} />
		</div>
	);
}

function statusTone(status: string): "outline" | "secondary" | "destructive" {
	return status === "active" ? "outline" : status === "payment_due" ? "destructive" : "secondary";
}

function InstalledView({ view, installation }: { view: SlackAgentManagerView; installation: SlackAgentInstallation }) {
	const t = useTranslations("SettingsUI.slack");
	const locale = useLocale();
	const write = useSettingsWrite();
	const [saved, setSaved] = useState<SlackSettingsDraft>(() => settingsDraftFrom(installation.settings));
	const [draft, setDraft] = useState<SlackSettingsDraft>(saved);
	const [status, setStatus] = useState(installation.status);
	const [plan, setPlan] = useState(installation.plan);
	const [problem, setProblem] = useState<SlackDraftProblem | null>(null);
	const [error, setError] = useState<ActionError | null>(null);
	const [saving, startSaving] = useTransition();
	const [changingStatus, startStatusChange] = useTransition();
	const [uninstalling, startUninstall] = useTransition();
	const busy = saving || changingStatus || uninstalling;
	const team = installation.team_name || t("teamFallback");
	const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
	const set = <K extends keyof SlackSettingsDraft>(field: K, value: SlackSettingsDraft[K]) => {
		setDraft((current) => ({ ...current, [field]: value }));
		setProblem(null);
		setError(null);
	};
	const failed = (result: { code: string | null; status: number | null; message: string | null }) => setError({ key: slackErrorKey(result.code, result.status), message: result.message });

	function save() {
		const built = settingsPatch(draft, saved);
		if (!built.ok) {
			setProblem(built.problem);
			return;
		}
		if (!Object.keys(built.value).length) {
			setSaved(draft);
			return;
		}
		startSaving(async () => {
			const result = await write(updateSlackAgent(built.value));
			if (!result.ok) return failed(result);
			const next = settingsDraftFrom(result.installation.settings);
			setSaved(next);
			setDraft(next);
			setPlan(result.installation.plan);
			toast.success(t("installed.saved"));
		});
	}

	function changeStatus(next: "active" | "paused") {
		startStatusChange(async () => {
			const result = await write(updateSlackAgent({ status: next }));
			if (!result.ok) return failed(result);
			setStatus(result.installation.status);
			toast.success(next === "paused" ? t("installed.pausedToast") : t("installed.resumedToast"));
		});
	}

	function uninstall() {
		startUninstall(async () => {
			const result = await write(uninstallSlackAgent());
			if (!result.ok) return failed(result);
			if (result.slackUninstalled) toast.success(t("uninstall.done"));
			else toast.warning(t("uninstall.slackNotConfirmed"));
		});
	}

	const month = installation.month;
	const number = (value: number) => value.toLocaleString(locale);
	// Null or missing when web-api couldn't read it: say so rather than show $0.00.
	const modelSpend = (value: number | null | undefined) => (typeof value === "number" ? formatUsd(value) : t("month.modelSpendUnavailable"));
	const statusLabel = status === "active" || status === "paused" || status === "payment_due" ? t(`status.${status}`) : status;

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-base font-semibold">{t("installed.team", { team })}</h2>
						<Badge variant={statusTone(status)}>{statusLabel}</Badge>
					</div>
					<p className="text-xs text-muted-foreground">
						{t("installed.since", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(installation.installed_at)) })}
						{installation.uses_custom_app ? <> · {t("installed.customApp")}</> : null}
					</p>
				</div>
				{status === "active" ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => changeStatus("paused")}>{t("installed.pause")}</Button> : null}
				{status === "paused" ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => changeStatus("active")}>{t("installed.resume")}</Button> : null}
			</div>
			{status === "payment_due" ? <SlackError error={{ key: "paymentDue" }} /> : null}
			{status === "paused" ? <Notice>{t("installed.pausedNote")}</Notice> : null}

			<Section title={t("sections.month")} description={month ? t("month.note", { date: chargeMonth(month.period_start, locale) }) : undefined}>
				<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<Stat label={t("month.people")} value={number(month?.people ?? 0)} detail={t("month.peopleDetail")} />
					<Stat label={t("month.answers")} value={number(month?.answers ?? 0)} detail={t("month.included", { count: number((month?.people ?? 0) * INCLUDED_ANSWERS_PER_PERSON) })} />
					<Stat label={t("month.plan")} value={t("month.planValue", { people: number(plan.people) })} detail={t("month.planPrice", { price: formatUsd(plan.price_usd) })} />
					<Stat label={t("month.estimate")} value={formatUsd(month?.estimated_charge_usd ?? 0)} detail={t("month.cap", { cap: formatUsd(installation.settings.monthly_cap_usd) })} />
					<Stat label={t("month.modelSpend")} value={modelSpend(month?.model_spend_usd)} detail={t("month.modelSpendDetail")} />
				</dl>
			</Section>

			<Section title={t("sections.agent")}>
				<ModelField value={draft.model} autoAvailable={view.auto_routing === true} disabled={busy} problem={problem} onChange={(model) => set("model", model)} />
				<div className="space-y-1.5">
					<Label htmlFor="slack-instructions">{t("instructions.label")}</Label>
					<Textarea id="slack-instructions" value={draft.instructions} rows={4} maxLength={MAX_INSTRUCTIONS_CHARS} disabled={busy} placeholder={t("instructions.placeholder")} aria-invalid={problem?.field === "instructions" || undefined} aria-describedby="slack-instructions-help" onChange={(event) => set("instructions", event.target.value)} />
					<FieldProblem id="slack-instructions-help" problem={problem} field="instructions" help={t("instructions.help")} />
				</div>
			</Section>

			<Section title={t("sections.modelChoice")} description={t("modelChoice.description")}>
				<ModelChoiceFields
					enabled={draft.modelChoiceEnabled}
					models={draft.allowedModels}
					autoAvailable={view.auto_routing === true}
					disabled={busy}
					problem={problem}
					onEnabledChange={(enabled) => set("modelChoiceEnabled", enabled)}
					onModelsChange={(models) => set("allowedModels", models)}
				/>
			</Section>

			<Section title={t("sections.access")}>
				<AccessField value={draft.accessMode} disabled={busy} onChange={(mode) => set("accessMode", mode)} />
			</Section>

			<Section title={t("sections.usageData")} description={t("usageData.help")}>
				<div className="space-y-2">
					<Choice<SlackUsageDataMode>
						label={t("sections.usageData")}
						value={draft.usageDataMode}
						disabled={busy}
						options={[{ value: "off", label: t("usageData.off") }, { value: "dm", label: t("usageData.dm") }, { value: "dm_and_channels", label: t("usageData.dmAndChannels") }]}
						onChange={(mode) => set("usageDataMode", mode)}
					/>
					<p className="text-xs text-muted-foreground">{t(`usageData.${draft.usageDataMode === "dm_and_channels" ? "dmAndChannelsHelp" : draft.usageDataMode === "dm" ? "dmHelp" : "offHelp"}`)}</p>
				</div>
				{draft.usageDataMode === "dm_and_channels" ? (
					<div className="max-w-xl space-y-1.5">
						<Label htmlFor="slack-channels">{t("usageData.channels")}</Label>
						<Input id="slack-channels" value={draft.channelIds} disabled={busy} spellCheck={false} placeholder="C0123ABCD, C0456EFGH" aria-invalid={problem?.field === "channelIds" || undefined} aria-describedby="slack-channels-help" onChange={(event) => set("channelIds", event.target.value)} />
						<FieldProblem id="slack-channels-help" problem={problem} field="channelIds" help={t("usageData.channelsHelp")} />
					</div>
				) : null}
			</Section>

			<Section title={t("sections.limits")}>
				<LimitsFields draft={draft} disabled={busy} problem={problem} set={set} />
			</Section>

			<div className="space-y-3 border-t pt-6">
				{problem ? <p className="text-sm text-destructive">{t("fixFirst")}</p> : null}
				{error ? <SlackError error={error} /> : null}
				<div className="flex flex-wrap items-center gap-2">
					<Button type="button" onClick={save} disabled={busy || !dirty}>{saving ? t("saving") : t("installed.save")}</Button>
					{dirty ? <Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft(saved); setProblem(null); setError(null); }}>{t("installed.discard")}</Button> : null}
				</div>
			</div>

			<Section title={t("sections.charges")}>
				{view.charges.length ? (
					<div className="overflow-x-auto rounded-md border">
						<Table className="text-sm">
							<TableHeader>
								<TableRow>
									<TableHead>{t("charges.month")}</TableHead>
									<TableHead className="text-right">{t("charges.people")}</TableHead>
									<TableHead className="text-right">{t("charges.answers")}</TableHead>
									<TableHead className="text-right">{t("charges.amount")}</TableHead>
									<TableHead className="text-right">{t("charges.modelSpend")}</TableHead>
									<TableHead>{t("charges.status")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{view.charges.map((charge) => (
									<TableRow key={charge.period_start}>
										<TableCell>{chargeMonth(charge.period_start, locale)}</TableCell>
										<TableCell className="text-right tabular-nums">{number(charge.people)}</TableCell>
										<TableCell className="text-right tabular-nums">{number(charge.answers)}</TableCell>
										<TableCell className="text-right tabular-nums">{formatUsd(charge.amount_usd)}</TableCell>
										<TableCell className="text-right tabular-nums">{modelSpend(charge.model_spend_usd)}</TableCell>
										<TableCell>{charge.status === "charged" ? t("charges.charged") : t("charges.pending")}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				) : <p className="text-sm text-muted-foreground">{t("charges.empty")}</p>}
				<p className="text-xs text-muted-foreground">
					{view.charges.length ? <>{t("charges.modelSpendNote")} </> : null}{t("charges.note")} <Link href="/settings/credits/transactions" className="underline underline-offset-4">{t("charges.transactions")}</Link>
				</p>
			</Section>

			<SlackMemorySection memoryEnabled={installation.settings.memory_enabled !== false} />

			<SlackSchedulesSection settings={installation.settings} />

			<SlackCustomAppSection view={view} />

			<Section title={t("sections.uninstall")} description={t("uninstall.description")}>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button type="button" variant="outline" className="w-fit text-destructive hover:text-destructive" disabled={busy}>{uninstalling ? t("uninstall.working") : t("uninstall.button")}</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t("uninstall.title", { team })}</AlertDialogTitle>
							<AlertDialogDescription>{t("uninstall.confirmDescription")}</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
							<AlertDialogAction onClick={uninstall}>{t("uninstall.button")}</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</Section>
		</div>
	);
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
	return (
		<div className="rounded-md border px-4 py-3">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
			<dd className="text-xs text-muted-foreground">{detail}</dd>
		</div>
	);
}
