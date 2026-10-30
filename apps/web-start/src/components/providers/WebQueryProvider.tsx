"use client";

import { focusManager, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect } from "react";
import { isPublicLocale } from "@/i18n/locales";
import { createClient } from "@/utils/supabase/client";
import { listenForQueryFocus, listenForQuerySession } from "@/lib/query/browserLifecycle";
import { hideDocumentForSessionReset, listenForQueryHistory } from "@/lib/query/historyPrivacy";

export function WebQueryProvider({ children }: { children: React.ReactNode }) {
	// The router owns the query client (src/router.tsx) so server-fetched
	// queries hydrate into it; this provider only attaches browser listeners.
	const queryClient = useQueryClient();
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
			const pathname = window.location.pathname;
			const segments = pathname.split("/");
			const authPath = isPublicLocale(segments[1]) ? `/${segments.slice(2).join("/")}` : pathname;
			if (previousUserId == null && nextUserId && /^\/(?:sign-in|sign-up|auth)(?:\/|$)/.test(authPath)) {
				return false;
			}
			reloadForIdentityChange();
		});
		return unsubscribe;
	}, [queryClient]);

	return <>{children}</>;
}
