import type { InternalAuthStatus } from "@/lib/fetchers/internal/authTypes";
import { createClient } from "@/utils/supabase/server";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchInternalAuthStatus(): Promise<InternalAuthStatus> {
	const supabase = await createClient();
	const { data } = await supabase.auth.getSession();
	return fetchAccountWebApi<InternalAuthStatus>(
		"/api/account/auth/status",
		data.session?.access_token,
	);
}
