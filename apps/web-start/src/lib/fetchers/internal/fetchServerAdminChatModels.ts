import { isAdminViewer } from "@/lib/auth/getViewerRole";
import { getServerAccountContext } from "./serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { adminHiddenModelsToChatModels, type AdminHiddenModelsPayload } from "@/lib/chat/adminInternalModels";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

export async function fetchServerAdminChatModels(): Promise<GatewaySupportedModel[]> {
	try {
		if (!(await isAdminViewer())) return [];
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) return [];
		// One batched request for every hidden model and its routes; the page
		// waits on this before rendering the playground.
		const payload = await fetchAccountWebApi<AdminHiddenModelsPayload>(
			"/api/account/models/hidden?includeRoutes=true", accessToken);
		return adminHiddenModelsToChatModels(payload);
	} catch { return []; }
}
