import { getTranslations } from "next-intl/server";
import CachedWebhooks from "@/components/(gateway)/settings/webhooks/CachedWebhooks";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { webhookSettingsEnabled } from "@/lib/flags";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { connection } from "next/server";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.webhookFormCopy");
	return {title: t("editMetadata")};
}

export default function WebhookEndpointPage({
	params,
}: {
	params: Promise<{ endpointId: string }>;
}) {
	return <Suspense fallback={<SettingsSectionFallback />}><WebhookEndpointContent params={params} /></Suspense>;
}

async function WebhookEndpointContent({ params }: { params: Promise<{ endpointId: string }> }) {
	await connection();
	const t = await getTranslations("Product.webhookPage");
	const s = await getTranslations("SettingsUI.strings");
	const f = await getTranslations("SettingsUI.webhookFormCopy");
	if (!(await webhookSettingsEnabled())) {
		return <Alert><AlertTitle>{t("notEnabled")}</AlertTitle><AlertDescription>{t("enabledWorkspaces")}</AlertDescription></Alert>;
	}

	const { endpointId } = await params;
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken || !workspaceId) {
		return <Alert><AlertTitle>{s("Select a workspace")}</AlertTitle><AlertDescription>{f("workspaceEdit")}</AlertDescription></Alert>;
	}

	return <CachedWebhooks endpointId={endpointId} />;
}
