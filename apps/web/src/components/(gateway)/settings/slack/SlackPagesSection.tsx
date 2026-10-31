"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ChevronRight, ExternalLink, Trash2 } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteSlackAgentPage, loadSlackAgentPages, updateSlackAgent } from "@/app/(dashboard)/settings/slack/actions";
import { cn } from "@/lib/utils";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { Choice, Notice, SlackError, SwitchField } from "./SlackAgentFields";
import { slackErrorKey, type SlackAgentSettings, type SlackErrorKey, type SlackPageAccess } from "./slackAgentForm";
import {
	linkAccessPatch,
	pageSettings,
	pageSharing,
	SLACK_PAGE_ACCESS,
	SLACK_PAGE_EXPIRY_DAYS,
	slackPagesError,
	type SlackAgentPage,
	type SlackAgentPages,
	type SlackPagesError,
	type SlackPageSettings,
} from "./slackAgentPages";

type ActionFailure = { code: string | null; status: number | null; message: string | null };

const toError = (result: ActionFailure) => slackPagesError(result.code, result.status, result.message);

function PagesError({ error }: { error: SlackPagesError }) {
	const t = useTranslations("SettingsUI.slack");
	if (error.scope === "slack") return <SlackError error={error} />;
	return <Notice tone="error" role="alert">{t(`pages.errors.${error.key}`)}</Notice>;
}

/**
 * The web pages the agent publishes: the switch for them, how long new ones are
 * kept and who may view them, and the pages themselves, which owners and admins
 * can open and delete. The list loads when opened.
 */
