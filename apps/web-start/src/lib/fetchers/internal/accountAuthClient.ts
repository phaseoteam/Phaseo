import { createClient as createBrowserClient } from "@/utils/supabase/client";

export async function getBrowserAccessToken(): Promise<string | null> {
	// In development, same-origin private API requests pass through the Next
	// proxy, which reads the Supabase cookies and forwards the bearer token.
	// Avoid sending both the chunked auth cookies and a duplicate token to the
	// local Node server, where the combined headers can exceed its size limit.
	if (process.env.NODE_ENV === "development") return null;

	const { data } = await createBrowserClient().auth.getSession();
	return data.session?.access_token ?? null;
}
