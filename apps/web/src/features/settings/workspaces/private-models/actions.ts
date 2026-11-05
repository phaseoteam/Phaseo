import { createServerFn } from "@tanstack/react-start";
import { serverMutation } from "@/lib/serverFn/actionMiddleware";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

async function account() {
	const context = await getServerAccountContext();
	if (!context.accessToken || !context.workspaceId) throw new Error("Unauthorized");
	return { token: context.accessToken, workspaceId: context.workspaceId };
}

export const createPrivateModelAction = createServerFn({ method: "POST", strict: { output: false } })
	.middleware([serverMutation])
	.validator((input: Record<string, unknown>) => input)
	.handler(async ({ data: input }) => {
		const value = await account();
		return await fetchAccountWebApi(`/api/account/private-models?workspaceId=${encodeURIComponent(value.workspaceId)}`, value.token, { method: "POST", body: JSON.stringify(input) });
	});

export const updatePrivateModelAction = createServerFn({ method: "POST", strict: { output: false } })
	.middleware([serverMutation])
	.validator((input: { id: string; input: Record<string, unknown> }) => input)
	.handler(async ({ data: { id, input } }) => {
		const value = await account();
		return await fetchAccountWebApi(`/api/account/private-models/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(value.workspaceId)}`, value.token, { method: "PATCH", body: JSON.stringify(input) });
	});

export const deletePrivateModelAction = createServerFn({ method: "POST", strict: { output: false } })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const value = await account();
		return await fetchAccountWebApi(`/api/account/private-models/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(value.workspaceId)}`, value.token, { method: "DELETE" });
	});
