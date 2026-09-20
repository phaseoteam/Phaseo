import CachedWebhooks from "@/components/(gateway)/settings/webhooks/CachedWebhooks";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { webhookSettingsEnabled } from "@/lib/flags";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { connection } from "next/server";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export const metadata = { title: "Edit Webhook Endpoint - Settings" };

export default function WebhookEndpointPage({
	params,
}: {
	params: Promise<{ endpointId: string }>;
}) {
	return <Suspense fallback={<SettingsSectionFallback />}><WebhookEndpointContent params={params} /></Suspense>;
}

async function WebhookEndpointContent({ params }: { params: Promise<{ endpointId: string }> }) {
	await connection();
	if (!(await webhookSettingsEnabled())) {
		return <Alert><AlertTitle>Webhooks are not enabled</AlertTitle><AlertDescription>Async job webhooks are currently available for enabled workspaces.</AlertDescription></Alert>;
	}

	const { endpointId } = await params;
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken || !workspaceId) {
		return <Alert><AlertTitle>Select a workspace</AlertTitle><AlertDescription>Choose a workspace to edit webhook endpoints.</AlertDescription></Alert>;
	}

	return <CachedWebhooks endpointId={endpointId} />;
}
