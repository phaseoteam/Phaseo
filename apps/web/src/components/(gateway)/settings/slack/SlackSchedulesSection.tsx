import { useCallback, useEffect, useState, useTransition } from "react";
import { ChevronRight, Pause, Play, Trash2 } from "lucide-react";
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
import { deleteSlackAgentSchedule, loadSlackAgentSchedules, setSlackAgentScheduleStatus, updateSlackAgent } from "@/features/settings/slack/actions";
import { cn } from "@/lib/utils";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { Choice, Notice, SlackError, SwitchField } from "./SlackAgentFields";
import { slackErrorKey, type SlackErrorKey } from "./slackAgentForm";
import {
	MAX_SCHEDULES,
	lastRunState,
	pauseReasonKey,
	scheduleSettingsDraft,
	scheduleSettingsPatch,
	scheduleWhere,
	skipReasonKey,
	slackScheduleError,
	type SlackAgentSchedule,
	type SlackAgentSchedules,
	type SlackScheduleCreators,
	type SlackScheduleError,
	type SlackScheduleSettings,
	type SlackScheduleSettingsDraft,
} from "./slackAgentSchedules";

type ActionFailure = { code: string | null; status: number | null; message: string | null };

const toError = (result: ActionFailure) => slackScheduleError(result.code, result.status, result.message);

function ScheduleError({ error }: { error: SlackScheduleError }) {
	const t = useTranslations("SettingsUI.slack");
	if (error.scope === "slack") return <SlackError error={error} />;
	return <Notice tone="error" role="alert">{t(`schedules.errors.${error.key}`)}</Notice>;
}

/**
 * Recurring tasks: the admins' settings (on or off, the most per workspace, who
 * can set them up), always shown, and the workspace's schedules, loaded when
 * opened, with pause, resume and delete.
 */
export function SlackSchedulesSection({ settings }: { settings: SlackScheduleSettings }) {
	const t = useTranslations("SettingsUI.slack");
	const [open, setOpen] = useState(false);
	const [data, setData] = useState<SlackAgentSchedules | null>(null);
	const [error, setError] = useState<SlackScheduleError | null>(null);
	const [loading, startLoading] = useTransition();

	const load = useCallback(() => {
		startLoading(async () => {
			const result = await loadSlackAgentSchedules();
			if (!result.ok) {
				setError(toError(result));
				return;
			}
			setError(null);
			setData(result.schedules);
		});
	}, []);

	useEffect(() => {
		if (open) load();
	}, [open, load]);

	const changed = (schedule: SlackAgentSchedule | null, id: string) => setData((current) => current && {
		...current,
		schedules: schedule ? current.schedules.map((entry) => (entry.id === id ? schedule : entry)) : current.schedules.filter((entry) => entry.id !== id),
		total: schedule ? current.total : Math.max(current.total - 1, 0),
	});

	return (
		<Collapsible open={open} onOpenChange={setOpen} className="border-t pt-6">
			<CollapsibleTrigger asChild>
				<button type="button" className="flex w-full items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
					<ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden="true" />
					<span className="text-base font-semibold">{t("schedules.title")}</span>
				</button>
			</CollapsibleTrigger>
			<p className="mt-1 pl-6 text-sm text-muted-foreground">{t("schedules.description")}</p>
			<ScheduleSettingsForm initial={scheduleSettingsDraft(settings)} />
			<CollapsibleContent className="space-y-4 pt-5">
				{error ? <ScheduleError error={error} /> : null}
				{!data ? (loading ? <p className="text-sm text-muted-foreground">{t("schedules.loading")}</p> : null) : <SchedulesList data={data} onChanged={changed} />}
			</CollapsibleContent>
		</Collapsible>
	);
}

