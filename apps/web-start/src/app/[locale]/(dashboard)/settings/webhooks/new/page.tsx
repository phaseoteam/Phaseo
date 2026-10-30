import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import WebhookEndpointForm from "@/components/(gateway)/settings/webhooks/WebhookEndpointForm";
import { webhookAvailabilityQuery } from "../webhooks.functions";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.webhookFormCopy");
	return {title: t("newMetadata")};
}

export default function NewWebhookEndpointPage() {
	return <Suspense fallback={<SettingsSectionFallback />}><NewWebhookEndpointContent /></Suspense>;
}

function NewWebhookEndpointContent() {
	const t = useTranslations("Product.webhookPage");
	const { data: availability } = useSuspenseQuery(webhookAvailabilityQuery());
	if (!availability.enabled) {
		return <Alert><AlertTitle>{t("notEnabled")}</AlertTitle><AlertDescription>{t("enabledWorkspaces")}</AlertDescription></Alert>;
	}

	return <WebhookEndpointForm mode="create" />;
}
