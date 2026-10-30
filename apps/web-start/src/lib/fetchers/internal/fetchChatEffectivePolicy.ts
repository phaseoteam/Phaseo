import type { ChatEffectivePolicy } from "@/lib/chat/effectivePolicy";
import { getServerAccountContext } from "./serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchChatEffectivePolicy(): Promise<ChatEffectivePolicy | null> {
	const context = await getServerAccountContext();
	if (!context.accessToken || !context.workspaceId) return null;
	return fetchAccountWebApi<ChatEffectivePolicy>(
		`/api/account/settings/chat/effective-policy?workspaceId=${encodeURIComponent(context.workspaceId)}`,
		context.accessToken,
	);
}
