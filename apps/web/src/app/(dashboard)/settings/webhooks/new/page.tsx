import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import WebhookEndpointForm from "@/components/(gateway)/settings/webhooks/WebhookEndpointForm";
import { batchApiFlag } from "@/lib/flags";

export const metadata = { title: "Add Webhook Endpoint - Settings" };

export default async function NewWebhookEndpointPage() {
	if (!(await batchApiFlag())) {
		return <Alert><AlertTitle>Webhooks are not enabled</AlertTitle><AlertDescription>Async job webhooks are currently available for enabled workspaces.</AlertDescription></Alert>;
	}

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Add webhook endpoint"
				description="Choose where Phaseo should send signed updates for your async jobs."
			/>
			<WebhookEndpointForm mode="create" />
		</div>
	);
}