/** On or off, the most per workspace and who can set them up, saved together. */
function ScheduleSettingsForm({ initial }: { initial: SlackScheduleSettingsDraft }) {
	const t = useTranslations("SettingsUI.slack");
	const write = useSettingsWrite();
	const [saved, setSaved] = useState(initial);
	const [draft, setDraft] = useState(initial);
	const [problem, setProblem] = useState(false);
	const [error, setError] = useState<{ key: SlackErrorKey; message?: string | null } | null>(null);
	const [saving, startSaving] = useTransition();
	const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
	const set = <K extends keyof SlackScheduleSettingsDraft>(field: K, value: SlackScheduleSettingsDraft[K]) => {
		setDraft((current) => ({ ...current, [field]: value }));
		setProblem(false);
		setError(null);
	};

	function save() {
		const built = scheduleSettingsPatch(draft, saved);
		if (!built.ok) {
			setProblem(true);
			return;
		}
		if (!Object.keys(built.value).length) {
			setSaved(draft);
			return;
		}
		startSaving(async () => {
			const result = await write(updateSlackAgent({ data: built.value }));
			if (!result.ok) {
				setError({ key: slackErrorKey(result.code, result.status), message: result.message });
				return;
			}
			const next = scheduleSettingsDraft(result.installation.settings);
			setSaved(next);
			setDraft(next);
			toast.success(t("schedules.saved"));
		});
	}

	return (
		<div className="mt-4 max-w-xl space-y-4 pl-6">
			<SwitchField label={t("schedules.enable")} help={t("schedules.enableHelp")} checked={draft.enabled} disabled={saving} onChange={(enabled) => set("enabled", enabled)} />
			<div className="space-y-1.5">
				<Label htmlFor="slack-schedules-max">{t("schedules.max")}</Label>
				<Input id="slack-schedules-max" className="w-28" inputMode="numeric" value={draft.max} disabled={saving} aria-invalid={problem || undefined} aria-describedby="slack-schedules-max-help" onChange={(event) => set("max", event.target.value)} />
				<p id="slack-schedules-max-help" className={cn("text-xs", problem ? "text-destructive" : "text-muted-foreground")}>
					{problem ? t("schedules.maxInvalid", { max: MAX_SCHEDULES }) : t("schedules.maxHelp", { max: MAX_SCHEDULES })}
				</p>
			</div>
			<div className="space-y-2">
				<Label>{t("schedules.creators")}</Label>
				<Choice<SlackScheduleCreators>
					label={t("schedules.creators")}
					value={draft.creators}
					disabled={saving}
					options={[{ value: "everyone", label: t("schedules.creatorsEveryone") }, { value: "linked", label: t("schedules.creatorsLinked") }]}
					onChange={(creators) => set("creators", creators)}
				/>
			</div>
			{error ? <SlackError error={error} /> : null}
			{dirty ? (
				<div className="flex flex-wrap items-center gap-2">
					<Button type="button" size="sm" onClick={save} disabled={saving}>{saving ? t("saving") : t("schedules.save")}</Button>
					<Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => { setDraft(saved); setProblem(false); setError(null); }}>{t("cancel")}</Button>
				</div>
			) : null}
		</div>
	);
}

/** A local time of day, as the locale writes it. */
function timeOfDay(locale: string, hour: number, minute: number): string {
	return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(Date.UTC(2024, 0, 1, hour, minute));
}

/** 1 (Monday) to 7, as the locale names it; 1 January 2024 was a Monday. */
function weekday(locale: string, day: number): string {
	return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(Date.UTC(2024, 0, day));
}

function useHowOften() {
	const t = useTranslations("SettingsUI.slack");
	const locale = useLocale();
	return (schedule: SlackAgentSchedule) => {
		const time = timeOfDay(locale, schedule.hour ?? 0, schedule.minute);
		switch (schedule.frequency) {
			case "hourly":
				return t("schedules.frequency.hourly", { minute: String(schedule.minute).padStart(2, "0") });
			case "daily":
				return t("schedules.frequency.daily", { time });
			case "weekdays":
				return t("schedules.frequency.weekdays", { time });
			case "weekly":
				return t("schedules.frequency.weekly", { day: weekday(locale, schedule.day_of_week ?? 1), time });
			case "monthly":
				return t("schedules.frequency.monthly", { day: String(schedule.day_of_month ?? 1), time });
		}
	};
}

/** A time in the schedule's own time zone. */
function useInZone() {
	const locale = useLocale();
	return (iso: string, timezone: string) => {
		try {
			return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(iso));
		} catch {
			return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso));
		}
	};
}

