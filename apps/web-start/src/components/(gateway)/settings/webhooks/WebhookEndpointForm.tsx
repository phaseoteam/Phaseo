"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getLocalizedDocsHref } from "@/lib/docs";
import { localizedSettingsError } from "@/i18n/error-messages";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { FormEvent, useState, useTransition } from "react";
import { ArrowLeft, Globe2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	createWebhookEndpointAction,
	sendWebhookEndpointTestAction,
	updateWebhookEndpointAction,
} from "@/app/(dashboard)/settings/webhooks/actions";
import type { WebhookEndpoint } from "./WebhooksSettingsClient";
import {
	DEFAULT_WEBHOOK_EVENTS,
	expandGenericWebhookEvents,
	getWebhookEventsForUpdate,
	WEBHOOK_EVENT_GROUPS,
	WEBHOOK_EVENT_OPTIONS,
} from "@/components/(gateway)/settings/webhooks/webhook-events";
import WebhookSecretNotice from "./WebhookSecretNotice";

export default function WebhookEndpointForm({
	mode,
	initialEndpoint,
}: {
	mode: "create" | "edit";
	initialEndpoint?: WebhookEndpoint;
}) {
	const router = useRouter();
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const write = useSettingsWrite();
	const [name, setName] = useState(initialEndpoint?.name ?? t("webhookFormCopy.defaultName"));
	const [url, setUrl] = useState(initialEndpoint?.url ?? "");
	const [selectedEvents, setSelectedEvents] = useState<string[]>(() => {
		const initial = expandGenericWebhookEvents(initialEndpoint?.events ?? []);
		const supported = initial.filter((event) => WEBHOOK_EVENT_OPTIONS.some((option) => option.value === event));
		return supported.length > 0 ? supported : DEFAULT_WEBHOOK_EVENTS;
	});
	const [eventsChanged, setEventsChanged] = useState(mode === "create");
	const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null);
	const [isTesting, setIsTesting] = useState(false);
	const [isPending, startTransition] = useTransition();
	const phaseLabels = {created: t("webhookFormCopy.created"), status_changed: t("webhookFormCopy.statusChanges"), progress: t("webhookFormCopy.progressUpdates"), completed: t("webhookFormCopy.completed"), failed: t("webhookFormCopy.failed"), cancelled: t("webhookFormCopy.cancelled"), expired: t("webhookFormCopy.expired")};
	const phaseDescriptions = {created: t("webhookFormCopy.createdHelp"), status_changed: t("webhookFormCopy.statusChangedHelp"), progress: t("webhookFormCopy.progressHelp"), completed: t("webhookFormCopy.completedHelp"), failed: t("webhookFormCopy.failedHelp"), cancelled: t("webhookFormCopy.cancelledHelp"), expired: t("webhookFormCopy.expiredHelp")};
	const allSelected = selectedEvents.length === WEBHOOK_EVENT_OPTIONS.length;

	function toggleEvent(value: string, checked: boolean) {
		setEventsChanged(true);
		setSelectedEvents((current) => {
			if (checked) return [...new Set([...current, value])];
			return current.filter((event) => event !== value);
		});
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (selectedEvents.length === 0) {
			toast.error(t("webhookFormCopy.eventRequired"));
			return;
		}
		startTransition(async () => {
			try {
				if (mode === "create") {
					const result = await write(createWebhookEndpointAction({ name, url, events: selectedEvents }));
					setRevealedSecret({ id: result.id, secret: result.signingSecret });
					toast.success(t("webhookFormCopy.webhookEndpointCreated"));
				} else if (initialEndpoint) {
					const eventUpdate = getWebhookEventsForUpdate(mode, selectedEvents, eventsChanged);
					await write(updateWebhookEndpointAction(initialEndpoint.id, {
						name,
						url,
						...(eventUpdate ? { events: eventUpdate } : {}),
					}));
					toast.success(t("webhookFormCopy.webhookEndpointUpdated"));
					router.push("/settings/webhooks");
				}
			} catch (error) {
				toast.error(localizedSettingsError(error, t, "Unable to save webhook endpoint", t("webhookFormCopy.saveFailed")));
			}
		});
	}

	async function sendTest() {
		if (!initialEndpoint) return;
		setIsTesting(true);
		try {
			const result = await write(sendWebhookEndpointTestAction(initialEndpoint.id));
			toast.success(result.status_code ? t("webhookFormCopy.testDeliveredStatus", {status: result.status_code}) : t("webhookFormCopy.testDelivered"));
		} catch (error) {
			toast.error(localizedSettingsError(error, t, "Test delivery failed", t("webhookFormCopy.testFailed")));
		} finally {
			setIsTesting(false);
		}
	}

	return (
		<form onSubmit={submit} className="max-w-4xl space-y-6">
			<Button asChild type="button" variant="ghost" size="sm" className="-ml-3 w-fit text-muted-foreground">
				<Link href="/settings/webhooks">
					<ArrowLeft className="size-4" />
					{t("webhookFormCopy.back")}
				</Link>
			</Button>

			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0 flex-1">
					<Label htmlFor="webhook-name" className="sr-only">{t("webhookFormCopy.name")}</Label>
					<input
						id="webhook-name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={t("webhookFormCopy.namePlaceholder")}
						maxLength={120}
						required
						className="block w-full min-w-0 bg-transparent py-1 text-3xl font-semibold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/70"
					/>
					<p className="mt-1 text-sm text-muted-foreground">{t("webhookFormCopy.intro")}</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Link href="/settings/webhooks" className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted">{t("webhookFormCopy.cancel")}</Link>
					<Button type="submit" disabled={isPending || !url || !name.trim() || selectedEvents.length === 0}><Save className="size-4" />{isPending ? t("webhookFormCopy.saving") : mode === "create" ? t("webhookFormCopy.create") : t("webhookFormCopy.save")}</Button>
				</div>
			</div>

			<section className="grid gap-5 border-b border-border/60 pb-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-10">
				<div>
					<h2 className="text-sm font-medium">{t("webhookFormCopy.destination")}</h2>
					<p className="mt-1 text-sm leading-5 text-muted-foreground">{t("webhookFormCopy.destinationHelp")}</p>
				</div>
				<div className="space-y-5">
					<div className="space-y-2">
						<Label htmlFor="webhook-url">{t("webhookFormCopy.destinationUrl")}</Label>
						<div className="relative">
							<Globe2 className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input id="webhook-url" className="pl-9" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://your-app.example.com/webhooks/phaseo" type="url" required />
						</div>
						<p className="text-xs text-muted-foreground">{t("webhookFormCopy.httpsRequired")}</p>
						{initialEndpoint ? <div className="flex items-center justify-between gap-3 pt-1"><p className="text-xs text-muted-foreground">{t.rich("webhookFormCopy.signedTest", {code: (chunks) => <code className="font-mono text-foreground">{chunks}</code>})}</p><Button type="button" variant="outline" size="sm" disabled={isTesting || isPending || url !== initialEndpoint.url || initialEndpoint.status !== "active"} onClick={() => void sendTest()}><Send className="size-3.5" />{isTesting ? t("webhookFormCopy.sending") : t("webhookFormCopy.sendTest")}</Button></div> : <p className="text-xs text-muted-foreground">{t("webhookFormCopy.testAfterCreate")}</p>}
					</div>
				</div>
			</section>

			<section className="grid gap-5 border-b border-border/60 py-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-10">
				<div>
					<h2 className="text-sm font-medium">{t("webhookFormCopy.events")}</h2>
					<p className="mt-1 text-sm leading-5 text-muted-foreground">{t("webhookFormCopy.eventHelp")}</p>
				</div>
				<div>
					<div className="mb-5 flex items-center justify-between gap-3 text-sm">
						<span className="text-muted-foreground">{t("webhookFormCopy.selectedCount", {count: selectedEvents.length, total: WEBHOOK_EVENT_OPTIONS.length})}</span>
						<Button type="button" variant="outline" size="sm" onClick={() => { setEventsChanged(true); setSelectedEvents(allSelected ? [] : WEBHOOK_EVENT_OPTIONS.map((option) => option.value)); }}>{allSelected ? t("webhookFormCopy.clearAll") : t("webhookFormCopy.selectAll")}</Button>
					</div>
					<div className="grid gap-6 lg:grid-cols-2">
						{WEBHOOK_EVENT_GROUPS.map((group) => (
							<fieldset key={group.kind} aria-labelledby={`${group.kind}-events-heading`} className="min-w-0">
								<div className="mb-2 flex min-h-10 items-end justify-between gap-3">
									<div><h3 id={`${group.kind}-events-heading`} className="text-sm font-medium">{t(group.kind === "batch" ? "webhookFormCopy.batchEvents" : "webhookFormCopy.videoEvents")}</h3><p className="text-xs text-muted-foreground">{t(group.kind === "batch" ? "webhookFormCopy.batchHelp" : "webhookFormCopy.videoHelp")}</p></div>
									<Button type="button" variant="ghost" size="xs" onClick={() => {
										setEventsChanged(true);
										const groupValues: string[] = group.options.map((option) => option.value);
										const groupSelected = groupValues.every((value) => selectedEvents.includes(value));
										setSelectedEvents((current) => groupSelected ? current.filter((value) => !groupValues.includes(value)) : [...new Set([...current, ...groupValues])]);
									}}>{group.options.every((option) => selectedEvents.includes(option.value)) ? t("webhookFormCopy.clear") : t("webhookFormCopy.selectAll")}</Button>
								</div>
								<div className="divide-y divide-border/60 rounded-md border border-border/60">
								{group.options.map((option) => {
									const checked = selectedEvents.includes(option.value);
									return <label key={option.value} htmlFor={`event-${option.value}`} className="flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/35"><Checkbox id={`event-${option.value}`} checked={checked} onCheckedChange={(value) => toggleEvent(option.value, value === true)} className="mt-0.5" /><span className="min-w-0"><span className="block text-sm font-medium">{phaseLabels[option.phase]}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{phaseDescriptions[option.phase]}</span></span></label>;
								})}
								</div>
							</fieldset>
						))}
					</div>
					<p className="mt-4 text-xs leading-5 text-muted-foreground">{t("webhookFormCopy.defaultsHelp")}</p>
				</div>
			</section>

			<div className="pb-6">
				<p className="max-w-xl text-xs leading-5 text-muted-foreground">{t("webhookFormCopy.deliveryHelp")} <a className="underline underline-offset-4 hover:text-foreground" href={getLocalizedDocsHref(locale, "v1/guides/async-video-and-batch")} target="_blank" rel="noreferrer">{t("webhookFormCopy.guide")}</a>.</p>
			</div>

			{revealedSecret ? <WebhookSecretNotice endpointId={revealedSecret.id} secret={revealedSecret.secret} /> : null}
		</form>
	);
}
