"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PrivateSettingsQuery, useSettingsRouter } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { disconnectConnectionAction, startConnectionAction } from "@/app/(dashboard)/settings/connections/actions";
import { CONNECTORS } from "./connectorsCatalog";

type Connection = {
	id: string;
	label_slug: string;
	display_name: string;
	server_url: string;
	status: "active" | "needs_reauth" | "revoked";
	last_used_at: string | null;
	created_at: string;
};

type ConnectionsData = { enabled: boolean; mcpUrl: string; connections: Connection[] };

const CALLBACK_ERRORS = ["access_denied", "state_expired", "state_invalid", "session_mismatch", "sign_in_required"] as const;

export default function ConnectionsSettings() {
	const t = useTranslations("SettingsUI.connections");
	return (
		<div className="mx-auto space-y-6">
			<SettingsPageHeader title={t("title")} description={t("description")} />
			<CallbackNotice />
			<PrivateSettingsQuery<ConnectionsData> path="/api/account/settings/connections">
				{(data) => data.enabled ? <ConnectionsBody data={data} /> : <p className="text-sm text-muted-foreground">{t("unavailable")}</p>}
			</PrivateSettingsQuery>
		</div>
	);
}

/** The OAuth callback redirects back here with ?connected=<label> or ?error=<code>. */
export function CallbackNotice() {
	const t = useTranslations("SettingsUI.connections");
	const params = useSearchParams();
	const connected = params.get("connected");
	const error = params.get("error");
	if (connected) return <p role="status" className="rounded-md border px-4 py-3 text-sm">{t("connectedNotice")}</p>;
	if (!error) return null;
	const known = (CALLBACK_ERRORS as readonly string[]).includes(error) ? error as (typeof CALLBACK_ERRORS)[number] : null;
	return <p role="alert" className="rounded-md border border-destructive/40 px-4 py-3 text-sm text-destructive">{known ? t(`errors.${known}`) : t("errors.generic")}</p>;
}

export function ConnectionsBody({ data }: { data: ConnectionsData }) {
	const t = useTranslations("SettingsUI.connections");
	const router = useSettingsRouter();
	const [pending, startTransition] = useTransition();
	const [busyUrl, setBusyUrl] = useState<string | null>(null);
	const [url, setUrl] = useState("");
	const [name, setName] = useState("");
	const byServer = new Map(data.connections.map((connection) => [connection.server_url, connection]));

	function connect(serverUrl: string, displayName: string) {
		setBusyUrl(serverUrl);
		startTransition(async () => {
			const result = await startConnectionAction(serverUrl, displayName);
			if (result.ok && result.mode === "authorize") {
				window.location.assign(result.authorizationUrl);
				return;
			}
			setBusyUrl(null);
			if (result.ok) {
				toast.success(t("connectedNotice"));
				setUrl("");
				setName("");
				router.refresh();
			} else {
				toast.error(result.message ?? t("errors.generic"));
			}
		});
	}

	return (
		<div className="space-y-8">
			<section className="space-y-3">
				<h2 className="text-base font-medium">{t("serverHeading")}</h2>
				<p className="text-sm text-muted-foreground">{t("serverHelp")}</p>
				<CommandLine value={data.mcpUrl} />
				<CommandLine value={`claude mcp add --transport http phaseo ${data.mcpUrl}`} />
				<p className="text-sm text-muted-foreground">{t("personalNote")}</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-base font-medium">{t("connectedHeading")}</h2>
				{data.connections.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : (
					<ul className="divide-y rounded-md border">
						{data.connections.map((connection) => (
							<li key={connection.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<span className="font-medium">{connection.display_name}</span>
										<Badge variant={connection.status === "active" ? "secondary" : "destructive"} className="rounded-md">{t(`status.${connection.status}`)}</Badge>
									</div>
									<p className="truncate font-mono text-xs text-muted-foreground">{connection.label_slug}__… · {connection.server_url}</p>
								</div>
								<div className="flex gap-2">
									{connection.status !== "active" ? (
										<Button size="sm" variant="outline" disabled={pending} onClick={() => connect(connection.server_url, connection.display_name)}>{t("reconnect")}</Button>
									) : null}
									<DisconnectButton connection={connection} onDone={() => router.refresh()} />
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			<section className="space-y-3">
				<h2 className="text-base font-medium">{t("catalogHeading")}</h2>
				<ul className="grid gap-2 sm:grid-cols-2">
					{CONNECTORS.map((connector) => {
						const existing = byServer.get(connector.serverUrl);
						return (
							<li key={connector.id} className="flex items-center justify-between gap-3 rounded-md border px-4 py-3">
								<div className="min-w-0">
									<p className="font-medium">{connector.name}</p>
									{connector.note ? <p className="text-xs text-muted-foreground">{t(`notes.${connector.note}`)}</p> : null}
								</div>
								<Button size="sm" variant={existing ? "outline" : "default"} disabled={pending} onClick={() => connect(connector.serverUrl, connector.name)}>
									{busyUrl === connector.serverUrl ? t("connecting") : existing ? t("reconnect") : t("connect")}
								</Button>
							</li>
						);
					})}
				</ul>
				<form
					className="grid gap-3 rounded-md border p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
					onSubmit={(event) => { event.preventDefault(); if (url.trim()) connect(url.trim(), name.trim()); }}
				>
					<div className="space-y-1.5">
						<Label htmlFor="mcp-server-url">{t("urlLabel")}</Label>
						<Input id="mcp-server-url" type="url" inputMode="url" required placeholder="https://example.com/mcp" value={url} onChange={(event) => setUrl(event.target.value)} />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="mcp-server-name">{t("nameLabel")}</Label>
						<Input id="mcp-server-name" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
					</div>
					<Button type="submit" disabled={pending || !url.trim()}>{busyUrl === url.trim() ? t("connecting") : t("addByUrl")}</Button>
				</form>
			</section>
		</div>
	);
}

function CommandLine({ value }: { value: string }) {
	return (
		<div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
			<code className="min-w-0 flex-1 truncate font-mono text-xs">{value}</code>
			<CopyButton content={value} size="sm" variant="ghost" />
		</div>
	);
}

function DisconnectButton({ connection, onDone }: { connection: Connection; onDone: () => void }) {
	const t = useTranslations("SettingsUI.connections");
	const [pending, startTransition] = useTransition();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild><Button size="sm" variant="ghost" disabled={pending}>{t("disconnect")}</Button></AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("disconnectTitle", { name: connection.display_name })}</AlertDialogTitle>
					<AlertDialogDescription>{t("disconnectBody")}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive text-white hover:bg-destructive/90"
						onClick={() => startTransition(async () => {
							const result = await disconnectConnectionAction(connection.id);
							if (result.ok) onDone();
							else toast.error(t("errors.disconnect"));
						})}
					>
						{t("disconnect")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