export function SchedulesList({ data, onChanged, now = Date.now() }: { data: SlackAgentSchedules; onChanged: (schedule: SlackAgentSchedule | null, id: string) => void; now?: number }) {
	const t = useTranslations("SettingsUI.slack");
	const locale = useLocale();
	const howOften = useHowOften();
	const inZone = useInZone();
	const number = (value: number) => value.toLocaleString(locale);

	return (
		<div className="space-y-3">
			<p className="text-xs text-muted-foreground">{t("schedules.used", { used: number(data.total), limit: number(data.limit) })}</p>
			{!data.enabled ? <Notice>{t("schedules.offNote")}</Notice> : null}
			{data.schedules.length ? (
				<div className="overflow-x-auto rounded-md border">
					<Table className="text-sm">
						<TableHeader>
							<TableRow>
								<TableHead>{t("schedules.columns.task")}</TableHead>
								<TableHead>{t("schedules.columns.where")}</TableHead>
								<TableHead>{t("schedules.columns.often")}</TableHead>
								<TableHead>{t("schedules.columns.next")}</TableHead>
								<TableHead>{t("schedules.columns.by")}</TableHead>
								<TableHead>{t("schedules.columns.last")}</TableHead>
								<TableHead><span className="sr-only">{t("schedules.columns.actions")}</span></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.schedules.map((schedule) => {
								const last = lastRunState(schedule, now);
								// A skipped run says why, e.g. the agent was paused.
								const skippedBecause = last === "skipped" ? skipReasonKey(schedule.last_result_reason) : null;
								return (
									<TableRow key={schedule.id}>
										<TableCell className="min-w-56 max-w-sm align-top">
											<span className="block font-medium">{schedule.title}</span>
											<span className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{schedule.prompt}</span>
										</TableCell>
										<TableCell className="whitespace-nowrap align-top text-muted-foreground">{t(`schedules.${scheduleWhere(schedule.channel_id)}`, { id: schedule.channel_id })}</TableCell>
										<TableCell className="align-top">
											{howOften(schedule)}
											<span className="block text-xs text-muted-foreground">{t("schedules.timeZone", { zone: schedule.timezone })}</span>
										</TableCell>
										<TableCell className="align-top">
											{schedule.status === "active" ? <span className="whitespace-nowrap">{inZone(schedule.next_run_at, schedule.timezone)}</span> : (
												<>
													<Badge variant="secondary">{t("schedules.paused")}</Badge>
													<span className="mt-1 block text-xs text-muted-foreground">{t(`schedules.pauseReasons.${pauseReasonKey(schedule.pause_reason)}`)}</span>
												</>
											)}
										</TableCell>
										<TableCell className="whitespace-nowrap align-top text-muted-foreground">{schedule.created_by}</TableCell>
										<TableCell className="align-top">
											<span className={cn(last === "failed" && "text-destructive")}>{skippedBecause ? t(`schedules.skipReasons.${skippedBecause}`) : t(`schedules.lastResult.${last}`)}</span>
											{schedule.last_run_at && last !== "none" ? <span className="block whitespace-nowrap text-xs text-muted-foreground">{inZone(schedule.last_run_at, schedule.timezone)}</span> : null}
											{schedule.failures > 0 ? <span className="block text-xs text-muted-foreground">{t("schedules.failuresInRow", { count: number(schedule.failures) })}</span> : null}
										</TableCell>
										<TableCell className="align-top"><ScheduleActions schedule={schedule} onChanged={onChanged} /></TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			) : <p className="text-sm text-muted-foreground">{t("schedules.empty")}</p>}
		</div>
	);
}

function ScheduleActions({ schedule, onChanged }: { schedule: SlackAgentSchedule; onChanged: (schedule: SlackAgentSchedule | null, id: string) => void }) {
	const t = useTranslations("SettingsUI.slack");
	const [error, setError] = useState<SlackScheduleError | null>(null);
	const [working, startWorking] = useTransition();
	const gone = (failure: SlackScheduleError) => failure.scope === "schedules" && failure.key === "scheduleNotFound";

	function setStatus(status: "active" | "paused") {
		startWorking(async () => {
			const result = await setSlackAgentScheduleStatus({ data: { id: schedule.id, status } });
			if (!result.ok) {
				const failure = toError(result);
				// Deleted meanwhile: the list catches up.
				if (gone(failure)) onChanged(null, schedule.id);
				else setError(failure);
				return;
			}
			setError(null);
			onChanged(result.schedule, schedule.id);
			toast.success(status === "paused" ? t("schedules.pausedToast") : t("schedules.resumedToast"));
		});
	}

	function remove() {
		startWorking(async () => {
			const result = await deleteSlackAgentSchedule({ data: schedule.id });
			if (!result.ok) {
				const failure = toError(result);
				if (gone(failure)) onChanged(null, schedule.id);
				else setError(failure);
				return;
			}
			onChanged(null, schedule.id);
			toast.success(t("schedules.deletedToast"));
		});
	}

	return (
		<div className="flex min-w-48 flex-col items-end gap-2">
			<div className="flex items-center gap-1">
				{schedule.status === "active" ? (
					<Button type="button" variant="ghost" size="sm" disabled={working} onClick={() => setStatus("paused")}><Pause className="size-4" />{t("schedules.pause")}</Button>
				) : (
					<Button type="button" variant="ghost" size="sm" disabled={working} onClick={() => setStatus("active")}><Play className="size-4" />{t("schedules.resume")}</Button>
				)}
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={working}><Trash2 className="size-4" />{t("schedules.delete")}</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t("schedules.deleteTitle", { title: schedule.title })}</AlertDialogTitle>
							<AlertDialogDescription>{t("schedules.deleteDescription")}</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
							<AlertDialogAction onClick={remove}>{t("schedules.delete")}</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
			{error ? <ScheduleError error={error} /> : null}
		</div>
	);
}
