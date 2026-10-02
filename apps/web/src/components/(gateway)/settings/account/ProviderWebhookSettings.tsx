"use client";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rotateProviderCatalogWebhookAction } from "@/app/(dashboard)/settings/account/providers/actions";

export default function ProviderWebhookSettings({ providerSlug, webhookUrl, configured }: { providerSlug: string; webhookUrl: string; configured: boolean }) {
	const t = useTranslations("SettingsUI");
	const invalidateSettings = useInvalidatePrivateSettings();
	const [secret, setSecret] = React.useState<string | null>(null);
	const [saving, setSaving] = React.useState(false);
	const [hasSecret, setHasSecret] = React.useState(configured);

	async function rotate() {
		if (hasSecret && !window.confirm(t("providerWebhookCopy.confirm"))) return;
		setSaving(true);
		try {
			const result = await rotateProviderCatalogWebhookAction(providerSlug);
			setSecret(result.webhookSecret);
			void invalidateSettings();
			setHasSecret(true);
			toast.success(t("providerWebhookCopy.ready"));
		} catch {
			toast.error(t("providerWebhookCopy.failed"));
		} finally {
			setSaving(false);
		}
	}

	return <div className="space-y-3 border-t border-border/70 pt-4">
		<div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-medium">{t("providerWebhookCopy.title")}</h3><p className="mt-1 text-xs text-muted-foreground">{t(hasSecret ? "providerWebhookCopy.configured" : "providerWebhookCopy.unconfigured")}</p></div><Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void rotate()}>{t(saving ? "providerWebhookCopy.updating" : hasSecret ? "providerWebhookCopy.rotate" : "providerWebhookCopy.generate")}</Button></div>
		{secret ? <div role="status" className="space-y-1 border-l-2 border-primary pl-3"><p className="text-xs font-medium">{t("providerWebhookCopy.saveWarning")}</p><code className="block break-all font-mono text-xs select-all">{secret}</code><Button type="button" variant="ghost" size="sm" onClick={() => setSecret(null)}>{t("providerWebhookCopy.hide")}</Button></div> : null}
		<p className="text-xs text-muted-foreground">{t.rich("providerWebhookCopy.instructions", { endpoint: webhookUrl, signature: "X-Phaseo-Signature: v1=<hex>", code: (chunks) => <code>{chunks}</code>, url: (chunks) => <code className="break-all text-foreground">{chunks}</code> })}</p>
	</div>;
}
