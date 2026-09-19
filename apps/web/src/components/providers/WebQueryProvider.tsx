"use client";

import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useState } from "react";
import { createWebQueryClient } from "@/lib/query/queryClient";
import { createClient } from "@/utils/supabase/client";
import { listenForQueryFocus, listenForQuerySession } from "@/lib/query/browserLifecycle";
import { hideDocumentForSessionReset, listenForQueryHistory } from "@/lib/query/historyPrivacy";

export function WebQueryProvider({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(createWebQueryClient);
	useLayoutEffect(() => listenForQueryHistory(queryClient), [queryClient]);

	useEffect(() => {
		focusManager.setEventListener(listenForQueryFocus);
		return () => focusManager.setEventListener(() => undefined);
	}, []);

	useEffect(() => {
		const reloadForIdentityChange = () => {
			hideDocumentForSessionReset();
			window.location.reload();
		};
		const unsubscribe = listenForQuerySession(queryClient, createClient().auth, ({ previousUserId, nextUserId }) => {
			// Let a new sign-in finish MFA/provisioning and choose its return URL.
			if (previousUserId == null && nextUserId && /^\/(?:sign-in|sign-up|auth)(?:\/|$)/.test(window.location.pathname)) {
				return false;
			}
			reloadForIdentityChange();
		});
		return unsubscribe;
	}, [queryClient]);

	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}
