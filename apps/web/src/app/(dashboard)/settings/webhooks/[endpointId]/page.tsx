import { notFound } from "next/navigation";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import WebhookEndpointForm from "@/components/(gateway)/settings/webhooks/WebhookEndpointForm";
import type { WebhookEndpoint } from "@/components/(gateway)/settings/webhooks/WebhooksSettingsClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { batchApiFlag } from "@/lib/flags";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export const metadata = { title: "Edit Webhook Endpoint - Settings" };

export default async function WebhookEndpointPage({
	params,
}: {
	params: Promise<{ endpointId: string }>;
}) {
	if (!(await batchApiFlag())) {
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

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Edit webhook endpoint"
				description={`Update ${endpoint.name}'s destination or event subscriptions.`}
			/>
			<WebhookEndpointForm mode="edit" initialEndpoint={endpoint} />
		</div>
	);
}
