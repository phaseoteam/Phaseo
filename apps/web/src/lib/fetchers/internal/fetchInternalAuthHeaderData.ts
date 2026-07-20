import type { InternalAuthHeaderData } from "@/lib/fetchers/internal/authTypes";
import { createClient } from "@/utils/supabase/server";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchInternalAuthHeaderData(): Promise<InternalAuthHeaderData> {
	const supabase = await createClient();
	const { data } = await supabase.auth.getSession();
	return fetchAccountWebApi<InternalAuthHeaderData>(
		"/api/account/auth/header",
		data.session?.access_token,
	);
}
