"use client";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";

import * as React from "react";
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
	const invalidateSettings = useInvalidatePrivateSettings();
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
		toast.success("Metadata URL copied");
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
			void invalidateSettings();
			toast.success("SAML settings saved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save SAML settings",
			);
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="space-y-6">
			<div className="grid max-w-2xl gap-6">
				<div className="grid gap-2">
					<div className="flex items-center justify-between gap-3"><Label htmlFor="samlMetadataUrl">Phaseo metadata URL</Label><Badge variant={enabled ? "default" : configured ? "secondary" : "outline"}>{enabled ? "Enabled" : configured ? "Ready" : "Not configured"}</Badge></div>
					<div className="flex gap-2">
						<Input
							id="samlMetadataUrl"
							value={metadataUrl ?? "Unavailable in this environment"}
							readOnly
							className="font-mono text-xs"
						/>
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={copyMetadataUrl}
							disabled={!metadataUrl}
							aria-label="Copy SAML metadata URL"
						>
							<Copy className="h-4 w-4" />
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						Add this service-provider metadata URL to your identity provider.
					</p>
				</div>

				<div className="grid gap-2">
					<Label htmlFor="samlDomains">Verified domains</Label>
					<Input
						id="samlDomains"
						value={domains}
						onChange={(event) => setDomains(event.target.value)}
						placeholder="example.com, example.org"
						disabled={!canEdit || saving}
					/>
					<p className="text-xs text-muted-foreground">
						Comma-separated domains used to discover this connection at sign-in.
					</p>
				</div>

				<div className="grid gap-2">
					<Label htmlFor="samlProviderId">Supabase SSO provider ID</Label>
					<Input
						id="samlProviderId"
						value={providerId}
						onChange={(event) => setProviderId(event.target.value)}
						placeholder="00000000-0000-0000-0000-000000000000"
						disabled={!canEdit || saving}
						className="font-mono text-xs"
					/>
					<p className="text-xs text-muted-foreground">
						The provider identifier returned when the SAML connection is created.
					</p>
				</div>

				<div className="flex items-center justify-between gap-4 rounded-md border border-border/70 px-4 py-3">
					<div>
						<p className="text-sm font-medium">Enable SAML sign-in</p>
						<p className="text-xs text-muted-foreground">
							A provider ID and at least one verified domain are required.
						</p>
					</div>
					<Switch
						checked={enabled}
						onCheckedChange={setEnabled}
						disabled={!canEdit || saving || (!configured && !enabled)}
						aria-label="Enable SAML sign-in"
					/>
				</div>
			</div>
			<div className="flex items-center justify-between gap-4 border-t border-border/60 pt-5">
				<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<CheckCircle2 className="h-3.5 w-3.5" />
					Available to every workspace during rollout.
				</p>
				<Button
					type="button"
					onClick={save}
					disabled={!canEdit || !hasChanges || saving}
				>
					{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
					Save SAML settings
				</Button>
			</div>
		</section>
	);
}
