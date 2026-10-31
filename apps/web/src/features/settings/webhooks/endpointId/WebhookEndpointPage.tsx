import { getTranslations } from "@/i18n/server";
import { useTranslations } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import CachedWebhooks from "@/components/(gateway)/settings/webhooks/CachedWebhooks";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { webhookAvailabilityQuery } from "../webhooks.functions";
import { Suspense } from "react";
import { useParams } from "@tanstack/react-router";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export async function getWebhookEndpointMetadata() {
	const t = await getTranslations("SettingsUI.webhookFormCopy");
	return {title: t("editMetadata")};
}

export default function WebhookEndpointPage() {
	return <Suspense fallback={<SettingsSectionFallback />}><WebhookEndpointContent /></Suspense>;
}

function WebhookEndpointContent() {
	const t = useTranslations("Product.webhookPage");
	const s = useTranslations("SettingsUI.strings");
	const f = useTranslations("SettingsUI.webhookFormCopy");
	const { endpointId } = useParams({ from: "/{-$locale}/_dashboard/settings/webhooks/$endpointId/" });
	const { data: availability } = useSuspenseQuery(webhookAvailabilityQuery());
	if (!availability.enabled) {
		return <Alert><AlertTitle>{t("notEnabled")}</AlertTitle><AlertDescription>{t("enabledWorkspaces")}</AlertDescription></Alert>;
	}

	if (!availability.hasWorkspace) {
		return <Alert><AlertTitle>{s("Select a workspace")}</AlertTitle><AlertDescription>{f("workspaceEdit")}</AlertDescription></Alert>;
	}

	return <CachedWebhooks endpointId={endpointId} />;
}
