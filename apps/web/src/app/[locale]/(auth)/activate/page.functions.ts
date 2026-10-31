// Device activation reads the signed-in Supabase session (cookies), so the
// session check and the request/workspace lookups run on the server.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

/** Signed-out visitors are sent to sign-in (route beforeLoad), keeping the device code. */
export const getActivateSignInRedirect = createServerFn({ method: "GET" })
	.validator((userCode: string | null) => userCode)
	.handler(async ({ data: userCode }) => {
		const { createClient } = await import("@/utils/supabase/server");
		const supabase = await createClient();
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (user) return null;
		const query = new URLSearchParams();
		if (userCode) query.set("user_code", userCode);
		return `/sign-in?returnUrl=${encodeURIComponent(`/activate?${query.toString()}`)}`;
	});

export const getActivatePageData = createServerFn({ method: "GET" })
	.validator((userCode: string) => userCode)
	.handler(async ({ data: userCode }) => {
		const [{ lookupDeviceRequest }, { createClient }, { fetchAccountWebApi }] = await Promise.all([
			import("./actions"),
			import("@/utils/supabase/server"),
			import("@/lib/web-api/client"),
		]);
		const supabase = await createClient();
		const request = userCode ? await lookupDeviceRequest({ data: userCode }).catch(() => ({ error: true as const })) : null;
		const { data: sessionData } = await supabase.auth.getSession();
		const { workspaces } = await fetchAccountWebApi<{
			workspaces: Array<{ id: string; name: string; role: string }>;
		}>("/api/account/auth/workspaces", sessionData.session?.access_token);
		return { request, workspaces };
	});

export const activatePageDataQuery = (userCode: string) =>
	queryOptions({
		queryKey: ["activate-device", userCode],
		queryFn: () => getActivatePageData({ data: userCode }),
	});
