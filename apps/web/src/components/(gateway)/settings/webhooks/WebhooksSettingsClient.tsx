"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { CheckCircle2, Copy, MoreHorizontal, Plus, RotateCw, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	createWebhookEndpointAction,
	deleteWebhookEndpointAction,
	rotateWebhookEndpointSecretAction,
	updateWebhookEndpointStatusAction,
} from "@/app/(dashboard)/settings/webhooks/actions";

const DEFAULT_EVENTS = [
	"batch.completed",
	"batch.failed",
	"batch.cancelled",
	"video.completed",
	"video.failed",
	"video.cancelled",
];

export type WebhookEndpoint = {
	id: string;
	name: string;
	url: string;
	status: "active" | "disabled" | "deleted";
	events: string[];
	hasSecret: boolean;
	createdAt: string | null;
	updatedAt: string | null;
};

type Props = {
	endpoints: WebhookEndpoint[];
};

type EndpointActionResult = {
	ok: boolean;
	signingSecret?: string;
};

function formatDate(value: string | null) {
	if (!value) return "Never";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Never";
	return date.toLocaleDateString();
}

function parseEvents(value: string): string[] {
	const events = value
		.split(",")
		.map((event) => event.trim().toLowerCase())
		.filter(Boolean);
	return [...new Set(events.length > 0 ? events : DEFAULT_EVENTS)];
}

async function copyToClipboard(value: string, label: string) {
	try {
		await navigator.clipboard.writeText(value);
		toast.success(`${label} copied`);
	} catch {
		toast.error(`Unable to copy ${label.toLowerCase()}`);
	}
}

export default function WebhooksSettingsClient({ endpoints }: Props) {
	const router = useRouter();
	const [name, setName] = useState("Async webhooks");
	const [url, setUrl] = useState("");
	const [events, setEvents] = useState(DEFAULT_EVENTS.join(", "));
	const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null);
	const [pendingEndpointId, setPendingEndpointId] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	const eventPreview = useMemo(() => parseEvents(events), [events]);

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		startTransition(async () => {
			try {
				const result = await createWebhookEndpointAction({
					name,
					url,
					events: eventPreview,
				});
				setRevealedSecret({ id: result.id, secret: result.signingSecret });
				setUrl("");
				toast.success("Webhook endpoint created");
				router.refresh();
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Failed to create webhook");
			}
		});
	}

	function runEndpointAction(id: string, action: () => Promise<EndpointActionResult>) {
		setPendingEndpointId(id);
		startTransition(async () => {
			try {
				const result = await action();
				if (result.signingSecret) {
					setRevealedSecret({ id, secret: result.signingSecret });
					toast.success("Signing secret rotated");
				} else {
					toast.success("Webhook endpoint updated");
				}
				router.refresh();
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Action failed");
			} finally {
				setPendingEndpointId(null);
			}
		});
	}

	return (
		<div className="space-y-5">
			<form
				onSubmit={submit}
				className="grid gap-3 rounded-md border border-border/60 p-4 md:grid-cols-[minmax(140px,180px)_minmax(220px,1fr)_minmax(180px,260px)_auto]"
			>
				<Input
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="Name"
					aria-label="Webhook name"
					maxLength={120}
				/>
				<Input
					value={url}
					onChange={(event) => setUrl(event.target.value)}
					placeholder="https://example.com/api/webhooks/aistats"
					aria-label="Webhook URL"
					type="url"
					required
				/>
				<Input
					value={events}
					onChange={(event) => setEvents(event.target.value)}
					placeholder="batch.completed, batch.failed"
					aria-label="Webhook events"
				/>
				<Button type="submit" disabled={isPending}>
					<Plus className="mr-2 h-4 w-4" />
					Create
				</Button>
			</form>

			{revealedSecret ? (
				<div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
					<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div className="min-w-0">
							<p className="font-medium">Signing secret</p>
							<code className="mt-1 block truncate rounded bg-background/70 px-2 py-1 font-mono text-xs">
								{revealedSecret.secret}
							</code>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => copyToClipboard(revealedSecret.secret, "Signing secret")}
						>
							<Copy className="mr-2 h-4 w-4" />
							Copy
						</Button>
					</div>
				</div>
			) : null}

			<div className="rounded-md border border-border/60">
				{endpoints.length > 0 ? (
					endpoints.map((endpoint) => {
						const pending = isPending && pendingEndpointId === endpoint.id;
						return (
							<div
								key={endpoint.id}
								className="grid items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_150px_130px_auto]"
							>
								<div className="min-w-0">
									<div className="flex min-w-0 items-center gap-2">
										<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted/70 text-muted-foreground">
											<Webhook className="h-4 w-4" />
										</div>
										<div className="min-w-0">
											<p className="truncate text-sm font-medium">{endpoint.name}</p>
											<p className="truncate text-xs text-muted-foreground">{endpoint.url}</p>
										</div>
									</div>
									<div className="mt-2 flex flex-wrap gap-1.5">
										{endpoint.events.slice(0, 4).map((event) => (
											<Badge key={event} variant="secondary" className="text-[10px]">
												{event}
											</Badge>
										))}
										{endpoint.events.length > 4 ? (
											<Badge variant="outline" className="text-[10px]">
												+{endpoint.events.length - 4}
											</Badge>
										) : null}
									</div>
								</div>
								<div className="text-xs text-muted-foreground">
									Updated {formatDate(endpoint.updatedAt ?? endpoint.createdAt)}
								</div>
								<div>
									<Badge variant={endpoint.status === "active" ? "default" : "outline"}>
										{endpoint.status === "active" ? (
											<CheckCircle2 className="mr-1 h-3 w-3" />
										) : null}
										{endpoint.status}
									</Badge>
								</div>
								<div className="flex justify-end">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button size="icon" variant="ghost" disabled={pending}>
												<MoreHorizontal className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end" className="w-52">
											<DropdownMenuItem
												onClick={() =>
													runEndpointAction(endpoint.id, () =>
														rotateWebhookEndpointSecretAction(endpoint.id),
													)
												}
											>
												<RotateCw className="mr-2 h-4 w-4" />
												Rotate signing secret
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() => copyToClipboard(endpoint.id, "Endpoint ID")}
											>
												<Copy className="mr-2 h-4 w-4" />
												Copy endpoint ID
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() =>
													runEndpointAction(endpoint.id, () =>
														updateWebhookEndpointStatusAction(
															endpoint.id,
															endpoint.status === "active" ? "disabled" : "active",
														),
													)
												}
											>
												{endpoint.status === "active" ? "Disable" : "Enable"}
											</DropdownMenuItem>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												className="text-red-600"
												onClick={() =>
													runEndpointAction(endpoint.id, () =>
														deleteWebhookEndpointAction(endpoint.id),
													)
												}
											>
												<Trash2 className="mr-2 h-4 w-4" />
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>
						);
					})
				) : (
					<div className="p-6 text-sm text-muted-foreground">
						No webhook endpoints configured.
					</div>
				)}
			</div>
		</div>
	);
}
