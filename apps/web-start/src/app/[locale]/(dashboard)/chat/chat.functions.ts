// Signed-in data for the Chat playground: the workspace chat policy, the
// account's provider catalogue previews and (for admins) hidden models. These
// read the request cookies, so they run on the server through createServerFn.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";

const loadChatPlaygroundAccountData = createServerFn({ method: "GET" })
	.validator((input: { opensLoggedRequest?: boolean } | undefined) => ({ opensLoggedRequest: input?.opensLoggedRequest === true }))
	.handler(async ({ data }) => {
		const [{ fetchChatEffectivePolicy }, { fetchServerProviderCatalogPreviews }, { fetchServerAdminChatModels }, { getServerAccountContext }] = await Promise.all([
			import("@/lib/fetchers/internal/fetchChatEffectivePolicy"),
			import("@/lib/fetchers/internal/fetchServerProviderCatalogPreviews"),
			import("@/lib/fetchers/internal/fetchServerAdminChatModels"),
			import("@/lib/fetchers/internal/serverAccountContext"),
		]);
		// Opening a logged request compares its workspace with the one Chat bills.
		const [effectivePolicy, providerPreviews, internalModels, accountContext] = await Promise.all([
			fetchChatEffectivePolicy().catch(() => null),
			fetchServerProviderCatalogPreviews(),
			fetchServerAdminChatModels(),
			data.opensLoggedRequest ? getServerAccountContext().catch(() => null) : null,
		]);
		return {
			effectivePolicy,
			providerPreviews,
			internalModels,
			activeWorkspaceId: accountContext?.workspaceId ?? null,
		};
	});

export const chatPlaygroundAccountDataQuery = (opensLoggedRequest: boolean) =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "chat-playground", { opensLoggedRequest }],
		queryFn: () => loadChatPlaygroundAccountData({ data: { opensLoggedRequest } }),
	});

const loadChatPlaygroundLoaderAccountData = createServerFn({ method: "GET" }).handler(async () => {
	const [{ fetchChatEffectivePolicy }, { fetchServerProviderCatalogPreviews }] = await Promise.all([
		import("@/lib/fetchers/internal/fetchChatEffectivePolicy"),
		import("@/lib/fetchers/internal/fetchServerProviderCatalogPreviews"),
	]);
	const [effectivePolicy, providerPreviews] = await Promise.all([
		fetchChatEffectivePolicy().catch(() => null),
		fetchServerProviderCatalogPreviews(),
	]);
	return { effectivePolicy, providerPreviews };
});

export const chatPlaygroundLoaderAccountDataQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "chat-playground-loader"],
		queryFn: () => loadChatPlaygroundLoaderAccountData(),
	});
