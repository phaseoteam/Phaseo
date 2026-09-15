import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import WebhookEndpointForm from "@/components/(gateway)/settings/webhooks/WebhookEndpointForm";
import { webhookSettingsEnabled } from "@/lib/flags";
import { connection } from "next/server";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export const metadata = { title: "Add Webhook Endpoint - Settings" };

export default function NewWebhookEndpointPage() {
	return <Suspense fallback={<SettingsSectionFallback />}><NewWebhookEndpointContent /></Suspense>;
}

async function NewWebhookEndpointContent() {
	await connection();
	if (!(await webhookSettingsEnabled())) {
		return <Alert><AlertTitle>Webhooks are not enabled</AlertTitle><AlertDescription>Async job webhooks are currently available for enabled workspaces.</AlertDescription></Alert>;
	}

	return <WebhookEndpointForm mode="create" />;
}
