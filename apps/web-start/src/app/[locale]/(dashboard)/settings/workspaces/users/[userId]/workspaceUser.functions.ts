// A workspace member's profile for workspace admins (cookies + web API). Web
// API errors become result kinds so the route (beforeLoad) and the page can
// turn them into notFound / redirects as the Next page did.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";
import type { WorkspaceUserData } from "@/lib/fetchers/internal/fetchWorkspaceUser";

export type WorkspaceUserResult =
	| { kind: "ok"; data: WorkspaceUserData }
	| { kind: "self" }
	| { kind: "notFound" }
	| { kind: "unauthorized" };

type WorkspaceUserInput = { userId: string; workspaceId?: string; keyPage?: string };

const loadWorkspaceUser = createServerFn({ method: "GET" })
	.validator((input: WorkspaceUserInput) => input)
	.handler(async ({ data: input }): Promise<WorkspaceUserResult> => {
		const [{ getServerAccountContext }, { fetchWorkspaceUser }, { WebApiError }] = await Promise.all([
			import("@/lib/fetchers/internal/serverAccountContext"),
			import("@/lib/fetchers/internal/fetchWorkspaceUser"),
			import("@/lib/web-api/client"),
		]);
		const { userId: viewerId } = await getServerAccountContext();
		if (viewerId === input.userId) return { kind: "self" };
		if (!input.workspaceId) return { kind: "notFound" };
		try {
			return { kind: "ok", data: await fetchWorkspaceUser(input.userId, input.workspaceId, input.keyPage) };
		} catch (error) {
			if (error instanceof WebApiError && [400, 403, 404].includes(error.status)) return { kind: "notFound" };
			if (error instanceof WebApiError && error.status === 401) return { kind: "unauthorized" };
			throw error;
		}
	});

const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

export const workspaceUserQuery = (userId: string, workspaceId?: unknown, keyPage?: unknown) => {
	const input: WorkspaceUserInput = { userId, workspaceId: asString(workspaceId), keyPage: asString(keyPage) };
	return queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-workspace-user", input.userId, input.workspaceId ?? null, input.keyPage ?? null],
		queryFn: () => loadWorkspaceUser({ data: input }),
	});
};
