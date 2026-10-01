"use client";

import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { useState, useTransition } from "react";
import { CheckCircle2, Copy, MoreHorizontal, RotateCw, Send, Trash2, Webhook } from "lucide-react";
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
	sendWebhookEndpointTestAction,
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

function formatDate(value: string | null, locale: string, never: string) {
	if (!value) return never;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? never : date.toLocaleDateString(locale);
}

export default function WebhooksSettingsClient({ endpoints }: Props) {
	const write = useSettingsWrite();
	const locale = useLocale();
	const t = useTranslations("SettingsUI");
	const w = useTranslations("Product.webhookControls");
	async function copyToClipboard(value: string, label: string) {
		try { await navigator.clipboard.writeText(value); toast.success(w("copiedLabel", { label })); }
		catch { toast.error(w("copyFailed", { label })); }
	}
	const eventLabels = {
		batch: t("usageViewFilters.batch"), video: t("usageViewFilters.video"), allJobs: w("allJobs"),
		phases: { created: t("strings.Created" as never), status_changed: w("statusChanges"), progress: w("progressUpdates"), completed: t("usageViewFilters.completed"), failed: t("usageViewFilters.failed"), cancelled: t("usageViewFilters.cancelled"), expired: t("usageViewFilters.expired") },
	};
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
				const result = await write(action());
				if (
					result &&
					typeof result === "object" &&
					"signingSecret" in result &&
					typeof result.signingSecret === "string"
				) {
					setRevealedSecret({ id, secret: result.signingSecret });
				}
				toast.success(successMessage);
			} catch (error) {
				toast.error(error instanceof Error ? error.message : t("strings.Action failed" as never));
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
						<AlertDialogTitle>{w("deleteNamed", { name: deleteEndpoint?.name ?? w("thisEndpoint") })}</AlertDialogTitle>
						<AlertDialogDescription>{w("deleteDescription")}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{w("keepEndpoint")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								if (!deleteEndpoint) return;
								const endpointId = deleteEndpoint.id;
								setDeleteEndpoint(null);
								runEndpointAction(endpointId, () => deleteWebhookEndpointAction(endpointId), w("endpointDeleted"));
							}}
						>
							{w("deleteEndpoint")}
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
													{endpoint.status === "active" ? t("strings.Active" as never) : t("routingStudio.paused")}
												</Badge>
											</div>
											<p className="mt-1 truncate text-sm text-muted-foreground">{endpoint.url}</p>
										</div>
									</div>
									<div className="flex items-center gap-2 self-end sm:self-start">
										<Button asChild variant="outline" size="sm">
											<Link href={`/settings/webhooks/${encodeURIComponent(endpoint.id)}`}>{t("strings.Edit" as never)}</Link>
										</Button>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button size="icon" variant="ghost" disabled={pending} aria-label={w("actionsFor", { name: endpoint.name })}>
													<MoreHorizontal className="size-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-56">
												<DropdownMenuItem onClick={() => copyToClipboard(endpoint.id, t("strings.Endpoint ID" as never))}>
													<Copy className="mr-2 size-4" />
													{t("strings.Copy endpoint ID" as never)}
												</DropdownMenuItem>
								<DropdownMenuItem onClick={() => runEndpointAction(endpoint.id, () => rotateWebhookEndpointSecretAction(endpoint.id), t("strings.Signing secret rotated" as never))}>
													<RotateCw className="mr-2 size-4" />
													{t("strings.Rotate signing secret" as never)}
								</DropdownMenuItem>
								<DropdownMenuItem disabled={endpoint.status !== "active"} onClick={() => runEndpointAction(endpoint.id, () => sendWebhookEndpointTestAction(endpoint.id), w("testDelivered"))}>
									<Send className="mr-2 size-4" />
									{w("sendTest")}
								</DropdownMenuItem>
												<DropdownMenuItem onClick={() => runEndpointAction(endpoint.id, () => updateWebhookEndpointStatusAction(endpoint.id, endpoint.status === "active" ? "disabled" : "active"), endpoint.status === "active" ? w("endpointPaused") : w("endpointEnabled"))}>
													{endpoint.status === "active" ? w("pauseEndpoint") : w("enableEndpoint")}
												</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem variant="destructive" onClick={() => setDeleteEndpoint(endpoint)}>
														<Trash2 className="mr-2 size-4" />
														{w("deleteEndpoint")}
													</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								</div>

								<div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-end sm:justify-between">
									<div>
										<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("strings.Subscribed events" as never)}</p>
										<div className="mt-2 flex flex-wrap gap-1.5">
											{endpoint.events.map((event) => (
												<Badge key={event} variant="secondary" className="font-normal">{getWebhookEventLabel(event, eventLabels)}</Badge>
											))}
										</div>
									</div>
									<div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
										<p className="text-xs text-muted-foreground">{w("updatedOn", { date: formatDate(endpoint.updatedAt ?? endpoint.createdAt, locale, t("settingsPageCopy.webhookNever")) })}</p>
										<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
											<span>{t("strings.Endpoint ID" as never)}</span>
											<code className="max-w-48 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{endpoint.id}</code>
											<Button type="button" variant="ghost" size="icon-xs" aria-label={w("copyIdFor", { name: endpoint.name })} onClick={() => copyToClipboard(endpoint.id, t("strings.Endpoint ID" as never))}><Copy className="size-3" /></Button>
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
						<EmptyTitle>{w("noEndpoints")}</EmptyTitle>
						<EmptyDescription>{w("createDescription")}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</div>
	);
}
