"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "@/i18n/react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DisplayDateTime } from "@/components/display/DisplayValue";
import { cn } from "@/lib/utils";
import { KEY_STORAGE_CATEGORIES, KEY_STORAGE_LOCATIONS } from "@/components/(gateway)/settings/keys/keyStorageLocations";
import { KeyStorageLogo, useKeyStorageLocationName } from "@/components/(gateway)/settings/keys/KeyStorageLocationPicker";
import { applyKeyIncident, previewKeyIncident } from "./actions";
import type { KeyIncident, KeyIncidentAction } from "./types";

/** A datetime-local value for now, in the browser's time zone. */
function localNow() {
	const now = new Date();
	return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function KeyIncidents({ incidents }: { incidents: KeyIncident[] }) {
	const t = useTranslations("SettingsUI");
	const nameOf = useKeyStorageLocationName();
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [locationId, setLocationId] = useState("railway");
	const [action, setAction] = useState<KeyIncidentAction>("revoke");
	const [cutoff, setCutoff] = useState(localNow);
	const [title, setTitle] = useState("");
	const [message, setMessage] = useState("");
	const [sourceUrl, setSourceUrl] = useState("");
	const [confirm, setConfirm] = useState("");
	const [preview, setPreview] = useState<{ keys: number; workspaces: number; scope: string } | null>(null);
	// One id per incident: a retry after a failure can't declare it twice.
	const [requestId, setRequestId] = useState(() => crypto.randomUUID());

	const keysCreatedBefore = cutoff ? new Date(cutoff).toISOString() : "";
	const scope = { locationId, action, keysCreatedBefore };
	const scopeKey = JSON.stringify(scope);
	// The preview only counts for the scope it was run with.
	const current = preview?.scope === scopeKey ? preview : null;
	const canApply = Boolean(current && current.keys > 0 && title.trim() && message.trim() && confirm === locationId && !pending);

	function runPreview() {
		startTransition(async () => {
			const result = await previewKeyIncident(scope);
			if (result.ok === false) { toast.error(result.message ?? t("keyIncidents.failed")); return; }
			setPreview({ keys: result.keys, workspaces: result.workspaces, scope: scopeKey });
		});
	}

	function apply() {
		startTransition(async () => {
			const result = await applyKeyIncident({ ...scope, title: title.trim(), customerMessage: message.trim(), sourceUrl: sourceUrl.trim() || null, confirmLocationId: confirm, requestId });
			if (result.ok === false) { toast.error(result.message ?? t("keyIncidents.failed")); return; }
			setRequestId(crypto.randomUUID());
			toast.success(t("keyIncidents.applied", { keys: result.keys, workspaces: result.workspaces, emails: result.emails }));
			setPreview(null); setConfirm(""); setTitle(""); setMessage(""); setSourceUrl("");
			router.refresh();
		});
	}

	return (
		<div className="space-y-10">
			<section className="space-y-5 rounded-md border p-5">
				<h2 className="text-base font-semibold">{t("keyIncidents.declare")}</h2>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<label htmlFor="incident-location" className="text-sm font-medium">{t("keyIncidents.platform")}</label>
						<select id="incident-location" value={locationId} onChange={(event) => setLocationId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
							{KEY_STORAGE_CATEGORIES.map((category) => (
								<optgroup key={category} label={t(`keyStorage.categories.${category}` as never)}>
									{KEY_STORAGE_LOCATIONS.filter((location) => location.category === category).map((location) => (
										<option key={location.id} value={location.id}>{nameOf(location.id)} ({location.id})</option>
									))}
								</optgroup>
							))}
						</select>
					</div>
					<div className="space-y-2">
						<label htmlFor="incident-cutoff" className="text-sm font-medium">{t("keyIncidents.cutoff")}</label>
						<Input id="incident-cutoff" type="datetime-local" value={cutoff} onChange={(event) => setCutoff(event.target.value)} />
						<p className="text-xs text-muted-foreground">{t("keyIncidents.cutoffHelp")}</p>
					</div>
				</div>
				<fieldset className="space-y-2">
					<legend className="text-sm font-medium">{t("keyIncidents.action")}</legend>
					<div className="grid gap-2 sm:grid-cols-2">
						{(["revoke", "pause"] as const).map((value) => (
							<button key={value} type="button" aria-pressed={action === value} onClick={() => setAction(value)}
								className={cn("rounded-md border p-3 text-left text-sm", action === value ? "border-foreground bg-muted/60" : "border-border hover:border-foreground/40")}>
								<div className="font-medium">{value === "revoke" ? t("keyIncidents.revoke") : t("keyIncidents.pause")}</div>
								<div className="mt-1 text-xs text-muted-foreground">{value === "revoke" ? t("keyIncidents.revokeHelp") : t("keyIncidents.pauseHelp")}</div>
							</button>
						))}
					</div>
				</fieldset>
				<div className="space-y-2">
					<label htmlFor="incident-title" className="text-sm font-medium">{t("keyIncidents.incidentTitle")}</label>
					<Input id="incident-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder={t("keyIncidents.titlePlaceholder")} />
				</div>
				<div className="space-y-2">
					<label htmlFor="incident-message" className="text-sm font-medium">{t("keyIncidents.message")}</label>
					<Textarea id="incident-message" value={message} maxLength={2000} rows={4} onChange={(event) => setMessage(event.target.value)} />
					<p className="text-xs text-muted-foreground">{t("keyIncidents.messageHelp")}</p>
				</div>
				<div className="space-y-2">
					<label htmlFor="incident-source" className="text-sm font-medium">{t("keyIncidents.source")}</label>
					<Input id="incident-source" type="url" value={sourceUrl} maxLength={500} onChange={(event) => setSourceUrl(event.target.value)} />
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<Button type="button" variant="outline" className="rounded-md" disabled={pending || !keysCreatedBefore} onClick={runPreview}>{t("keyIncidents.preview")}</Button>
					{current ? (
						<p className="text-sm">
							<KeyStorageLogo id={locationId} className="mr-1.5 inline-block align-[-2px]" />
							{action === "revoke"
								? t("keyIncidents.previewRevoke", { keys: current.keys, workspaces: current.workspaces })
								: t("keyIncidents.previewPause", { keys: current.keys, workspaces: current.workspaces })}
						</p>
					) : null}
				</div>

				{current && current.keys > 0 ? (
					<div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
						<p className="text-sm">{t("keyIncidents.warning", { name: nameOf(locationId) })}</p>
						<label htmlFor="incident-confirm" className="text-sm font-medium">{t("keyIncidents.confirm", { id: locationId })}</label>
						<Input id="incident-confirm" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" placeholder={locationId} />
						<Button type="button" variant="destructive" className="rounded-md" disabled={!canApply} onClick={apply}>
							{action === "revoke" ? t("keyIncidents.applyRevoke", { keys: current.keys }) : t("keyIncidents.applyPause", { keys: current.keys })}
						</Button>
					</div>
				) : null}
			</section>

			<section className="space-y-3">
				<h2 className="text-base font-semibold">{t("keyIncidents.history")}</h2>
				{incidents.length === 0 ? <p className="text-sm text-muted-foreground">{t("keyIncidents.none")}</p> : (
					<ul className="divide-y rounded-md border">
						{incidents.map((incident) => (
							<li key={incident.id} className="space-y-1 p-4 text-sm">
								<div className="flex flex-wrap items-center gap-2">
									<KeyStorageLogo id={incident.location_id} />
									<span className="font-medium">{incident.title}</span>
									<span className="text-muted-foreground">· {incident.action === "revoke" ? t("keyIncidents.revoke") : t("keyIncidents.pause")}</span>
								</div>
								<p className="text-muted-foreground">
									{incident.applied_at
										? t("keyIncidents.changed", { keys: incident.affected_keys ?? 0, workspaces: incident.affected_workspaces ?? 0 })
										: t("keyIncidents.notApplied")}
									{" · "}<DisplayDateTime value={incident.applied_at ?? incident.created_at} />
								</p>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
