import { notFound } from "next/navigation";
import WebhookEndpointForm from "@/components/(gateway)/settings/webhooks/WebhookEndpointForm";
import type { WebhookEndpoint } from "@/components/(gateway)/settings/webhooks/WebhooksSettingsClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { webhookSettingsEnabled } from "@/lib/flags";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
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

	const { endpoints } = await fetchAccountWebApi<{ endpoints: WebhookEndpoint[] }>(
		`/api/account/settings/webhooks?workspaceId=${encodeURIComponent(workspaceId)}`,
		accessToken,
	);
	const endpoint = endpoints.find((candidate) => candidate.id === decodeURIComponent(endpointId));
	if (!endpoint) notFound();

	return <WebhookEndpointForm mode="edit" initialEndpoint={endpoint} />;
}
