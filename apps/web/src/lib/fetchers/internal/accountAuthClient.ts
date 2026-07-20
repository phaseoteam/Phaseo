import { createClient as createBrowserClient } from "@/utils/supabase/client";

export async function getBrowserAccessToken(): Promise<string | null> {
	const { data } = await createBrowserClient().auth.getSession();
	return data.session?.access_token ?? null;
}
