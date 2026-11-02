"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { FileCode2, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	createErrorProject,
	createIntakeForm,
	deleteErrorProject,
	deleteGithubRepo,
	deleteIntakeForm,
	getGithubWorkflow,
	linkGithubRepo,
	saveMyWorkSettings,
	saveWorkSettings,
	updateErrorProject,
	updateGithubRepo,
	updateIntakeForm,
} from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { normaliseGithubRepo } from "@/lib/work/format";
import { errorFetchExample, errorScriptTag, intakeCurlExample, intakeFormHtml } from "@/lib/work/snippets";
import { DEFAULT_WORK_SETTINGS, type ErrorProject, type GithubRepo, type IntakeForm, type WorkMemberSettingsResponse, type WorkSettings } from "@/lib/work/types";
import { useWorkAction } from "./useWorkAction";
import { CopyBlock, PriorityIcon, TimeAgo, useRelativeTime, useWorkCopy } from "./WorkBits";

export function WorkSettingsView({ forms, projects, repos, settings = null, canEditSettings = true, mine = null }: { forms: IntakeForm[]; projects: ErrorProject[]; repos: GithubRepo[]; settings?: WorkSettings | null; canEditSettings?: boolean; mine?: WorkMemberSettingsResponse | null }) {
	const t = useTranslations("Work.settings");
	return (
		<div className="space-y-10">
			<div className="space-y-1">
				<h2 className="text-base font-semibold">{t("title")}</h2>
				<p className="text-sm text-muted-foreground">{t("description")}</p>
			</div>
			{mine ? <MyEmailSection mine={mine} /> : null}
			<TrackerSection settings={settings ?? DEFAULT_WORK_SETTINGS} canEdit={canEditSettings} />
			<IntakeFormsSection forms={forms} />
			<ErrorProjectsSection projects={projects} />
			<GithubReposSection repos={repos} />
		</div>
	);
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
	return (
		<section aria-labelledby={id} className="space-y-3">
			<div className="space-y-0.5 border-b pb-2">
				<h3 id={id} className="text-sm font-semibold">{title}</h3>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			{children}
		</section>
	);
}

/** A secret shown once, with its setup snippets, until the reader closes it. */
function Revealed({ onClose, children }: { onClose: () => void; children: ReactNode }) {
	const t = useTranslations("Work.settings");
	const tCommon = useTranslations("Work.common");
	return (
		<div className="space-y-3 rounded-md border p-4">
			<div className="flex items-start justify-between gap-3">
				<Callout tone="warning" role="status" className="flex-1">{t("secretOnce")}</Callout>
				<Button type="button" variant="ghost" size="icon-sm" aria-label={tCommon("cancel")} onClick={onClose}><X aria-hidden="true" /></Button>
			</div>
			{children}
		</div>
	);
}

