import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";

import * as React from "react";
import { useTranslations } from "@/i18n/react";
import { localizedSettingsError } from "@/i18n/error-messages";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateTeamSsoSettingsAction } from "@/features/settings/teams/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsFormActions } from "../SettingsFormActions";
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

function samlFormValues(settings?: TeamSsoSettingsRow, preview = false) {
	return {
		enabled: Boolean(settings?.sso_enabled),
		providerId: String(settings?.sso_provider_identifier ?? (preview ? "sp_example_provider" : "")),
		domains: domainsToInput(settings?.sso_domains) || (preview ? "acme.example" : ""),
	};
}

export default function WorkspaceSamlSettingsCard({
	workspaceId,
	initialSettings,
	canEdit,
	preview = false,
}: Props) {
	const t = useTranslations("SettingsUI");
	const invalidateSettings = useInvalidatePrivateSettings();
	const incomingValues = samlFormValues(initialSettings, preview);
	const incomingSignature = JSON.stringify(incomingValues);
	const [previousInput, setPreviousInput] = React.useState({ workspaceId, signature: incomingSignature });
	const [saved, setSaved] = React.useState(incomingValues);
	const [enabled, setEnabled] = React.useState(saved.enabled);
	const [providerId, setProviderId] = React.useState(saved.providerId);
	const [domains, setDomains] = React.useState(saved.domains);
	const [saving, setSaving] = React.useState(false);

	const domainList = React.useMemo(
		() => domains.split(/[\s,]+/).filter(Boolean),
		[domains],
	);
	const configured = providerId.trim().length > 0 && domainList.length > 0;
	const hasChanges =
		enabled !== saved.enabled ||
		providerId.trim() !== saved.providerId.trim() ||
		domains.trim() !== saved.domains.trim();

	if (previousInput.workspaceId !== workspaceId || previousInput.signature !== incomingSignature) {
		setPreviousInput({ workspaceId, signature: incomingSignature });
		setSaved(incomingValues);
		// Query refreshes update Cancel without discarding an in-progress edit.
		if (!hasChanges || previousInput.workspaceId !== workspaceId) {
			setEnabled(incomingValues.enabled);
			setProviderId(incomingValues.providerId);
			setDomains(incomingValues.domains);
		}
	}

	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
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
			const response = await updateTeamSsoSettingsAction({ data: { workspaceId, input: normalized } });
			const acknowledged = samlFormValues(response.settings);
			setSaved(acknowledged);
			setEnabled(acknowledged.enabled);
			setProviderId(acknowledged.providerId);
			setDomains(acknowledged.domains);
			void invalidateSettings();
			toast.success(t("saml.saved"));
		} catch (error) {
			toast.error(localizedSettingsError(error, t, "Action failed", t("saml.saveFailed")));
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="space-y-6">
			<div className="grid gap-6">
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

				<div className="flex items-center justify-between gap-4 border-t border-border/60 py-5">
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
			<SettingsFormActions active={hasChanges && canEdit} status={<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<CheckCircle2 className="h-3.5 w-3.5" />
					{t("saml.availableRollout")}
				</p>}>
				<Button type="button" variant="outline" disabled={!canEdit || !hasChanges || saving} onClick={() => {
					setEnabled(saved.enabled);
					setProviderId(saved.providerId);
					setDomains(saved.domains);
				}}>{t("strings.Cancel")}</Button>
				<Button
					type="button"
					onClick={save}
					disabled={!canEdit || !hasChanges || saving}
				>
					{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
					{t("saml.save")}
				</Button>
			</SettingsFormActions>
		</section>
	);
}