export function SlackPagesSection({ settings: saved }: { settings: SlackAgentSettings }) {
	const t = useTranslations("SettingsUI.slack");
	const write = useSettingsWrite();
	const [open, setOpen] = useState(false);
	const [settings, setSettings] = useState<SlackPageSettings>(() => pageSettings(saved));
	const [pages, setPages] = useState<SlackAgentPages | null>(null);
	const [error, setError] = useState<SlackPagesError | null>(null);
	const [saveError, setSaveError] = useState<{ key: SlackErrorKey; message?: string | null } | null>(null);
	const [loading, startLoading] = useTransition();
	const [saving, startSaving] = useTransition();

	const load = useCallback(() => {
		startLoading(async () => {
			const result = await loadSlackAgentPages();
			if (!result.ok) {
				setError(toError(result));
				return;
			}
			setError(null);
			setPages(result.pages);
		});
	}, []);

	useEffect(() => {
		if (open) load();
	}, [open, load]);

	function change(patch: Record<string, unknown>, toastText = t("pages.saved")) {
		setSaveError(null);
		startSaving(async () => {
			const result = await write(updateSlackAgent(patch));
			if (!result.ok) {
				setSaveError({ key: slackErrorKey(result.code, result.status), message: result.message });
				return;
			}
			setSettings(pageSettings(result.installation.settings));
			toast.success(toastText);
		});
	}

	const removed = (id: string) => setPages((current) => current && { ...current, pages: current.pages.filter((page) => page.id !== id) });

	return (
		<Collapsible open={open} onOpenChange={setOpen} className="border-t pt-6">
			<CollapsibleTrigger asChild>
				<button type="button" className="flex w-full items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
					<ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden="true" />
					<span className="text-base font-semibold">{t("pages.title")}</span>
				</button>
			</CollapsibleTrigger>
			<p className="mt-1 pl-6 text-sm text-muted-foreground">{t("pages.description")}</p>
			<div className="mt-4 max-w-xl space-y-2 pl-6">
				<SwitchField label={t("pages.enable")} help={t("pages.enableHelp")} checked={settings.enabled} disabled={saving}
					onChange={(next) => change({ pages_enabled: next }, next ? t("pages.turnedOn") : t("pages.turnedOff"))} />
				<p className="text-xs text-muted-foreground">{t("pages.externalHelp")}</p>
				{saveError ? <SlackError error={saveError} /> : null}
			</div>
			<CollapsibleContent className="space-y-8 pt-5">
				{error ? <PagesError error={error} /> : null}
				{!pages ? (loading ? <p className="text-sm text-muted-foreground">{t("pages.loading")}</p> : null) : !pages.available ? (
					<Notice>{t("pages.unavailable")}</Notice>
				) : (
					<>
						<SharingFields settings={settings} signIn={pages.sign_in} disabled={saving} onChange={change} />
						<PagesList pages={pages} onDeleted={removed} />
					</>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

/** How long new pages are kept, and who may view them. */
export function SharingFields({ settings, signIn, disabled, onChange }: {
	settings: SlackPageSettings;
	signIn: boolean;
	disabled?: boolean;
	onChange: (patch: Record<string, unknown>) => void;
}) {
	const t = useTranslations("SettingsUI.slack");
	const sharing = pageSharing(settings, signIn);
	return (
		<div className="max-w-xl space-y-5">
			<div className="space-y-2">
				<p className="text-sm font-medium">{t("pages.expiry")}</p>
				<Choice<string>
					label={t("pages.expiry")}
					value={String(settings.expiryDays)}
					disabled={disabled}
					options={SLACK_PAGE_EXPIRY_DAYS.map((days) => ({ value: String(days), label: t("pages.days", { days }) }))}
					onChange={(value) => onChange({ page_expiry_days: Number(value) })}
				/>
				<p className="text-xs text-muted-foreground">{t("pages.expiryHelp")}</p>
			</div>
			<SwitchField label={t("pages.linkAccess")} help={t("pages.linkAccessHelp")} checked={settings.linkAccess} disabled={disabled}
				onChange={(next) => onChange(linkAccessPatch(next, settings))} />
			{signIn && settings.linkAccess ? (
				<div className="space-y-2">
					<p className="text-sm font-medium">{t("pages.defaultAccess")}</p>
					<Choice<SlackPageAccess>
						label={t("pages.defaultAccess")}
						value={settings.defaultAccess}
						disabled={disabled}
						options={SLACK_PAGE_ACCESS.map((value) => ({ value, label: t(`pages.access.${value}`) }))}
						onChange={(value) => onChange({ page_default_access: value })}
					/>
					<p className="text-xs text-muted-foreground">{t("pages.workspaceHelp")}</p>
				</div>
			) : null}
			{!sharing.effectiveDefault ? <Notice tone="warning">{t("pages.noWay")}</Notice> : !signIn ? <Notice>{t("pages.noSignIn")}</Notice> : null}
		</div>
	);
}

function useDate() {
	const locale = useLocale();
	return (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}

export function PagesList({ pages, onDeleted }: { pages: SlackAgentPages; onDeleted: (id: string) => void }) {
	const t = useTranslations("SettingsUI.slack");
	const locale = useLocale();
	const date = useDate();
	const number = (value: number) => value.toLocaleString(locale);
	return (
		<div className="space-y-3">
			<div>
				<h3 className="text-sm font-semibold">{t("pages.listTitle")}</h3>
				<p className="text-xs text-muted-foreground">{t("pages.used", { used: number(pages.pages.length), limit: number(pages.limit) })}</p>
			</div>
			{pages.pages.length ? (
				<div className="overflow-x-auto rounded-md border">
					<Table className="text-sm">
						<TableHeader>
							<TableRow>
								<TableHead>{t("pages.columns.page")}</TableHead>
								<TableHead>{t("pages.columns.access")}</TableHead>
								<TableHead>{t("pages.columns.published")}</TableHead>
								<TableHead>{t("pages.columns.expires")}</TableHead>
								<TableHead className="text-right">{t("pages.columns.views")}</TableHead>
								<TableHead className="w-10"><span className="sr-only">{t("pages.columns.actions")}</span></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{pages.pages.map((page) => (
								<TableRow key={page.id}>
									<TableCell className="min-w-56 max-w-md break-words align-top">
										<a href={page.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
											{page.title}
											<ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
										</a>
									</TableCell>
									<TableCell className="align-top"><Badge variant="outline">{t(`pages.access.${page.access}`)}</Badge></TableCell>
									<TableCell className="whitespace-nowrap align-top text-muted-foreground">
										{date(page.created_at)}
										<span className="block text-xs">{t("pages.by", { user: page.created_by })}</span>
									</TableCell>
									<TableCell className="whitespace-nowrap align-top text-muted-foreground">{date(page.expires_at)}</TableCell>
									<TableCell className="text-right align-top tabular-nums">{number(page.views)}</TableCell>
									<TableCell className="align-top"><DeletePage page={page} onDeleted={onDeleted} /></TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			) : <p className="text-sm text-muted-foreground">{t("pages.empty")}</p>}
		</div>
	);
}

function DeletePage({ page, onDeleted }: { page: SlackAgentPage; onDeleted: (id: string) => void }) {
	const t = useTranslations("SettingsUI.slack");
	const [error, setError] = useState<SlackPagesError | null>(null);
	const [deleting, startDeleting] = useTransition();

	function remove() {
		startDeleting(async () => {
			const result = await deleteSlackAgentPage(page.id);
			if (!result.ok) {
				const failure = toError(result);
				// Already gone: the list catches up.
				if (failure.scope === "pages") onDeleted(page.id);
				else setError(failure);
				return;
			}
			onDeleted(page.id);
			toast.success(t("pages.deleted"));
		});
	}

	return (
		<>
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" disabled={deleting} aria-label={t("pages.deletePage")}>
						<Trash2 className="size-4" />
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("pages.deleteTitle", { title: page.title })}</AlertDialogTitle>
						<AlertDialogDescription>{t("pages.deleteDescription")}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
						<AlertDialogAction onClick={remove}>{t("pages.delete")}</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			{error ? <div className="mt-2 min-w-48"><PagesError error={error} /></div> : null}
		</>
	);
}
