import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getLocalizedDocsHref } from "@/lib/docs";
import { Suspense } from "react";
import { ArrowUpRight, Plus, Webhook } from "lucide-react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import CachedWebhooks from "@/components/(gateway)/settings/webhooks/CachedWebhooks";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { webhookSettingsEnabled } from "@/lib/flags";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { connection } from "next/server";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("webhooks") };
}

export default function WebhooksSettingsPage() {
	return (
		<div className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<WebhooksSettingsContent />
			</Suspense>
		</div>
	);
}

async function WebhooksSettingsContent() {
	const t = await getTranslations("Product.webhookPage");
	const settingsT = await getTranslations("SettingsUI.settingsPageCopy");
	const stringsT = await getTranslations("SettingsUI.strings");
	const locale = await getLocale();
	await connection();
	const isEnabled = await webhookSettingsEnabled();
	const header = (
		<SettingsPageHeader
			title={settingsT("webhooksTitle")}
			description={t("description")}
			actions={isEnabled ? (
				<Button asChild size="sm">
					<Link href="/settings/webhooks/new"><Plus className="mr-2 size-4" />{t("addEndpoint")}</Link>
				</Button>
			) : null}
		/>
	);

	if (!isEnabled) {
		return <div className="space-y-6">{header}<Alert><Webhook className="size-4" /><AlertTitle>{t("notEnabled")}</AlertTitle><AlertDescription>{t("enabledWorkspaces")}</AlertDescription></Alert></div>;
	}

	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken || !workspaceId) {
		return <div className="space-y-6">{header}<Alert><Webhook className="size-4" /><AlertTitle>{stringsT("Select a workspace")}</AlertTitle><AlertDescription>{t("chooseWorkspace")}</AlertDescription></Alert></div>;
	}


	return (
		<div className="space-y-6">
			{header}
			<Alert className="border-border/70 bg-muted/20">
				<Webhook className="size-4" />
				<AlertTitle>{t("oneEndpoint")}</AlertTitle>
				<AlertDescription>
					{t("explanation")} {" "} <a className="inline-flex items-center gap-1 underline underline-offset-4" href={getLocalizedDocsHref(locale, "v1/guides/async-video-and-batch")} target="_blank" rel="noreferrer">{t("readGuide")} <ArrowUpRight className="size-3" /></a>
				</AlertDescription>
			</Alert>
			<CachedWebhooks />
		</div>
	);
}
