"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { ArrowLeft, Check, ChevronRight, Globe2, ListChecks, Save } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
	getWebhookEventsForUpdate,
	isKindSpecificWebhookEvent,
	normalizeWebhookEvents,
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
		const initial = normalizeWebhookEvents(initialEndpoint?.events ?? []);
		const supported = initial.filter((event) => WEBHOOK_EVENT_OPTIONS.some((option) => option.value === event));
		return supported.length > 0 ? supported : DEFAULT_WEBHOOK_EVENTS;
	});
	const [eventsChanged, setEventsChanged] = useState(mode === "create");
	const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null);
	const [isPending, startTransition] = useTransition();
	const allSelected = selectedEvents.length === WEBHOOK_EVENT_OPTIONS.length;
	const hasKindSpecificEvents = mode === "edit" && (initialEndpoint?.events ?? []).some(isKindSpecificWebhookEvent);
	const selectedLabels = useMemo(
		() => WEBHOOK_EVENT_OPTIONS.filter((option) => selectedEvents.includes(option.value)).map((option) => option.label),
		[selectedEvents],
	);

	function toggleEvent(value: string, checked: boolean) {
		setEventsChanged(true);
		setSelectedEvents((current) => {
			if (checked) return normalizeWebhookEvents([...current, value]);
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
		<form onSubmit={submit} className="space-y-5">
			<div className="flex items-center gap-3">
				<Button asChild variant="ghost" size="icon" className="rounded-md">
					<Link href="/settings/webhooks" aria-label="Back to Webhooks">
						<ArrowLeft className="size-4" />
					</Link>
				</Button>
				<div>
					<p className="text-sm font-medium">{mode === "create" ? "New endpoint" : "Edit endpoint"}</p>
					<p className="text-xs text-muted-foreground">Three quick steps to control what your app receives.</p>
				</div>
			</div>

			<Card>
				<CardHeader className="border-b">
					<CardTitle className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">1</span>Destination</CardTitle>
					<CardDescription>Give this endpoint a name and the public HTTPS URL that should receive deliveries.</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 pt-5 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
					<div className="space-y-2">
						<Label htmlFor="webhook-name">Endpoint name</Label>
						<Input id="webhook-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Production worker" maxLength={120} required />
						<p className="text-xs text-muted-foreground">Only you see this label.</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="webhook-url">Destination URL</Label>
						<div className="relative">
							<Globe2 className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input id="webhook-url" className="pl-9" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://your-app.example.com/webhooks/phaseo" type="url" required />
						</div>
						<p className="text-xs text-muted-foreground">Use a public HTTPS endpoint. Local and private network addresses are blocked.</p>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="border-b">
					<CardTitle className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">2</span>Events</CardTitle>
					<CardDescription>Choose the updates you want to receive. These defaults apply when a job does not specify its own event list.</CardDescription>
				</CardHeader>
				<CardContent className="pt-5">
					{hasKindSpecificEvents ? (
						<Alert className="mb-4 border-border/70 bg-muted/25">
							<AlertTitle>Existing kind-specific subscriptions</AlertTitle>
							<AlertDescription>Video- or batch-only subscriptions are preserved when you save other changes. Changing this selection switches the endpoint to the job-wide events shown below.</AlertDescription>
						</Alert>
					) : null}
					<div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/45 px-3 py-2.5 text-sm">
						<div className="flex items-center gap-2"><ListChecks className="size-4 text-muted-foreground" /><span><span className="font-medium">{selectedEvents.length}</span> of {WEBHOOK_EVENT_OPTIONS.length} selected</span></div>
						<Button type="button" variant="ghost" size="sm" onClick={() => { setEventsChanged(true); setSelectedEvents(allSelected ? [] : WEBHOOK_EVENT_OPTIONS.map((option) => option.value)); }}>{allSelected ? "Clear all" : "Select all"}</Button>
					</div>
					<div className="grid gap-2 md:grid-cols-2">
						{WEBHOOK_EVENT_OPTIONS.map((option) => {
							const checked = selectedEvents.includes(option.value);
							return (
								<label key={option.value} htmlFor={`event-${option.value}`} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 transition-colors hover:bg-muted/35 has-aria-checked:border-primary/50 has-aria-checked:bg-primary/5">
									<Checkbox id={`event-${option.value}`} checked={checked} onCheckedChange={(value) => toggleEvent(option.value, value === true)} className="mt-0.5" />
									<span className="min-w-0">
										<span className="flex items-center gap-2 text-sm font-medium">{option.label}{checked ? <Check className="size-3.5 text-primary" /> : null}</span>
										<span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
									</span>
								</label>
							);
						})}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="border-b">
					<CardTitle className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">3</span>Review and save</CardTitle>
					<CardDescription>We sign every delivery so your server can verify that it came from Phaseo.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4 pt-5">
					<div className="grid gap-4 text-sm sm:grid-cols-2">
						<div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Destination</p><p className="mt-1 break-all font-medium">{url || "Add a destination URL above"}</p></div>
						<div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Events</p><div className="mt-1 flex flex-wrap gap-1.5">{selectedLabels.length ? selectedLabels.map((label) => <Badge key={label} variant="secondary" className="font-normal">{label}</Badge>) : <span className="text-muted-foreground">Choose at least one event</span>}</div></div>
					</div>
					<Alert className="border-border/70 bg-muted/25">
						<ChevronRight className="size-4" />
						<AlertTitle>Delivery details</AlertTitle>
						<AlertDescription>Deliveries include an event ID for deduplication and retry automatically after temporary failures. See the <a className="underline underline-offset-4" href="https://phaseo.app/docs/v1/guides/async-video-and-batch" target="_blank" rel="noreferrer">async jobs guide</a> for verification and retry details.</AlertDescription>
					</Alert>
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button asChild type="button" variant="outline"><Link href="/settings/webhooks">Cancel</Link></Button>
						<Button type="submit" disabled={isPending || !url || !name.trim() || selectedEvents.length === 0}><Save className="mr-2 size-4" />{isPending ? "Saving…" : mode === "create" ? "Create endpoint" : "Save changes"}</Button>
					</div>
				</CardContent>
			</Card>

			{revealedSecret ? <WebhookSecretNotice endpointId={revealedSecret.id} secret={revealedSecret.secret} /> : null}
		</form>
	);
}
