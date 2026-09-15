"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { ArrowLeft, Globe2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	createWebhookEndpointAction,
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
	const [name, setName] = useState(initialEndpoint?.name ?? "Async job updates");
	const [url, setUrl] = useState(initialEndpoint?.url ?? "");
	const [selectedEvents, setSelectedEvents] = useState<string[]>(() => {
		const initial = expandGenericWebhookEvents(initialEndpoint?.events ?? []);
		const supported = initial.filter((event) => WEBHOOK_EVENT_OPTIONS.some((option) => option.value === event));
		return supported.length > 0 ? supported : DEFAULT_WEBHOOK_EVENTS;
	});
	const [eventsChanged, setEventsChanged] = useState(mode === "create");
	const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null);
	const [isPending, startTransition] = useTransition();
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
			toast.error("Choose at least one event");
			return;
		}
		startTransition(async () => {
			try {
				if (mode === "create") {
					const result = await createWebhookEndpointAction({ name, url, events: selectedEvents });
					setRevealedSecret({ id: result.id, secret: result.signingSecret });
					toast.success("Webhook endpoint created");
				} else if (initialEndpoint) {
					const eventUpdate = getWebhookEventsForUpdate(mode, selectedEvents, eventsChanged);
					await updateWebhookEndpointAction(initialEndpoint.id, {
						name,
						url,
						...(eventUpdate ? { events: eventUpdate } : {}),
					});
					toast.success("Webhook endpoint updated");
					router.push("/settings/webhooks");
				}
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Unable to save webhook endpoint");
			}
		});
	}

	return (
		<form onSubmit={submit} className="max-w-4xl space-y-6">
			<Link href="/settings/webhooks" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
				<ArrowLeft className="size-4" />
				Back to Webhooks
			</Link>

			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0 flex-1">
					<Label htmlFor="webhook-name" className="sr-only">Endpoint name</Label>
					<input
						id="webhook-name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Webhook endpoint"
						maxLength={120}
						required
						className="block w-full min-w-0 bg-transparent py-1 text-3xl font-semibold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/70"
					/>
					<p className="mt-1 text-sm text-muted-foreground">Choose where Phaseo sends signed updates for your async jobs.</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Link href="/settings/webhooks" className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted">Cancel</Link>
					<Button type="submit" disabled={isPending || !url || !name.trim() || selectedEvents.length === 0}><Save className="size-4" />{isPending ? "Saving…" : mode === "create" ? "Create" : "Save"}</Button>
				</div>
			</div>

			<section className="grid gap-5 border-b border-border/60 pb-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-10">
				<div>
					<h2 className="text-sm font-medium">Destination</h2>
					<p className="mt-1 text-sm leading-5 text-muted-foreground">Where webhook deliveries should be sent.</p>
				</div>
				<div className="space-y-5">
					<div className="space-y-2">
						<Label htmlFor="webhook-url">Destination URL</Label>
						<div className="relative">
							<Globe2 className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input id="webhook-url" className="pl-9" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://your-app.example.com/webhooks/phaseo" type="url" required />
						</div>
						<p className="text-xs text-muted-foreground">Use a public HTTPS endpoint. Local and private network addresses are blocked.</p>
					</div>
				</div>
			</section>

			<section className="grid gap-5 border-b border-border/60 py-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-10">
				<div>
					<h2 className="text-sm font-medium">Events</h2>
					<p className="mt-1 text-sm leading-5 text-muted-foreground">Choose which updates this endpoint receives.</p>
				</div>
				<div>
					<div className="mb-5 flex items-center justify-between gap-3 text-sm">
						<span className="text-muted-foreground"><span className="font-medium text-foreground">{selectedEvents.length}</span> of {WEBHOOK_EVENT_OPTIONS.length} selected</span>
						<Button type="button" variant="outline" size="sm" onClick={() => { setEventsChanged(true); setSelectedEvents(allSelected ? [] : WEBHOOK_EVENT_OPTIONS.map((option) => option.value)); }}>{allSelected ? "Clear all" : "Select all"}</Button>
					</div>
					<div className="grid gap-6 lg:grid-cols-2">
						{WEBHOOK_EVENT_GROUPS.map((group) => (
							<fieldset key={group.kind} aria-labelledby={`${group.kind}-events-heading`} className="min-w-0">
								<div className="mb-2 flex min-h-10 items-end justify-between gap-3">
									<div><h3 id={`${group.kind}-events-heading`} className="text-sm font-medium">{group.label}</h3><p className="text-xs text-muted-foreground">{group.description}</p></div>
									<Button type="button" variant="ghost" size="xs" onClick={() => {
										setEventsChanged(true);
										const groupValues: string[] = group.options.map((option) => option.value);
										const groupSelected = groupValues.every((value) => selectedEvents.includes(value));
										setSelectedEvents((current) => groupSelected ? current.filter((value) => !groupValues.includes(value)) : [...new Set([...current, ...groupValues])]);
									}}>{group.options.every((option) => selectedEvents.includes(option.value)) ? "Clear" : "Select all"}</Button>
								</div>
								<div className="divide-y divide-border/60 rounded-md border border-border/60">
								{group.options.map((option) => {
									const checked = selectedEvents.includes(option.value);
									return <label key={option.value} htmlFor={`event-${option.value}`} className="flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/35"><Checkbox id={`event-${option.value}`} checked={checked} onCheckedChange={(value) => toggleEvent(option.value, value === true)} className="mt-0.5" /><span className="min-w-0"><span className="block text-sm font-medium">{option.label}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{option.description}</span></span></label>;
								})}
								</div>
							</fieldset>
						))}
					</div>
					<p className="mt-4 text-xs leading-5 text-muted-foreground">These defaults apply when a job does not specify its own event list.</p>
				</div>
			</section>

			<div className="pb-6">
				<p className="max-w-xl text-xs leading-5 text-muted-foreground">Deliveries are signed and include an event ID for deduplication. Temporary failures are retried automatically. <a className="underline underline-offset-4 hover:text-foreground" href="https://phaseo.app/docs/v1/guides/async-video-and-batch" target="_blank" rel="noreferrer">View the async jobs guide</a>.</p>
			</div>

			{revealedSecret ? <WebhookSecretNotice endpointId={revealedSecret.id} secret={revealedSecret.secret} /> : null}
		</form>
	);
}
