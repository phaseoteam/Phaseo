import { createServerFn } from "@tanstack/react-start";

/** Admin-only tool: signed-out visitors go to /sign-in, non-admins to /. */
export const getLatencyComparisonAccess = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchInternalAuthStatus } = await import("@/lib/fetchers/internal/fetchInternalAuthStatus");
	const authStatus = await fetchInternalAuthStatus();
	if (!authStatus.signedIn) return { redirectTo: "/sign-in" } as const;
	if (!authStatus.isAdmin) return { redirectTo: "/" } as const;
	return { redirectTo: null };
});
