"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "@/i18n/react";
import { toast } from "sonner";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { deleteSlackAgentNote, deleteSlackAgentSkill, loadSlackAgentMemory, updateSlackAgent, updateSlackAgentSkill } from "@/app/(dashboard)/settings/slack/actions";
import { cn } from "@/lib/utils";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { Choice, Notice, SlackError, SwitchField } from "./SlackAgentFields";
import { slackErrorKey, type SlackErrorKey } from "./slackAgentForm";
import {
	MAX_SKILL_DESCRIPTION_CHARS,
	MAX_SKILL_INSTRUCTIONS_CHARS,
	MAX_SKILL_NAME_CHARS,
	SLACK_MEMORY_FILTERS,
	noteScope,
	skillDraftFrom,
	skillPatch,
	slackMemoryError,
	type SlackAgentMemory,
	type SlackAgentNote,
	type SlackAgentSkill,
	type SlackMemoryError,
	type SlackMemoryFilter,
	type SlackSkillDraft,
	type SlackSkillProblem,
} from "./slackAgentMemory";

type ActionFailure = { code: string | null; status: number | null; message: string | null };

const toError = (result: ActionFailure) => slackMemoryError(result.code, result.status, result.message);

function MemoryError({ error }: { error: SlackMemoryError }) {
	const t = useTranslations("SettingsUI.slack");
	if (error.scope === "slack") return <SlackError error={error} />;
	return <Notice tone="error" role="alert">{t(`memory.errors.${error.key}`)}</Notice>;
}

/**
 * What the agent remembers: its notes, pins and to-dos, and its saved skills.
 * Owners and admins can turn notes off, delete any of them and edit a skill.
 * The lists load when opened.
 */
