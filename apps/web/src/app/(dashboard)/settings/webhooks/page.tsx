import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, Plus, Webhook } from "lucide-react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import WebhooksSettingsClient, {
	type WebhookEndpoint,
} from "@/components/(gateway)/settings/webhooks/WebhooksSettingsClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { batchApiFlag } from "@/lib/flags";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export const metadata = { title: "Webhooks - Settings" };

export default function WebhooksSettingsPage() {
	return (
		<div className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<WebhooksSettingsContent />
			</Suspense>
		</div>
	);
}

async function WebhooksSettingsContent() {
	const isEnabled = await batchApiFlag();
	const header = (
		<SettingsPageHeader
			title="Webhooks"
			description="Send signed, retryable updates from your async video and batch jobs to your application."
			actions={isEnabled ? (
				<Button asChild size="sm">
					<Link href="/settings/webhooks/new"><Plus className="mr-2 size-4" />Add endpoint</Link>
				</Button>
			) : null}
		/>
	);

	if (!isEnabled) {
		return <div className="space-y-6">{header}<Alert><Webhook className="size-4" /><AlertTitle>Webhooks are not enabled</AlertTitle><AlertDescription>Async job webhooks are currently available for enabled workspaces.</AlertDescription></Alert></div>;
	}

	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken || !workspaceId) {
		return <div className="space-y-6">{header}<Alert><Webhook className="size-4" /><AlertTitle>Select a workspace</AlertTitle><AlertDescription>Choose a workspace to manage its webhook endpoints.</AlertDescription></Alert></div>;
	}

	const { endpoints } = await fetchAccountWebApi<{ endpoints: WebhookEndpoint[] }>(
		`/api/account/settings/webhooks?workspaceId=${encodeURIComponent(workspaceId)}`,
		accessToken,
	);

	return (
		<div className="space-y-6">
			{header}
			<Alert className="border-border/70 bg-muted/20">
				<Webhook className="size-4" />
				<AlertTitle>One endpoint, many async jobs</AlertTitle>
				<AlertDescription>
					Create an endpoint once, then attach its endpoint ID to video or batch requests. Every delivery is signed, includes a unique event ID, and retries after temporary failures. <a className="inline-flex items-center gap-1 underline underline-offset-4" href="https://phaseo.app/docs/v1/guides/async-video-and-batch" target="_blank" rel="noreferrer">Read the guide <ArrowUpRight className="size-3" /></a>
				</AlertDescription>
			</Alert>
			<WebhooksSettingsClient endpoints={endpoints} />
		</div>
	);
}
