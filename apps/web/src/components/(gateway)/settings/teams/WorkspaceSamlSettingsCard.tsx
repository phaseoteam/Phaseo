"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateTeamSsoSettingsAction } from "@/app/(dashboard)/settings/teams/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
	normalizeTeamSsoSettingsInput,
	type TeamSsoSettingsRow,
} from "@/lib/auth/teamSsoSettings";

type Props = {
	workspaceId: string;
	initialSettings?: TeamSsoSettingsRow;
	canEdit: boolean;
	preview?: boolean;
};

function domainsToInput(domains: string[] | null | undefined): string {
	return Array.isArray(domains) ? domains.join(", ") : "";
}

export default function WorkspaceSamlSettingsCard({
	workspaceId,
	initialSettings,
	canEdit,
	preview = false,
}: Props) {
	const t = useTranslations("SettingsUI");
	const [enabled, setEnabled] = React.useState(Boolean(initialSettings?.sso_enabled));
	const [providerId, setProviderId] = React.useState(
		String(initialSettings?.sso_provider_identifier ?? (preview ? "sp_example_provider" : "")),
	);
	const [domains, setDomains] = React.useState(
		domainsToInput(initialSettings?.sso_domains) || (preview ? "acme.example" : ""),
	);
	const [saving, setSaving] = React.useState(false);

	const domainList = React.useMemo(
		() => domains.split(/[\s,]+/).filter(Boolean),
		[domains],
	);
	const configured = providerId.trim().length > 0 && domainList.length > 0;
	const initialEnabled = Boolean(initialSettings?.sso_enabled);
	const initialProviderId = String(initialSettings?.sso_provider_identifier ?? "");
	const initialDomains = domainsToInput(initialSettings?.sso_domains);
	const hasChanges =
		enabled !== initialEnabled ||
		providerId.trim() !== initialProviderId.trim() ||
		domains.trim() !== initialDomains.trim();

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
	const metadataUrl = supabaseUrl
		? `${supabaseUrl}/auth/v1/sso/saml/metadata`
		: null;

	async function copyMetadataUrl() {
		if (!metadataUrl) return;
		await navigator.clipboard.writeText(metadataUrl);
	toast.success(t("saml.urlCopied"));
	}

	async function save() {
		setSaving(true);
		try {
			const normalized = normalizeTeamSsoSettingsInput({
				ssoEnabled: enabled,
				ssoEnforced: false,
				ssoMode: "saml",
				ssoProviderIdentifier: providerId,
				ssoDomains: domainList,
			});
			await updateTeamSsoSettingsAction(workspaceId, normalized);
			toast.success(t("saml.saved"));
		} catch (error) {
			toast.error(localizedSettingsError(error, t, "Action failed", t("saml.saveFailed")));
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="space-y-6">
			<div className="grid max-w-2xl gap-6">
				<div className="grid gap-2">
					<div className="flex items-center justify-between gap-3"><Label htmlFor="samlMetadataUrl">{t("saml.metadataUrl")}</Label><Badge variant={enabled ? "default" : configured ? "secondary" : "outline"}>{enabled ? t("saml.enabled") : configured ? t("saml.ready") : t("saml.notConfigured")}</Badge></div>
					<div className="flex gap-2">
						<Input
							id="samlMetadataUrl"
							value={metadataUrl ?? t("saml.unavailable")}
							readOnly
							className="font-mono text-xs"
						/>
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={copyMetadataUrl}
							disabled={!metadataUrl}
							aria-label={t("saml.copyMetadata")}
						>
							<Copy className="h-4 w-4" />
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
					{t("saml.metadataHelp")}
					</p>
				</div>

				<div className="grid gap-2">
					<Label htmlFor="samlDomains">{t("saml.verifiedDomains")}</Label>
					<Input
						id="samlDomains"
						value={domains}
						onChange={(event) => setDomains(event.target.value)}
						placeholder={t("saml.domainsPlaceholder")}
						disabled={!canEdit || saving}
					/>
					<p className="text-xs text-muted-foreground">
						{t("saml.domainsHelp")}
					</p>
				</div>

				<div className="grid gap-2">
					<Label htmlFor="samlProviderId">{t("saml.providerId")}</Label>
					<Input
						id="samlProviderId"
						value={providerId}
						onChange={(event) => setProviderId(event.target.value)}
						placeholder="00000000-0000-0000-0000-000000000000"
						disabled={!canEdit || saving}
						className="font-mono text-xs"
					/>
					<p className="text-xs text-muted-foreground">
						{t("saml.providerIdHelp")}
					</p>
				</div>

				<div className="flex items-center justify-between gap-4 rounded-md border border-border/70 px-4 py-3">
					<div>
						<p className="text-sm font-medium">{t("saml.enableSignIn")}</p>
						<p className="text-xs text-muted-foreground">
							{t("saml.enableHelp")}
						</p>
					</div>
					<Switch
						checked={enabled}
						onCheckedChange={setEnabled}
						disabled={!canEdit || saving || (!configured && !enabled)}
						aria-label={t("saml.enableSignIn")}
					/>
				</div>
			</div>
			<div className="flex items-center justify-between gap-4 border-t border-border/60 pt-5">
				<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<CheckCircle2 className="h-3.5 w-3.5" />
					{t("saml.availableRollout")}
				</p>
				<Button
					type="button"
					onClick={save}
					disabled={!canEdit || !hasChanges || saving}
				>
					{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
					{t("saml.save")}
				</Button>
			</div>
		</section>
	);
}
