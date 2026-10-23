import { WEB_QUERY_POLICIES } from "./policies";
import { webQueryKeys, type AccountQueryScope } from "./queryKeys";

export function privateSettingsOptions(scope: AccountQueryScope, path: string) {
	return {
		...WEB_QUERY_POLICIES.private,
		queryKey: [...webQueryKeys.account.scope(scope), "settings", path] as const,
		// Writes invalidate; outside changes load when the tab regains focus after the data goes stale.
		// Refetches never remount the view, so open editors keep their drafts.
		refetchInterval: false as const,
	};
}
