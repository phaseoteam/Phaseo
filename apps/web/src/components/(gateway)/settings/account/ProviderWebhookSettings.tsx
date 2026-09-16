"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rotateProviderCatalogWebhookAction } from "@/app/(dashboard)/settings/account/providers/actions";

export default function ProviderWebhookSettings({ providerSlug, webhookUrl, configured }: { providerSlug: string; webhookUrl: string; configured: boolean }) {
	const [secret, setSecret] = React.useState<string | null>(null);
	const [saving, setSaving] = React.useState(false);
	const [hasSecret, setHasSecret] = React.useState(configured);

	async function rotate() {
		if (hasSecret && !window.confirm("Rotate this signing secret? Existing webhook senders will stop working until they use the new secret.")) return;
		setSaving(true);
		try {
			const result = await rotateProviderCatalogWebhookAction(providerSlug);
			setSecret(result.webhookSecret);
			setHasSecret(true);
			toast.success("Webhook signing secret ready");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not update webhook secret");
		} finally {
			setSaving(false);
		}
	}

	return <div className="space-y-3 border-t border-border/70 pt-4">
		<div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-medium">Webhook signing secret</h3><p className="mt-1 text-xs text-muted-foreground">{hasSecret ? "Configured. The existing secret cannot be viewed again." : "Not configured. Generate a secret before sending webhook events."}</p></div><Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void rotate()}>{saving ? "Updating…" : hasSecret ? "Rotate secret" : "Generate secret"}</Button></div>
		{secret ? <div role="status" className="space-y-1 border-l-2 border-primary pl-3"><p className="text-xs font-medium">Save this secret now. It will not be shown again.</p><code className="block break-all font-mono text-xs select-all">{secret}</code><Button type="button" variant="ghost" size="sm" onClick={() => setSecret(null)}>Hide secret</Button></div> : null}
		<p className="text-xs text-muted-foreground">Send a POST to <code className="break-all text-foreground">{webhookUrl}</code> with a Unix timestamp, event ID, and HMAC-SHA256 signature of <code>timestamp.rawBody</code>. Use the headers <code>X-Phaseo-Timestamp</code>, <code>X-Phaseo-Event-Id</code>, and <code>X-Phaseo-Signature: v1=&lt;hex&gt;</code>.</p>
	</div>;
}
