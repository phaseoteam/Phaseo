import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import WebhookEndpointForm from "@/components/(gateway)/settings/webhooks/WebhookEndpointForm";
import { webhookSettingsEnabled } from "@/lib/flags";
import { connection } from "next/server";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.webhookFormCopy");
	return {title: t("newMetadata")};
}

export default function NewWebhookEndpointPage() {
	return <Suspense fallback={<SettingsSectionFallback />}><NewWebhookEndpointContent /></Suspense>;
}

async function NewWebhookEndpointContent() {
	await connection();
	const t = await getTranslations("Product.webhookPage");
	if (!(await webhookSettingsEnabled())) {
		return <Alert><AlertTitle>{t("notEnabled")}</AlertTitle><AlertDescription>{t("enabledWorkspaces")}</AlertDescription></Alert>;
	}

	return <WebhookEndpointForm mode="create" />;
}
