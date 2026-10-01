import "server-only";
import { redirect } from "next/navigation";
import { getServerAccountContext } from "./serverAccountContext";
import { resolveAccessibleWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { toAccountQueryScope } from "@/lib/query/queryKeys";

export async function getPrivateUsageScope() {
	const context = await getServerAccountContext();
	if (!context.userId || !context.accessToken) redirect("/sign-in");
	const workspaceId = await resolveAccessibleWorkspaceIdFromCookie({ throwOnFailure: true });
	return toAccountQueryScope({ userId: context.userId, workspaceId });
}
