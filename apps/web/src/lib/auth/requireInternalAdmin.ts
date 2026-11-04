import { redirect } from "@/lib/navigation";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";

export async function requireInternalAdmin(forbiddenPath = "/"): Promise<void> {
	const status = await fetchInternalAuthStatus();
	if (!status.signedIn) redirect("/sign-in");
	if (!status.isAdmin) redirect(forbiddenPath);
}

/**
 * For server actions: throws unless the caller is a signed-in internal admin. Each internal action
 * calls it first, so the web never relays a request it should refuse, even though web-api checks too.
 */
export async function requireInternalAdminAction(): Promise<void> {
	const status = await fetchInternalAuthStatus();
	if (!status.signedIn || !status.isAdmin) throw new Error("Unauthorized");
}
