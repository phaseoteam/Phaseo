"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removeSlackCustomApp, saveSlackCustomApp } from "@/app/(dashboard)/settings/slack/actions";
import { cn } from "@/lib/utils";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { Notice, SlackError } from "./SlackAgentFields";
import { customAppPayload, slackErrorKey, type SlackAgentManagerView, type SlackCustomAppDraft, type SlackCustomAppProblem, type SlackErrorKey } from "./slackAgentForm";

const EMPTY_DRAFT: SlackCustomAppDraft = { slackAppId: "", clientId: "", clientSecret: "", signingSecret: "" };

/** A company's own Slack app: what to register with Slack, and its credentials. */
export function SlackCustomAppSection({ view }: { view: SlackAgentManagerView }) {
	const t = useTranslations("SettingsUI.slack");
	const write = useSettingsWrite();
	const saved = view.custom_app;
	const installedWithIt = Boolean(view.installation?.uses_custom_app);
	const [open, setOpen] = useState(Boolean(saved) || !view.configured.hosted_app);
	const [editing, setEditing] = useState(!saved);
	const [draft, setDraft] = useState<SlackCustomAppDraft>(() => saved ? { ...EMPTY_DRAFT, slackAppId: saved.slack_app_id, clientId: saved.client_id } : EMPTY_DRAFT);
	const [problem, setProblem] = useState<SlackCustomAppProblem | null>(null);
	const [error, setError] = useState<{ key: SlackErrorKey; message?: string | null } | null>(null);
	const [saving, startSaving] = useTransition();
	const [removing, startRemoving] = useTransition();
	const busy = saving || removing;
	const set = (field: keyof SlackCustomAppDraft, value: string) => {
		setDraft((current) => ({ ...current, [field]: value }));
		setProblem(null);
		setError(null);
	};

	function save() {
		const built = customAppPayload(draft);
		if (!built.ok) {
			setProblem(built.problem);
			return;
		}
		startSaving(async () => {
			const result = await write(saveSlackCustomApp(built.value));
			if (!result.ok) {
				setError({ key: slackErrorKey(result.code, result.status), message: result.message });
				return;
			}
			toast.success(t("customApp.savedToast"));
			setDraft({ ...EMPTY_DRAFT, slackAppId: result.customApp.slack_app_id, clientId: result.customApp.client_id });
			setEditing(false);
		});
	}

	function remove() {
		startRemoving(async () => {
			const result = await write(removeSlackCustomApp());
			if (!result.ok) {
				setError({ key: slackErrorKey(result.code, result.status), message: result.message });
				return;
			}
			toast.success(t("customApp.removed"));
			setDraft(EMPTY_DRAFT);
			setEditing(true);
		});
	}

	const field = (name: keyof SlackCustomAppDraft, label: string, secret = false) => (
		<div className="space-y-1.5">
			<Label htmlFor={`slack-app-${name}`}>{label}</Label>
			<Input
				id={`slack-app-${name}`}
				type={secret ? "password" : "text"}
				autoComplete="off"
				spellCheck={false}
				value={draft[name]}
				disabled={busy || (installedWithIt && !secret)}
				aria-invalid={problem?.field === name || undefined}
				aria-describedby={problem?.field === name ? `slack-app-${name}-problem` : undefined}
				onChange={(event) => set(name, event.target.value)}
			/>
			{problem?.field === name ? <p id={`slack-app-${name}-problem`} className="text-xs text-destructive">{t(`problems.customApp.${name}`)}</p> : null}
		</div>
	);

	return (
		<Collapsible open={open} onOpenChange={setOpen} className="border-t pt-6">
			<CollapsibleTrigger asChild>
				<button type="button" className="flex w-full items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
					<ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden="true" />
					<span className="text-base font-semibold">{t("sections.customApp")}</span>
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent className="space-y-5 pt-4">
				<p className="text-sm text-muted-foreground">{t("customApp.description")}</p>
				{!view.configured.custom_app ? <Notice>{t("customApp.notAvailable")}</Notice> : (
					<>
						<div className="space-y-3">
							<div className="space-y-1.5">
								<Label>{t("customApp.redirectUrl")}</Label>
								<div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
									<code className="min-w-0 flex-1 truncate font-mono text-xs">{view.redirect_url}</code>
									<CopyButton size="sm" variant="ghost" content={view.redirect_url} aria-label={t("customApp.copyRedirectUrl")} />
								</div>
							</div>
							<div className="space-y-1.5">
								<Label>{t("customApp.scopes")}</Label>
								<div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2">
									<code className="min-w-0 flex-1 break-words font-mono text-xs leading-5">{view.scopes.join(", ")}</code>
									<CopyButton size="sm" variant="ghost" content={view.scopes.join(",")} aria-label={t("customApp.copyScopes")} />
								</div>
							</div>
							<p className="text-xs text-muted-foreground">{t("customApp.manifest")}</p>
						</div>

						{saved && !editing ? (
							<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
								<div className="min-w-0 text-sm">
									<p className="font-medium">{t("customApp.saved", { appId: saved.slack_app_id, clientId: saved.client_id })}</p>
									<p className="text-xs text-muted-foreground">{installedWithIt ? t("customApp.inUse") : t("customApp.secretsSaved")}</p>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setEditing(true)}>{t("customApp.replace")}</Button>
									{!installedWithIt ? (
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy}><Trash2 className="size-4" />{t("customApp.remove")}</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>{t("customApp.removeTitle")}</AlertDialogTitle>
													<AlertDialogDescription>{t("customApp.removeDescription")}</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
													<AlertDialogAction onClick={remove}>{t("customApp.remove")}</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									) : null}
								</div>
							</div>
						) : (
							<div className="space-y-4">
								{installedWithIt ? <p className="text-xs text-muted-foreground">{t("customApp.inUse")}</p> : null}
								<div className="grid gap-4 sm:grid-cols-2">
									{field("slackAppId", t("customApp.appId"))}
									{field("clientId", t("customApp.clientId"))}
									{field("clientSecret", t("customApp.clientSecret"), true)}
									{field("signingSecret", t("customApp.signingSecret"), true)}
								</div>
								<p className="text-xs text-muted-foreground">{t("customApp.secretsHelp")}</p>
								<div className="flex flex-wrap items-center gap-2">
									<Button type="button" onClick={save} disabled={busy}>{saving ? t("saving") : t("customApp.save")}</Button>
									{saved ? <Button type="button" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setProblem(null); setError(null); setDraft({ ...EMPTY_DRAFT, slackAppId: saved.slack_app_id, clientId: saved.client_id }); }}>{t("cancel")}</Button> : null}
								</div>
							</div>
						)}
						{error ? <SlackError error={error} /> : null}
					</>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}
