import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import { clearAccountQueryCache } from "./invalidation";
import { webQueryKeys } from "./queryKeys";

/** Leave focus state derived from document visibility; throttle notifications only. */
export function listenForQueryFocus(handleFocus: () => void) {
	let lastFocusAt: number | null = null;
	const onFocus = () => {
		if (document.visibilityState === "hidden") {
			handleFocus();
			return;
		}
		const now = Date.now();
		if (lastFocusAt !== null && now - lastFocusAt < 60_000) return;
		lastFocusAt = now;
		handleFocus();
	};
	document.addEventListener("visibilitychange", onFocus);
	window.addEventListener("focus", onFocus);
	return () => {
		document.removeEventListener("visibilitychange", onFocus);
		window.removeEventListener("focus", onFocus);
	};
}

/** A new identity must also discard Next's retained page props, not just query data. */
export function listenForQuerySession(
	queryClient: QueryClient,
	auth: Pick<SupabaseClient["auth"], "onAuthStateChange">,
	onIdentityChange: (change: { previousUserId: string | null | undefined; nextUserId: string | null }) => void | false,
) {
	let userId: string | null | undefined;
	let changing = false;
	const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
		const nextUserId = session?.user.id ?? null;
		const hasStaleScope = queryClient.getQueryCache()
			.findAll({ queryKey: webQueryKeys.account.all() })
			.some((query) => query.queryKey[3] !== (nextUserId ?? "anonymous"));
		const previousUserId = userId;
		const identityChanged = previousUserId !== undefined && previousUserId !== nextUserId;
		userId = nextUserId;
		if (changing || !(identityChanged || hasStaleScope || event === "SIGNED_OUT")) return;
		changing = true;
		clearAccountQueryCache(queryClient);
		// Do not await Supabase methods inside its auth callback (it holds a lock).
		// Auth pages can finish their own sign-in/MFA redirect without an extra reload.
		changing = onIdentityChange({ previousUserId, nextUserId }) !== false;
	});
	return () => subscription.unsubscribe();
}
