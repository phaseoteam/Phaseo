"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";
import { Check, Clipboard, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
	createWorkspaceScimTokenAction,
	getWorkspaceScimSettingsAction,
	revokeWorkspaceScimTokenAction,
	updateWorkspaceScimSettingsAction,
	type WorkspaceScimSettings,
} from "@/app/(dashboard)/settings/teams/actions";

const SCIM_BASE_URL = "https://phaseo.app/scim/v2";

export default function WorkspaceScimSettingsCard({ workspaceId, canEdit, preview = false }: { workspaceId: string; canEdit: boolean; preview?: boolean }) {
	const t = useTranslations("SettingsUI");
	const format = useDisplayFormatters();
	const previewSettings: WorkspaceScimSettings = { endpoint: { id: "preview", enabled: false, created_at: "", updated_at: "" }, tokens: [{ id: "preview-token", token_prefix: "ph_scim_demo", label: "Okta provisioning", created_at: "", expires_at: null, last_used_at: null, revoked_at: null }], userCount: 248, groupCount: 12, lastEvent: null };
	const [settings, setSettings] = React.useState<WorkspaceScimSettings | null>(preview ? previewSettings : null);
	const [loading, setLoading] = React.useState(!preview);
	const [working, setWorking] = React.useState(false);
	const [label, setLabel] = React.useState("Provisioning token");
	const [newToken, setNewToken] = React.useState<string | null>(null);

	const loadSettings = React.useCallback(() => getWorkspaceScimSettingsAction(workspaceId), [workspaceId]);

	React.useEffect(() => {
		if (preview) return;
		let cancelled = false;
		void loadSettings().then((result) => { if (!cancelled) setSettings(result); }).catch((error) => toast.error(localizedSettingsError(error, t, "Action failed", t("scim.settingsUnavailable")))).finally(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, [loadSettings, preview]);

	async function refresh() {
		setSettings(await loadSettings());
	}

	async function updateEnabled(enabled: boolean) {
		setWorking(true);
		try {
			await updateWorkspaceScimSettingsAction(workspaceId, enabled);
			await refresh();
			toast.success(enabled ? t("scim.enabled") : t("scim.disabled"));
		} catch (error) {
			toast.error(localizedSettingsError(error, t, "Action failed", t("scim.updateFailed")));
		} finally { setWorking(false); }
	}

	async function createToken() {
		setWorking(true);
		try {
			const created = await createWorkspaceScimTokenAction(workspaceId, label.trim() || "Provisioning token");
			setNewToken(created.token);
			await refresh();
			toast.success(t("scim.tokenCreated"));
		} catch (error) {
			toast.error(localizedSettingsError(error, t, "Action failed", t("scim.tokenCreateFailed")));
		} finally { setWorking(false); }
	}

	async function revokeToken(tokenId: string) {
		setWorking(true);
		try {
			await revokeWorkspaceScimTokenAction(workspaceId, tokenId);
			setNewToken(null);
			await refresh();
			toast.success(t("scim.tokenRevoked"));
		} catch (error) {
			toast.error(localizedSettingsError(error, t, "Action failed", t("scim.tokenRevokeFailed")));
		} finally { setWorking(false); }
	}

	if (loading) return <Skeleton className="h-64 w-full rounded-xl" />;
	const activeTokens = settings?.tokens.filter((token) => !token.revoked_at) ?? [];

	return (
		<section className="space-y-6">
			<div className="space-y-5">
				<div className="grid gap-3 sm:grid-cols-3">
					<div className="border-y border-border/60 py-3 sm:col-span-2"><div className="flex items-center justify-between gap-4"><p className="text-xs text-muted-foreground">{t("scim.baseUrl")}</p><div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{t("scim.enableProvisioning")}</span><Switch aria-label={t("scim.enableProvisioning")} checked={Boolean(settings?.endpoint?.enabled)} onCheckedChange={updateEnabled} disabled={!canEdit || working} /></div></div><p className="mt-1 break-all font-mono text-sm">{SCIM_BASE_URL}</p></div>
					<div className="border-y border-border/60 py-3"><p className="text-xs text-muted-foreground">{t("directory.department")}</p><p className="mt-1 text-sm font-medium">{t("scim.usersGroups", { users: settings?.userCount ?? 0, groups: settings?.groupCount ?? 0 })}</p></div>
				</div>
				{newToken ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"><p className="text-sm font-medium">{t("scim.copyNow")}</p><p className="mt-1 text-xs text-muted-foreground">{t("scim.notShownAgain")}</p><div className="mt-3 flex gap-2"><Input value={newToken} readOnly className="font-mono" /><Button variant="outline" size="icon" aria-label={t("oauth.copySecret")} onClick={() => void navigator.clipboard.writeText(newToken).then(() => toast.success(t("strings.Token copied" as never)))}><Clipboard className="h-4 w-4" /></Button></div></div> : null}
				<div className="space-y-3">
					<div className="flex flex-col gap-2 sm:flex-row"><Input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={100} disabled={!canEdit || working} aria-label={t("scim.tokenLabel")} /><Button onClick={createToken} disabled={!canEdit || working}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}{t("scim.createToken")}</Button></div>
					{activeTokens.length ? activeTokens.map((token) => <div key={token.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{token.label}</p><p className="text-xs text-muted-foreground">{token.token_prefix}… · {token.last_used_at ? t("byokControls.lastUsed", { date: format.date(token.last_used_at) }) : t("oauthDetail.neverUsed" as never)}</p></div><Button variant="ghost" size="icon" aria-label={t("teams.revokeAccess")} onClick={() => void revokeToken(token.id)} disabled={!canEdit || working}><Trash2 className="h-4 w-4" /></Button></div>) : <div className="flex items-center gap-2 border-b border-border/60 py-3 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4" />{t("scim.activeTokensEmpty")}</div>}
				</div>
				{settings?.endpoint?.enabled && activeTokens.length > 0 ? <p className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" />{t("scim.ready")}</p> : null}
			</div>
		</section>
	);
}
