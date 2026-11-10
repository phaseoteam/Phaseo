import { createServerFn } from "@tanstack/react-start";
import { serverAction, serverMutation } from "@/lib/serverFn/actionMiddleware";
import { webhookSettingsEnabled } from "@/lib/flags";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

async function account(): Promise<{ accessToken: string; workspaceId: string }> {
	if (!(await webhookSettingsEnabled())) throw new Error("Webhook settings are not enabled for this workspace");
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	if (!workspaceId) throw new Error("Missing workspace id");
	return { accessToken, workspaceId };
}

export const createWebhookEndpointAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((args: {
		name: string;
		url: string;
		events: string[];
	}) => args)
	.handler(async ({ data: args }) => {
		const context = await account();
		const result = await fetchAccountWebApi<{ ok: true; id: string; signingSecret: string }>(
			"/api/account/settings/webhooks",
			context.accessToken,
			{
				method: "POST",
				body: JSON.stringify({ ...args, workspaceId: context.workspaceId }),
			},
		);
		return result;
	});

export const updateWebhookEndpointAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; args: { name: string; url: string; events?: string[] } }) => input)
	.handler(async ({ data: { id, args } }) => {
		if (!id) throw new Error("Missing webhook endpoint id");
		const context = await account();
		const result = await fetchAccountWebApi<{ ok: true }>(
			`/api/account/settings/webhooks/${encodeURIComponent(id)}`,
			context.accessToken,
			{
				method: "PATCH",
				body: JSON.stringify({ ...args, workspaceId: context.workspaceId }),
			},
		);
		return result;
	});

export const updateWebhookEndpointStatusAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; status: "active" | "disabled" }) => input)
	.handler(async ({ data: { id, status } }) => {
		if (!id) throw new Error("Missing webhook endpoint id");
		const context = await account();
		const result = await fetchAccountWebApi<{ ok: true }>(
			`/api/account/settings/webhooks/${encodeURIComponent(id)}/status`,
			context.accessToken,
			{
				method: "PUT",
				body: JSON.stringify({ status, workspaceId: context.workspaceId }),
			},
		);
		return result;
	});

export const rotateWebhookEndpointSecretAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		if (!id) throw new Error("Missing webhook endpoint id");
		const context = await account();
		const result = await fetchAccountWebApi<{ ok: true; signingSecret: string }>(
			`/api/account/settings/webhooks/${encodeURIComponent(id)}/rotate`,
			context.accessToken,
			{
				method: "POST",
				body: JSON.stringify({ workspaceId: context.workspaceId }),
			},
		);
		return result;
	});

export const sendWebhookEndpointTestAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		if (!id) throw new Error("Missing webhook endpoint id");
		const context = await account();
		const result = await fetchAccountWebApi<{
			ok: boolean;
			event_id: string;
			status_code: number | null;
			error: string | null;
		}>(`/api/account/settings/webhooks/${encodeURIComponent(id)}/test`, context.accessToken, {
			method: "POST",
			body: JSON.stringify({ workspaceId: context.workspaceId }),
		});
		if (!result.ok) {
			throw new Error(result.error ?? (result.status_code ? `Destination returned HTTP ${result.status_code}` : "Test delivery failed"));
		}
		return result;
	});

export const deleteWebhookEndpointAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		if (!id) throw new Error("Missing webhook endpoint id");
		const context = await account();
		const result = await fetchAccountWebApi<{ ok: true }>(
			`/api/account/settings/webhooks/${encodeURIComponent(id)}`,
			context.accessToken,
			{
				method: "DELETE",
				body: JSON.stringify({ workspaceId: context.workspaceId }),
			},
		);
		return result;
	});
