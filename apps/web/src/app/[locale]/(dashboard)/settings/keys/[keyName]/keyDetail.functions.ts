// One API key's detail by its route name (cookies + web API). Web API errors
// become result kinds so the route (beforeLoad) and the page can turn them
// into notFound / redirects as the Next page did.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";
import type { KeyDetailData } from "@/lib/fetchers/internal/fetchSettingsKeyDetail";

export type KeyDetailResult =
	| { kind: "ok"; data: KeyDetailData }
	| { kind: "notFound" }
	| { kind: "conflict" }
	| { kind: "unauthorized" };

type KeyDetailInput = { keyName: string; workspaceId?: string; prefix?: string };

const loadKeyDetail = createServerFn({ method: "GET" })
	.validator((input: KeyDetailInput) => input)
	.handler(async ({ data: input }): Promise<KeyDetailResult> => {
		const [{ fetchSettingsKeyDetailByName }, { WebApiError }] = await Promise.all([
			import("@/lib/fetchers/internal/fetchSettingsKeyDetail"),
			import("@/lib/web-api/client"),
		]);
		try {
			return { kind: "ok", data: await fetchSettingsKeyDetailByName(input.keyName, input.workspaceId, input.prefix) };
		} catch (error) {
			if (error instanceof WebApiError && error.status === 404) return { kind: "notFound" };
			if (error instanceof WebApiError && error.status === 409) return { kind: "conflict" };
			if (error instanceof WebApiError && error.status === 401) return { kind: "unauthorized" };
			throw error;
		}
	});

const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

export const keyDetailQuery = (keyName: string, workspaceId?: unknown, prefix?: unknown) => {
	const input: KeyDetailInput = { keyName, workspaceId: asString(workspaceId), prefix: asString(prefix) };
	return queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-key-detail", input.keyName, input.workspaceId ?? null, input.prefix ?? null],
		queryFn: () => loadKeyDetail({ data: input }),
	});
};
