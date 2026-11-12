import { createServerFn } from "@tanstack/react-start";
import { serverMutation } from "@/lib/serverFn/actionMiddleware";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

async function account() {
	const context = await getServerAccountContext();
	if (!context.accessToken) throw new Error("Unauthorized");
	if (!context.workspaceId) throw new Error("Missing workspace id");
	return context as { accessToken: string; workspaceId: string };
}

export const updateDataContributionConsent = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((enabled: boolean) => enabled)
	.handler(async ({ data: enabled }) => {
		const context = await account();
		const result = await fetchAccountWebApi<{ ok: true; enabled: boolean }>("/api/account/settings/data-contribution", context.accessToken, {
			method: "PUT",
			body: JSON.stringify({ workspaceId: context.workspaceId, enabled }),
		});
		return result;
	});

export const createDataContributionClassifier = createServerFn({ method: "POST", strict: { output: false } })
	.middleware([serverMutation])
	.validator((input: {
		name: string;
		instructions: string;
		categories: Record<string, string[]>;
		serviceTier: "standard" | "flex";
	}) => input)
	.handler(async ({ data: input }) => {
		const context = await account();
		const result = await fetchAccountWebApi<{ classifier: unknown }>("/api/account/settings/data-contribution/classifiers", context.accessToken, {
			method: "POST",
			body: JSON.stringify({ ...input, workspaceId: context.workspaceId }),
		});
		return result;
	});

export const setDataContributionClassifierEnabled = createServerFn({ method: "POST", strict: { output: false } })
	.middleware([serverMutation])
	.validator((input: { id: string; enabled: boolean }) => input)
	.handler(async ({ data: { id, enabled } }) => {
		const context = await account();
		const result = await fetchAccountWebApi<{ classifier: unknown }>(`/api/account/settings/data-contribution/classifiers/${encodeURIComponent(id)}`, context.accessToken, {
			method: "PUT",
			body: JSON.stringify({ workspaceId: context.workspaceId, enabled }),
		});
		return result;
	});

export const deleteDataContributionClassifier = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const context = await account();
		const result = await fetchAccountWebApi<{ ok: true }>(`/api/account/settings/data-contribution/classifiers/${encodeURIComponent(id)}`, context.accessToken, {
			method: "DELETE",
			body: JSON.stringify({ workspaceId: context.workspaceId }),
		});
		return result;
	});
