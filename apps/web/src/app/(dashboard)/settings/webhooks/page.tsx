import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { batchApiFlag } from "@/lib/flags";
import {
	requireAuthenticatedUser,
	requireWorkspaceMembership,
} from "@/utils/serverActionAuth";
import WebhooksSettingsClient, {
	type WebhookEndpoint,
} from "@/components/(gateway)/settings/webhooks/WebhooksSettingsClient";

export const metadata = {
	title: "Webhooks - Settings",
};

export default async function WebhooksSettingsPage() {
	return (
		<main className="space-y-6">
			<section className="space-y-2">
				<h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
					Webhooks
				</h1>
			</section>
			<Suspense fallback={<SettingsSectionFallback />}>
				<WebhooksSettingsContent />
			</Suspense>
		</main>
	);
}

async function WebhooksSettingsContent() {
	if (!(await batchApiFlag())) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Webhook settings are currently limited to the enabled Batch API segment.
			</div>
		);
	}

	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = await getWorkspaceIdFromCookie();

	if (!workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Select a workspace to manage webhooks.
			</div>
		);
	}
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

	const { data, error } = await supabase
		.from("gateway_webhook_endpoints")
		.select("id, name, url, status, events, secret_ciphertext, created_at, updated_at")
		.eq("workspace_id", workspaceId)
		.neq("status", "deleted")
		.order("created_at", { ascending: false });

	if (
		error &&
		!error.message.includes("Could not find the table 'public.gateway_webhook_endpoints'")
	) {
		throw new Error(error.message);
	}

	const endpoints: WebhookEndpoint[] = (data ?? []).map((row: any) => ({
		id: String(row.id ?? ""),
		name: String(row.name ?? "Async webhooks"),
		url: String(row.url ?? ""),
		status: String(row.status ?? "active") as WebhookEndpoint["status"],
		events: Array.isArray(row.events) ? row.events.map(String) : [],
		hasSecret: Boolean(row.secret_ciphertext),
		createdAt: typeof row.created_at === "string" ? row.created_at : null,
		updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
	}));

	return <WebhooksSettingsClient endpoints={endpoints} />;
}
