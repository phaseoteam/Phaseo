import { isAdminViewer } from "@/lib/auth/getViewerRole";
import { getServerAccountContext } from "./serverAccountContext";
import { fetchAdminModelSource } from "./fetchAdminModelSource";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { adminSourceToChatModels } from "@/lib/chat/adminInternalModels";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

export async function fetchServerAdminChatModels(): Promise<GatewaySupportedModel[]> {
	try {
		if (!(await isAdminViewer())) return [];
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) return [];
		const payload = await fetchAccountWebApi<{ models: Array<{ model_id: string; hidden: boolean }> }>(
			"/api/account/models/audit/source?includeHidden=true", accessToken);
		const models = await Promise.all(payload.models.filter((model) => model.hidden).map(async (model) => {
			try { return adminSourceToChatModels(await fetchAdminModelSource(model.model_id)); }
			catch { return []; }
		}));
		return models.flat();
	} catch { return []; }
}
