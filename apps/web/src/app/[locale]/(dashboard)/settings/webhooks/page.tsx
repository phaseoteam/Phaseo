import { getTranslations } from "@/i18n/server";
import { useLocale, useTranslations } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@/i18n/navigation";
import { getLocalizedDocsHref } from "@/lib/docs";
import { Suspense } from "react";
import { ArrowUpRight, Plus, Webhook } from "lucide-react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import CachedWebhooks from "@/components/(gateway)/settings/webhooks/CachedWebhooks";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { webhookAvailabilityQuery } from "./webhooks.functions";

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

function WebhooksSettingsContent() {
	const t = useTranslations("Product.webhookPage");
	const settingsT = useTranslations("SettingsUI.settingsPageCopy");
	const stringsT = useTranslations("SettingsUI.strings");
	const locale = useLocale();
	const { data: availability } = useSuspenseQuery(webhookAvailabilityQuery());
	const isEnabled = availability.enabled;
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

	if (!availability.hasWorkspace) {
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
