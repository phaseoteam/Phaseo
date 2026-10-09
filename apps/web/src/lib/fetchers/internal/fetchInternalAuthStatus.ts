import { cache } from "react";
import type { InternalAuthStatus } from "@/lib/fetchers/internal/authTypes";
import { createClient } from "@/utils/supabase/server";
import { fetchAccountWebApi } from "@/lib/web-api/client";

// Request-scoped: the site notice, admin checks, and edit buttons all ask for
// the same status while rendering one page.
export const fetchInternalAuthStatus = cache(async (): Promise<InternalAuthStatus> => {
	const supabase = await createClient();
	const { data } = await supabase.auth.getSession();
	if (!data.session?.access_token) return { isAdmin: false, role: null, signedIn: false };
	return fetchAccountWebApi<InternalAuthStatus>(
		"/api/account/auth/status",
		data.session?.access_token,
	);
});
