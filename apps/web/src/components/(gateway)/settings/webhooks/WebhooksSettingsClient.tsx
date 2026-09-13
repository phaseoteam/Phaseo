"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Copy, MoreHorizontal, RotateCw, Trash2, Webhook } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
	deleteWebhookEndpointAction,
	rotateWebhookEndpointSecretAction,
	updateWebhookEndpointStatusAction,
} from "@/app/(dashboard)/settings/webhooks/actions";
import { getWebhookEventLabel } from "./webhook-events";
import WebhookSecretNotice from "./WebhookSecretNotice";

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

type Props = { endpoints: WebhookEndpoint[] };
type RevealedSecret = { id: string; secret: string };

function formatDate(value: string | null) {
	if (!value) return "Never";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "Never" : date.toLocaleDateString();
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
	const [revealedSecret, setRevealedSecret] = useState<RevealedSecret | null>(null);
	const [deleteEndpoint, setDeleteEndpoint] = useState<WebhookEndpoint | null>(null);
	const [pendingEndpointId, setPendingEndpointId] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function runEndpointAction(
		id: string,
		action: () => Promise<unknown>,
		successMessage: string,
	) {
		setPendingEndpointId(id);
		startTransition(async () => {
			try {
				const result = await action();
				if (
					result &&
					typeof result === "object" &&
					"signingSecret" in result &&
					typeof result.signingSecret === "string"
				) {
					setRevealedSecret({ id, secret: result.signingSecret });
				}
				toast.success(successMessage);
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
			{revealedSecret ? <WebhookSecretNotice endpointId={revealedSecret.id} secret={revealedSecret.secret} /> : null}
			<AlertDialog open={deleteEndpoint !== null} onOpenChange={(open) => !open && setDeleteEndpoint(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {deleteEndpoint?.name ?? "this endpoint"}?</AlertDialogTitle>
						<AlertDialogDescription>New jobs will no longer deliver to this endpoint. Existing delivery history is retained.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep endpoint</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								if (!deleteEndpoint) return;
								const endpointId = deleteEndpoint.id;
								setDeleteEndpoint(null);
								runEndpointAction(endpointId, () => deleteWebhookEndpointAction(endpointId), "Endpoint deleted");
							}}
						>
							Delete endpoint
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{endpoints.length > 0 ? (
				<div className="space-y-3">
					{endpoints.map((endpoint) => {
						const pending = isPending && pendingEndpointId === endpoint.id;
						return (
							<div key={endpoint.id} className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
								<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
									<div className="flex min-w-0 items-start gap-3">
										<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
											<Webhook className="size-4" />
										</div>
										<div className="min-w-0">
											<div className="flex flex-wrap items-center gap-2">
												<h2 className="truncate font-medium">{endpoint.name}</h2>
												<Badge variant={endpoint.status === "active" ? "default" : "outline"}>
													{endpoint.status === "active" ? <CheckCircle2 className="mr-1 size-3" /> : null}
													{endpoint.status === "active" ? "Active" : "Paused"}
												</Badge>
											</div>
											<p className="mt-1 truncate text-sm text-muted-foreground">{endpoint.url}</p>
										</div>
									</div>
									<div className="flex items-center gap-2 self-end sm:self-start">
										<Button asChild variant="outline" size="sm">
											<Link href={`/settings/webhooks/${encodeURIComponent(endpoint.id)}`}>Edit</Link>
										</Button>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button size="icon" variant="ghost" disabled={pending} aria-label={`Actions for ${endpoint.name}`}>
													<MoreHorizontal className="size-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-56">
												<DropdownMenuItem onClick={() => copyToClipboard(endpoint.id, "Endpoint ID")}>
													<Copy className="mr-2 size-4" />
													Copy endpoint ID
												</DropdownMenuItem>
												<DropdownMenuItem onClick={() => runEndpointAction(endpoint.id, () => rotateWebhookEndpointSecretAction(endpoint.id), "Signing secret rotated")}>
													<RotateCw className="mr-2 size-4" />
													Rotate signing secret
												</DropdownMenuItem>
												<DropdownMenuItem onClick={() => runEndpointAction(endpoint.id, () => updateWebhookEndpointStatusAction(endpoint.id, endpoint.status === "active" ? "disabled" : "active"), endpoint.status === "active" ? "Endpoint paused" : "Endpoint enabled")}>
													{endpoint.status === "active" ? "Pause endpoint" : "Enable endpoint"}
												</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem variant="destructive" onClick={() => setDeleteEndpoint(endpoint)}>
														<Trash2 className="mr-2 size-4" />
														Delete endpoint
													</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								</div>

								<div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-end sm:justify-between">
									<div>
										<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subscribed events</p>
										<div className="mt-2 flex flex-wrap gap-1.5">
											{endpoint.events.map((event) => (
												<Badge key={event} variant="secondary" className="font-normal">{getWebhookEventLabel(event)}</Badge>
											))}
										</div>
									</div>
									<div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
										<p className="text-xs text-muted-foreground">Updated {formatDate(endpoint.updatedAt ?? endpoint.createdAt)}</p>
										<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
											<span>Endpoint ID</span>
											<code className="max-w-48 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{endpoint.id}</code>
											<Button type="button" variant="ghost" size="icon-xs" aria-label={`Copy endpoint ID for ${endpoint.name}`} onClick={() => copyToClipboard(endpoint.id, "Endpoint ID")}><Copy className="size-3" /></Button>
										</div>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<Empty className="rounded-xl border border-dashed border-border/80 p-10">
					<EmptyHeader>
						<EmptyMedia variant="icon"><Webhook className="size-5" /></EmptyMedia>
						<EmptyTitle>No webhook endpoints yet</EmptyTitle>
						<EmptyDescription>Create an endpoint to receive signed updates for your async video and batch jobs.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</div>
	);
}
