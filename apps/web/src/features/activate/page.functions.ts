// Device activation reads the signed-in Supabase session and the reviewed-code
// cookie, so the session check and the request/workspace lookups run on the server.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

export type DeviceRequest = { client?: { name?: string | null } | null; scopes?: string[] | null };

/**
 * Signed-out visitors are sent to sign-in (route loader). A user_code in the link is never carried
 * through: the person types the code from their own terminal after signing in.
 */
export const getActivateSignInRedirect = createServerFn({ method: "GET" }).handler(async () => {
	const { createClient } = await import("@/utils/supabase/server");
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (user) return null;
	return `/sign-in?returnUrl=${encodeURIComponent("/activate")}`;
});

/**
 * Step 2 data, only for a code the person typed on this page (kept in an httpOnly cookie).
 * Without one, or when the lookup fails, the page shows the code entry form.
 */
export const getActivatePageData = createServerFn({ method: "GET" }).handler(async () => {
	const [{ lookupDeviceRequest, reviewedDeviceCode }, { createClient }, { fetchAccountWebApi }] = await Promise.all([
		import("./actions"),
		import("@/utils/supabase/server"),
		import("@/lib/web-api/client"),
	]);
	const userCode = reviewedDeviceCode();
	const request: DeviceRequest | null = userCode
		? await lookupDeviceRequest({ data: userCode }).catch(() => null)
		: null;
	if (!userCode || !request) return { userCode, request: null, workspaces: [] };
	const supabase = await createClient();
	const { data: sessionData } = await supabase.auth.getSession();
	const { workspaces } = await fetchAccountWebApi<{
		workspaces: Array<{ id: string; name: string; role: string }>;
	}>("/api/account/auth/workspaces", sessionData.session?.access_token);
	return { userCode, request, workspaces };
});

export const activatePageDataQuery = () =>
	queryOptions({
		queryKey: ["activate-device"],
		queryFn: () => getActivatePageData(),
	});
