import { WEB_QUERY_POLICIES } from "./policies";
import { webQueryKeys, type AccountQueryScope } from "./queryKeys";

export function privateSettingsOptions(scope: AccountQueryScope, path: string) {
	return {
		...WEB_QUERY_POLICIES.private,
		queryKey: [...webQueryKeys.account.scope(scope), "settings", path] as const,
		// Editors retain their draft while open. Writes invalidate; PrivateSettingsQuery
		// revalidates stale data when the tab is shown again and offers the update.
		refetchInterval: false as const,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	};
}