export function SlackMemorySection({ memoryEnabled }: { memoryEnabled: boolean }) {
	const t = useTranslations("SettingsUI.slack");
	const [open, setOpen] = useState(false);
	const [filter, setFilter] = useState<SlackMemoryFilter>("all");
	const [memory, setMemory] = useState<SlackAgentMemory | null>(null);
	const [error, setError] = useState<SlackMemoryError | null>(null);
	const [loading, startLoading] = useTransition();

	const load = useCallback((kind: SlackMemoryFilter) => {
		startLoading(async () => {
			const result = await loadSlackAgentMemory({ data: kind });
			if (!result.ok) {
				setError(toError(result));
				return;
			}
			setError(null);
			setMemory(result.memory);
		});
	}, []);

	useEffect(() => {
		if (open) load(filter);
	}, [open, filter, load]);

	const noteDeleted = (id: string) => setMemory((current) => current && {
		...current,
		notes: current.notes.filter((note) => note.id !== id),
		notes_total: Math.max(current.notes_total - 1, 0),
		notes_used: Math.max(current.notes_used - 1, 0),
	});
	const skillChanged = (skill: SlackAgentSkill | null, id: string) => setMemory((current) => current && {
		...current,
		skills: skill ? current.skills.map((entry) => (entry.id === id ? skill : entry)) : current.skills.filter((entry) => entry.id !== id),
	});

	return (
		<Collapsible open={open} onOpenChange={setOpen} className="border-t pt-6">
			<CollapsibleTrigger asChild>
				<button type="button" className="flex w-full items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
					<ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden="true" />
					<span className="text-base font-semibold">{t("memory.title")}</span>
				</button>
			</CollapsibleTrigger>
			<p className="mt-1 pl-6 text-sm text-muted-foreground">{t("memory.description")}</p>
			<MemorySwitch initial={memoryEnabled} />
			<CollapsibleContent className="space-y-8 pt-5">
				{error ? <MemoryError error={error} /> : null}
				{!memory ? (loading ? <p className="text-sm text-muted-foreground">{t("memory.loading")}</p> : null) : (
					<>
						<NotesList memory={memory} filter={filter} loading={loading} onFilter={setFilter} onDeleted={noteDeleted} />
						<SkillsList memory={memory} onChanged={skillChanged} />
					</>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

/** The admins' switch for notes, saved as soon as it changes. Turning it off keeps the saved notes. */
function MemorySwitch({ initial }: { initial: boolean }) {
	const t = useTranslations("SettingsUI.slack");
	const write = useSettingsWrite();
	const [enabled, setEnabled] = useState(initial);
	const [error, setError] = useState<{ key: SlackErrorKey; message?: string | null } | null>(null);
	const [saving, startSaving] = useTransition();

	function change(next: boolean) {
		setError(null);
		startSaving(async () => {
			const result = await write(updateSlackAgent({ data: { memory_enabled: next } }));
			if (!result.ok) {
				setError({ key: slackErrorKey(result.code, result.status), message: result.message });
				return;
			}
			setEnabled(result.installation.settings.memory_enabled);
			toast.success(next ? t("memory.turnedOn") : t("memory.turnedOff"));
		});
	}

	return (
		<div className="mt-4 max-w-xl space-y-2 pl-6">
			<SwitchField label={t("memory.enable")} help={t("memory.enableHelp")} checked={enabled} disabled={saving} onChange={change} />
			<p className="text-xs text-muted-foreground">{t("memory.externalHelp")}</p>
			{error ? <SlackError error={error} /> : null}
		</div>
	);
}

function useDate() {
	const locale = useLocale();
	return (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}

/** The last UTC day a note is kept: its expiry is the end of that day. */
function useLastDay() {
	const locale = useLocale();
	return (expiresAt: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.parse(expiresAt) - 1));
}

export function NotesList({ memory, filter, loading, onFilter, onDeleted }: {
	memory: SlackAgentMemory;
	filter: SlackMemoryFilter;
	loading: boolean;
	onFilter: (filter: SlackMemoryFilter) => void;
	onDeleted: (id: string) => void;
}) {
	const t = useTranslations("SettingsUI.slack");
	const locale = useLocale();
	const date = useDate();
	const lastDay = useLastDay();
	const number = (value: number) => value.toLocaleString(locale);

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h3 className="text-sm font-semibold">{t("memory.notesTitle")}</h3>
					<p className="text-xs text-muted-foreground">{t("memory.used", { used: number(memory.notes_used), limit: number(memory.notes_limit) })}</p>
				</div>
				<Choice<SlackMemoryFilter>
					label={t("memory.filter")}
					value={filter}
					disabled={loading}
					options={SLACK_MEMORY_FILTERS.map((value) => ({ value, label: t(`memory.filters.${value}`) }))}
					onChange={onFilter}
				/>
			</div>
			{memory.notes.length ? (
				<div className="overflow-x-auto rounded-md border">
					<Table className="text-sm">
						<TableHeader>
							<TableRow>
								<TableHead>{t("memory.columns.note")}</TableHead>
								<TableHead>{t("memory.columns.kind")}</TableHead>
								<TableHead>{t("memory.columns.where")}</TableHead>
								<TableHead>{t("memory.columns.saved")}</TableHead>
								<TableHead className="w-10"><span className="sr-only">{t("memory.columns.actions")}</span></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{memory.notes.map((note) => (
								<TableRow key={note.id}>
									<TableCell className="min-w-64 max-w-md whitespace-pre-wrap break-words align-top">
										<span className={cn(note.done_at && "text-muted-foreground line-through")}>{note.text}</span>
										{note.done_at ? <span className="mt-1 block text-xs text-muted-foreground">{t("memory.doneOn", { date: date(note.done_at) })}</span> : null}
										{note.expires_at ? <span className="mt-1 block text-xs text-muted-foreground">{t("memory.expires", { date: lastDay(note.expires_at) })}</span> : null}
									</TableCell>
									<TableCell className="align-top"><Badge variant="outline">{t(`memory.kinds.${note.kind}`)}</Badge></TableCell>
									<TableCell className="align-top text-muted-foreground"><NoteScope note={note} /></TableCell>
									<TableCell className="whitespace-nowrap align-top text-muted-foreground">
										{date(note.created_at)}
										<span className="block text-xs">{t("memory.by", { user: note.created_by })}</span>
									</TableCell>
									<TableCell className="align-top"><DeleteNote note={note} onDeleted={onDeleted} /></TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			) : <p className="text-sm text-muted-foreground">{filter === "all" ? t("memory.noNotes") : t("memory.noNotesOfKind")}</p>}
		</div>
	);
}

function NoteScope({ note }: { note: SlackAgentNote }) {
	const t = useTranslations("SettingsUI.slack");
	const scope = noteScope(note.channel_id);
	if (scope === "workspace") return <>{t("memory.workspaceWide")}</>;
	return <>{t(`memory.${scope}`, { id: note.channel_id ?? "" })}</>;
}

function DeleteNote({ note, onDeleted }: { note: SlackAgentNote; onDeleted: (id: string) => void }) {
	const t = useTranslations("SettingsUI.slack");
	const [error, setError] = useState<SlackMemoryError | null>(null);
	const [deleting, startDeleting] = useTransition();

	function remove() {
		startDeleting(async () => {
			const result = await deleteSlackAgentNote({ data: note.id });
			if (!result.ok) {
				const failure = toError(result);
				// Already gone: the list catches up.
				if (failure.scope === "memory" && failure.key === "memoryNotFound") onDeleted(note.id);
				else setError(failure);
				return;
			}
			onDeleted(note.id);
			toast.success(t("memory.noteDeleted"));
		});
	}

	return (
		<>
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" disabled={deleting} aria-label={t("memory.deleteNote")}>
						<Trash2 className="size-4" />
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("memory.deleteNoteTitle")}</AlertDialogTitle>
						<AlertDialogDescription>{t("memory.deleteNoteDescription")}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
						<AlertDialogAction onClick={remove}>{t("memory.delete")}</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			{error ? <div className="mt-2 min-w-48"><MemoryError error={error} /></div> : null}
		</>
	);
}

export function SkillsList({ memory, onChanged }: { memory: SlackAgentMemory; onChanged: (skill: SlackAgentSkill | null, id: string) => void }) {
	const t = useTranslations("SettingsUI.slack");
	const locale = useLocale();
	const number = (value: number) => value.toLocaleString(locale);
	return (
		<div className="space-y-3">
			<div>
				<h3 className="text-sm font-semibold">{t("memory.skillsTitle")}</h3>
				<p className="text-xs text-muted-foreground">{t("memory.used", { used: number(memory.skills.length), limit: number(memory.skills_limit) })}</p>
			</div>
			{memory.skills.length ? (
				<ul className="space-y-3">
					{memory.skills.map((skill) => <SkillItem key={skill.id} skill={skill} onChanged={onChanged} />)}
				</ul>
			) : <p className="text-sm text-muted-foreground">{t("memory.noSkills")}</p>}
		</div>
	);
}

function SkillItem({ skill, onChanged }: { skill: SlackAgentSkill; onChanged: (skill: SlackAgentSkill | null, id: string) => void }) {
	const t = useTranslations("SettingsUI.slack");
	const date = useDate();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState<SlackSkillDraft>(() => skillDraftFrom(skill));
	const [problem, setProblem] = useState<SlackSkillProblem | null>(null);
	const [error, setError] = useState<SlackMemoryError | null>(null);
	const [saving, startSaving] = useTransition();
	const [deleting, startDeleting] = useTransition();
	const busy = saving || deleting;
	const set = (field: keyof SlackSkillDraft, value: string) => {
		setDraft((current) => ({ ...current, [field]: value }));
		setProblem(null);
		setError(null);
	};

	function save() {
		const built = skillPatch(draft, skillDraftFrom(skill));
		if (!built.ok) {
			setProblem(built.problem);
			return;
		}
		if (!Object.keys(built.value).length) {
			setEditing(false);
			return;
		}
		startSaving(async () => {
			const result = await updateSlackAgentSkill({ data: { id: skill.id, patch: built.value } });
			if (!result.ok) {
				setError(toError(result));
				return;
			}
			onChanged(result.skill, skill.id);
			setDraft(skillDraftFrom(result.skill));
			setEditing(false);
			toast.success(t("memory.skillSaved"));
		});
	}

	function remove() {
		startDeleting(async () => {
			const result = await deleteSlackAgentSkill({ data: skill.id });
			if (!result.ok) {
				const failure = toError(result);
				if (failure.scope === "memory" && failure.key === "memoryNotFound") onChanged(null, skill.id);
				else setError(failure);
				return;
			}
			onChanged(null, skill.id);
			toast.success(t("memory.skillDeleted"));
		});
	}

	const field = (name: keyof SlackSkillDraft, label: string, max: number) => {
		const id = `slack-skill-${skill.id}-${name}`;
		const own = problem?.field === name ? problem : null;
		const props = {
			id,
			value: draft[name],
			maxLength: max,
			disabled: busy,
			"aria-invalid": own ? true : undefined,
			"aria-describedby": own ? `${id}-problem` : undefined,
			onChange: (event: { target: { value: string } }) => set(name, event.target.value),
		};
		return (
			<div className="space-y-1.5">
				<Label htmlFor={id}>{label}</Label>
				{name === "instructions" ? <Textarea {...props} rows={6} /> : <Input {...props} />}
				{own ? <p id={`${id}-problem`} className="text-xs text-destructive">{t(`memory.problems.${own.code}`, { max: own.max ?? max })}</p> : null}
			</div>
		);
	};

	return (
		<li className="space-y-3 rounded-md border px-4 py-3">
			{editing ? (
				<div className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						{field("name", t("memory.skillName"), MAX_SKILL_NAME_CHARS)}
						{field("description", t("memory.skillDescription"), MAX_SKILL_DESCRIPTION_CHARS)}
					</div>
					{field("instructions", t("memory.skillInstructions"), MAX_SKILL_INSTRUCTIONS_CHARS)}
					<div className="flex flex-wrap items-center gap-2">
						<Button type="button" size="sm" onClick={save} disabled={busy}>{saving ? t("saving") : t("memory.saveSkill")}</Button>
						<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setDraft(skillDraftFrom(skill)); setProblem(null); setError(null); }}>{t("cancel")}</Button>
					</div>
				</div>
			) : (
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0 flex-1 space-y-1">
						<p className="font-medium">{skill.name}</p>
						<p className="text-sm text-muted-foreground">{skill.description}</p>
						<p className="line-clamp-3 whitespace-pre-wrap break-words text-sm">{skill.instructions}</p>
						<p className="text-xs text-muted-foreground">{t("memory.skillMeta", { user: skill.created_by, date: date(skill.updated_at) })}</p>
					</div>
					<div className="flex items-center gap-1">
						<Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(true)}><Pencil className="size-4" />{t("memory.edit")}</Button>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy}><Trash2 className="size-4" />{t("memory.delete")}</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>{t("memory.deleteSkillTitle", { name: skill.name })}</AlertDialogTitle>
									<AlertDialogDescription>{t("memory.deleteSkillDescription")}</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
									<AlertDialogAction onClick={remove}>{t("memory.delete")}</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</div>
			)}
			{error ? <MemoryError error={error} /> : null}
		</li>
	);
}