function ToggleCell({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
	return (
		<label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
			<Switch size="sm" checked={checked} disabled={disabled} onCheckedChange={(next) => onChange(Boolean(next))} />
			{label}
		</label>
	);
}

function DeleteButton({ name, disabled, onDelete }: { name: string; disabled: boolean; onDelete: () => void }) {
	const tCommon = useTranslations("Work.common");
	return (
		<Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={`${tCommon("delete")}: ${name}`} onClick={() => { if (window.confirm(tCommon("confirmDelete", { name }))) onDelete(); }}>
			<Trash2 aria-hidden="true" />
		</Button>
	);
}

function Empty({ children }: { children: ReactNode }) {
	return <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function IntakeFormsSection({ forms }: { forms: IntakeForm[] }) {
	const t = useTranslations("Work.settings");
	const relative = useRelativeTime();
	const tCommon = useTranslations("Work.common");
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [name, setName] = useState("");
	const [autoTriage, setAutoTriage] = useState(true);
	const [revealed, setRevealed] = useState<string | null>(null);
	const create = async (event: FormEvent) => {
		event.preventDefault();
		if (!name.trim()) return;
		const result = await perform("create", () => createIntakeForm({ name: name.trim(), autoTriage }));
		if (result.ok) { setRevealed(result.token); setName(""); }
	};
	return (
		<Section id="work-intake-forms" title={t("intake.title")} description={t("intake.description")}>
			{revealed ? (
				<Revealed onClose={() => setRevealed(null)}>
					<CopyBlock label={t("intake.token")} value={revealed} />
					<CopyBlock label={t("intake.html")} value={intakeFormHtml(revealed)} multiline />
					<CopyBlock label={t("intake.curl")} value={intakeCurlExample(revealed)} multiline />
				</Revealed>
			) : null}
			{forms.length ? (
				<ul className="divide-y rounded-md border">
					{forms.map((form) => (
						<li key={form.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium">{form.name}</p>
								<p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
									<span className="font-mono">{form.tokenPrefix}…</span>
									<span>{form.lastUsedAt ? t("lastUsed", { time: relative(form.lastUsedAt) }) : t("neverUsed")}</span>
								</p>
							</div>
							<ToggleCell label={tCommon("enabled")} checked={form.enabled} disabled={busy !== null} onChange={(enabled) => perform("enabled", () => updateIntakeForm(form.id, { enabled }))} />
							<ToggleCell label={tCommon("autoTriage")} checked={form.autoTriage} disabled={busy !== null} onChange={(value) => perform("auto", () => updateIntakeForm(form.id, { autoTriage: value }))} />
							<DeleteButton name={form.name} disabled={busy !== null} onDelete={() => perform("delete", () => deleteIntakeForm(form.id))} />
						</li>
					))}
				</ul>
			) : <Empty>{t("intake.empty")}</Empty>}
			<form onSubmit={create} className="flex flex-wrap items-end gap-3">
				<div className="min-w-56 flex-1 space-y-1.5 sm:max-w-xs">
					<Label htmlFor={`${id}-name`}>{t("intake.name")}</Label>
					<Input id={`${id}-name`} value={name} maxLength={120} placeholder={t("intake.namePlaceholder")} onChange={(event) => setName(event.target.value)} className="rounded-md" />
				</div>
				<ToggleCell label={tCommon("autoTriage")} checked={autoTriage} disabled={busy !== null} onChange={setAutoTriage} />
				<Button type="submit" size="sm" disabled={busy !== null || !name.trim()}>{t("intake.create")}</Button>
			</form>
		</Section>
	);
}

function RepoInput({ value, label, onSave }: { value: string; label: string; onSave: (repo: string | null) => void }) {
	const tCreate = useTranslations("Work.create");
	const [draft, setDraft] = useState(value);
	const [invalid, setInvalid] = useState(false);
	return (
		<Input
			value={draft}
			aria-label={label}
			aria-invalid={invalid || undefined}
			title={invalid ? tCreate("repoInvalid") : label}
			placeholder={tCreate("repoPlaceholder")}
			onChange={(event) => { setDraft(event.target.value); setInvalid(false); }}
			onBlur={() => {
				const next = draft.trim();
				if (next === value) return;
				if (!next) return onSave(null);
				const repo = normaliseGithubRepo(next);
				if (!repo) return setInvalid(true);
				onSave(repo);
			}}
			onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
			className="h-7 w-44 rounded-md font-mono text-xs"
		/>
	);
}

function ErrorProjectsSection({ projects }: { projects: ErrorProject[] }) {
	const t = useTranslations("Work.settings");
	const relative = useRelativeTime();
	const tCommon = useTranslations("Work.common");
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [name, setName] = useState("");
	const [autoTriage, setAutoTriage] = useState(true);
	const [revealed, setRevealed] = useState<string | null>(null);
	const create = async (event: FormEvent) => {
		event.preventDefault();
		if (!name.trim()) return;
		const result = await perform("create", () => createErrorProject({ name: name.trim(), autoTriage }));
		if (result.ok) { setRevealed(result.key); setName(""); }
	};
	return (
		<Section id="work-error-projects" title={t("projects.title")} description={t("projects.description")}>
			{revealed ? (
				<Revealed onClose={() => setRevealed(null)}>
					<CopyBlock label={t("projects.key")} value={revealed} />
					<CopyBlock label={t("projects.script")} value={errorScriptTag(revealed)} multiline />
					<CopyBlock label={t("projects.fetch")} value={errorFetchExample(revealed)} multiline />
				</Revealed>
			) : null}
			{projects.length ? (
				<ul className="divide-y rounded-md border">
					{projects.map((project) => (
						<li key={project.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium">{project.name}</p>
								<p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
									<span className="font-mono">{project.keyPrefix}…</span>
									<span>{project.lastEventAt ? t("projects.lastEvent", { time: relative(project.lastEventAt) }) : t("neverUsed")}</span>
								</p>
							</div>
							<RepoInput key={project.githubRepo ?? ""} value={project.githubRepo ?? ""} label={t("projects.githubRepo")} onSave={(githubRepo) => perform("repo", () => updateErrorProject(project.id, { githubRepo }))} />
							<ToggleCell label={tCommon("enabled")} checked={project.enabled} disabled={busy !== null} onChange={(enabled) => perform("enabled", () => updateErrorProject(project.id, { enabled }))} />
							<ToggleCell label={tCommon("autoTriage")} checked={project.autoTriage} disabled={busy !== null} onChange={(value) => perform("auto", () => updateErrorProject(project.id, { autoTriage: value }))} />
							<DeleteButton name={project.name} disabled={busy !== null} onDelete={() => perform("delete", () => deleteErrorProject(project.id))} />
						</li>
					))}
				</ul>
			) : <Empty>{t("projects.empty")}</Empty>}
			<form onSubmit={create} className="flex flex-wrap items-end gap-3">
				<div className="min-w-56 flex-1 space-y-1.5 sm:max-w-xs">
					<Label htmlFor={`${id}-name`}>{t("projects.name")}</Label>
					<Input id={`${id}-name`} value={name} maxLength={120} placeholder={t("projects.namePlaceholder")} onChange={(event) => setName(event.target.value)} className="rounded-md" />
				</div>
				<ToggleCell label={tCommon("autoTriage")} checked={autoTriage} disabled={busy !== null} onChange={setAutoTriage} />
				<Button type="submit" size="sm" disabled={busy !== null || !name.trim()}>{t("projects.create")}</Button>
			</form>
		</Section>
	);
}

function SetupSteps() {
	const t = useTranslations("Work.settings.github");
	return (
		<div className="space-y-1.5">
			<p className="text-xs font-medium text-muted-foreground">{t("stepsTitle")}</p>
			<ol className="list-decimal space-y-1 pl-5 text-sm">
				<li>{t("stepSecretToken")}</li>
				<li>{t("stepSecretKey")}</li>
				<li>{t("stepSecretPrToken")}</li>
				<li>{t("stepCommit")}</li>
			</ol>
		</div>
	);
}

function GithubRepoRow({ repo }: { repo: GithubRepo }) {
	const t = useTranslations("Work.settings.github");
	const { perform, busy } = useWorkAction();
	const [workflow, setWorkflow] = useState<string | null>(null);
	const toggleWorkflow = async () => {
		if (workflow !== null) return setWorkflow(null);
		const result = await perform("workflow", () => getGithubWorkflow(repo.id), { refresh: false });
		if (result.ok) setWorkflow(result.workflow);
	};
	return (
		<li className="space-y-3 px-3 py-2.5">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
				<div className="min-w-0 flex-1">
					<a href={`https://github.com/${repo.repo}`} target="_blank" rel="noreferrer" className="truncate font-mono text-sm font-medium hover:underline">{repo.repo}</a>
					<p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
						<span className="font-mono">{repo.bridgeTokenPrefix}…</span>
						<span>{repo.hasGithubToken ? t("tokenStored") : t("noToken")}</span>
						{repo.lastEventAt ? <TimeAgo value={repo.lastEventAt} /> : null}
					</p>
				</div>
				<ToggleCell label={t("syncIssues")} checked={repo.syncIssues} disabled={busy !== null} onChange={(syncIssues) => perform("sync", () => updateGithubRepo(repo.id, { syncIssues }))} />
				<Button type="button" size="xs" variant="outline" disabled={busy !== null} onClick={toggleWorkflow}><FileCode2 aria-hidden="true" />{workflow === null ? t("showWorkflow") : t("hideWorkflow")}</Button>
				<DeleteButton name={repo.repo} disabled={busy !== null} onDelete={() => perform("delete", () => deleteGithubRepo(repo.id))} />
			</div>
			{workflow !== null ? (
				<div className="space-y-3">
					<CopyBlock label={t("workflow")} value={workflow} multiline />
					<SetupSteps />
				</div>
			) : null}
		</li>
	);
}

function GithubReposSection({ repos }: { repos: GithubRepo[] }) {
	const t = useTranslations("Work.settings.github");
	const tCreate = useTranslations("Work.create");
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [repo, setRepo] = useState("");
	const [token, setToken] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [revealed, setRevealed] = useState<{ bridgeToken: string; workflow: string } | null>(null);
	const create = async (event: FormEvent) => {
		event.preventDefault();
		const name = normaliseGithubRepo(repo);
		if (!name) return setError(tCreate("repoInvalid"));
		setError(null);
		const result = await perform("create", () => linkGithubRepo({ repo: name, githubToken: token.trim() || undefined }));
		if (result.ok) {
			setRevealed({ bridgeToken: result.bridgeToken, workflow: result.workflow });
			setRepo("");
			setToken("");
		}
	};
	return (
		<Section id="work-github-repos" title={t("title")} description={t("description")}>
			{revealed ? (
				<Revealed onClose={() => setRevealed(null)}>
					<CopyBlock label={t("bridgeToken")} value={revealed.bridgeToken} />
					<SetupSteps />
					<CopyBlock label={t("workflow")} value={revealed.workflow} multiline />
				</Revealed>
			) : null}
			{repos.length ? <ul className="divide-y rounded-md border">{repos.map((entry) => <GithubRepoRow key={entry.id} repo={entry} />)}</ul> : <Empty>{t("empty")}</Empty>}
			<form onSubmit={create} className="space-y-3">
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-repo`}>{t("repo")}</Label>
						<Input id={`${id}-repo`} value={repo} placeholder={tCreate("repoPlaceholder")} onChange={(event) => setRepo(event.target.value)} className="rounded-md font-mono" />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-token`}>{t("token")}</Label>
						<Input id={`${id}-token`} type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} className="rounded-md font-mono" />
					</div>
				</div>
				<p className="text-xs text-muted-foreground">{t("tokenHint")}</p>
				{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
				<Button type="submit" size="sm" disabled={busy !== null || !repo.trim()}>{t("link")}</Button>
			</form>
		</Section>
	);
}

/** The reader's own email digest of their work notifications. Saved as soon as it is switched. */
function MyEmailSection({ mine }: { mine: WorkMemberSettingsResponse }) {
	const t = useTranslations("Work.settings.mine");
	const { perform, busy } = useWorkAction();
	const [on, setOn] = useState(mine.settings.emailNotifications !== "off");
	const toggle = async (checked: boolean) => {
		const previous = on;
		setOn(checked);
		const result = await perform("mine", () => saveMyWorkSettings({ emailNotifications: checked ? "digest" : "off" }), { refresh: false });
		if (!result.ok) setOn(previous);
	};
	return (
		<Section id="work-my-settings" title={t("title")} description={t("description")}>
			<label className="flex items-start gap-3 text-sm">
				<Switch className="mt-0.5" disabled={busy === "mine"} checked={on} onCheckedChange={(checked) => void toggle(Boolean(checked))} />
				<span className="space-y-0.5">
					<span className="block font-medium">{t("emailDigest")}</span>
					<span className="block text-xs text-muted-foreground">{mine.emailAvailable ? t("emailDigestHint") : t("emailUnavailable")}</span>
				</span>
			</label>
		</Section>
	);
}

const SLA_PRIORITIES = ["1", "2", "3", "4"] as const;

/** SLA hours per priority, stall days, ambient follow-ups and support drafts. Owners and admins can save. */
function TrackerSection({ settings, canEdit }: { settings: WorkSettings; canEdit: boolean }) {
	const t = useTranslations("Work.settings.tracker");
	const tCommon = useTranslations("Work.common");
	const copy = useWorkCopy();
	const { perform, busy } = useWorkAction();
	const id = useId();
	const initial = () => ({
		slaHours: Object.fromEntries(SLA_PRIORITIES.map((key) => [key, String(settings.slaHours?.[key] ?? DEFAULT_WORK_SETTINGS.slaHours[key])])) as Record<(typeof SLA_PRIORITIES)[number], string>,
		stallDays: String(settings.stallDays ?? DEFAULT_WORK_SETTINGS.stallDays),
		ambientEnabled: settings.ambientEnabled ?? false,
		supportDraftsEnabled: settings.supportDraftsEnabled ?? true,
	});
	const [draft, setDraft] = useState(initial);
	const [seen, setSeen] = useState(settings);
	if (seen !== settings) { setSeen(settings); setDraft(initial()); }
	const [error, setError] = useState<string | null>(null);

	const save = async (event: FormEvent) => {
		event.preventDefault();
		const slaHours = {} as WorkSettings["slaHours"];
		for (const key of SLA_PRIORITIES) {
			const hours = Number(draft.slaHours[key]);
			if (!Number.isInteger(hours) || hours < 1 || hours > 2160) return setError(t("slaInvalid"));
			slaHours[key] = hours;
		}
		const stallDays = Number(draft.stallDays);
		if (!Number.isInteger(stallDays) || stallDays < 1 || stallDays > 90) return setError(t("stallInvalid"));
		setError(null);
		await perform("tracker", () => saveWorkSettings({ slaHours, stallDays, ambientEnabled: draft.ambientEnabled, supportDraftsEnabled: draft.supportDraftsEnabled }));
	};

	return (
		<Section id="work-tracker-settings" title={t("title")} description={t("description")}>
			<form onSubmit={save} className="space-y-5">
				{canEdit ? null : <Callout tone="info">{t("readOnly")}</Callout>}
				<fieldset disabled={!canEdit} className="space-y-5">
				<fieldset className="space-y-2">
					<legend className="text-sm font-medium">{t("slaTitle")}</legend>
					<p className="text-xs text-muted-foreground">{t("slaHint")}</p>
					<div className="grid gap-3 sm:grid-cols-4">
						{SLA_PRIORITIES.map((key) => (
							<div key={key} className="space-y-1.5">
								<Label htmlFor={`${id}-sla-${key}`} className="flex items-center gap-1.5"><PriorityIcon priority={Number(key)} />{copy.priority(Number(key))}</Label>
								<div className="flex items-center gap-2">
									<Input id={`${id}-sla-${key}`} type="number" min={1} max={2160} inputMode="numeric" value={draft.slaHours[key]} onChange={(event) => setDraft({ ...draft, slaHours: { ...draft.slaHours, [key]: event.target.value } })} className="h-8 w-24 rounded-md tabular-nums" />
									<span className="text-xs text-muted-foreground">{t("hours")}</span>
								</div>
							</div>
						))}
					</div>
				</fieldset>
				<div className="space-y-1.5">
					<Label htmlFor={`${id}-stall`}>{t("stallDays")}</Label>
					<div className="flex items-center gap-2">
						<Input id={`${id}-stall`} type="number" min={1} max={90} inputMode="numeric" value={draft.stallDays} onChange={(event) => setDraft({ ...draft, stallDays: event.target.value })} className="h-8 w-24 rounded-md tabular-nums" />
						<span className="text-xs text-muted-foreground">{t("days")}</span>
					</div>
					<p className="text-xs text-muted-foreground">{t("stallHint")}</p>
				</div>
				<div className="space-y-2">
					<label className="flex items-start gap-3 text-sm">
						<Switch className="mt-0.5" disabled={!canEdit} checked={draft.ambientEnabled} onCheckedChange={(checked) => setDraft({ ...draft, ambientEnabled: Boolean(checked) })} />
						<span className="space-y-0.5">
							<span className="block font-medium">{t("ambient")}</span>
							<span className="block text-xs text-muted-foreground">{t("ambientHint")}</span>
						</span>
					</label>
					{draft.ambientEnabled ? <Callout tone="warning">{t("ambientExperimental")}</Callout> : null}
				</div>
				<label className="flex items-start gap-3 text-sm">
					<Switch className="mt-0.5" disabled={!canEdit} checked={draft.supportDraftsEnabled} onCheckedChange={(checked) => setDraft({ ...draft, supportDraftsEnabled: Boolean(checked) })} />
					<span className="space-y-0.5">
						<span className="block font-medium">{t("supportDrafts")}</span>
						<span className="block text-xs text-muted-foreground">{t("supportDraftsHint")}</span>
					</span>
				</label>
				{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
				<Button type="submit" size="sm" disabled={busy !== null}>{busy === "tracker" ? tCommon("saving") : tCommon("save")}</Button>
				</fieldset>
			</form>
		</Section>
	);
}
