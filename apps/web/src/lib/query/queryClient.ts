import { QueryClient, type DefaultOptions } from "@tanstack/react-query";
import { WEB_QUERY_POLICIES } from "@/lib/query/policies";
import { webQueryKeys } from "@/lib/query/queryKeys";

const defaultOptions: DefaultOptions = {
	queries: WEB_QUERY_POLICIES.public,
	mutations: {
		retry: 0,
	},
};

export function createWebQueryClient(): QueryClient {
	const client = new QueryClient({ defaultOptions });
	client.setQueryDefaults(webQueryKeys.account.all(), WEB_QUERY_POLICIES.private);
	return client;
}
