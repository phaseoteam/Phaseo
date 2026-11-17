import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import ChatPlayground from "./ChatPlayground";
import ChatPlaygroundShell from "./ChatPlaygroundShell";
import { ChatModelAccessContext } from "./ChatModelAccessContext";
import { Button } from "@/components/ui/button";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { applyChatEffectivePolicy, type ChatEffectivePolicy } from "@/lib/chat/effectivePolicy";
import { applyModelAccess, type ModelAccess } from "@/lib/chat/modelAccess";
import { webQueryKeys } from "@/lib/query/queryKeys";

export default function ChatPlaygroundCatalog({ previewModels, internalModels, effectivePolicy, modelAccess = null, modelParam, promptParam, activeWorkspaceId }: {
	previewModels: GatewaySupportedModel[];
	internalModels: GatewaySupportedModel[];
	effectivePolicy: ChatEffectivePolicy | null;
	/** What the header workspace's rules let this member use; null when unknown (then nothing is hidden). */
	modelAccess?: ModelAccess | null;
	modelParam?: string | null;
	promptParam?: string | null;
	activeWorkspaceId?: string | null;
}) {
	const t = useTranslations("Common.errors");
	const catalogue = useQuery({ queryKey: webQueryKeys.public.chatGatewayModels(), queryFn: () => fetchFrontendGatewayModels({ credentials: "same-origin" }) });
	const models = useMemo(() => {
		const publicModels = catalogue.data ?? [];
		const catalogueIds = new Set(publicModels.map((model) => model.modelId));
		// Models the rules hide are left out, as the gateway would refuse them; the rest keep the allow/block-list
		// badges, which still explain blocks if the access check wasn't available.
		const usable = applyModelAccess([...publicModels, ...previewModels.filter((model) => !catalogueIds.has(model.modelId)), ...internalModels], modelAccess);
		return applyChatEffectivePolicy(usable, effectivePolicy);
	}, [catalogue.data, previewModels, internalModels, effectivePolicy, modelAccess]);
	if (!catalogue.data) {
		if (catalogue.isError) return <div className="flex flex-col items-center gap-3 p-6" role="alert"><p>{t("unexpectedDescription")}</p><Button variant="outline" onClick={() => void catalogue.refetch()}>{t("tryAgain")}</Button></div>;
		return <ChatPlaygroundShell />;
	}
	return (
		<ChatModelAccessContext.Provider value={modelAccess}>
			<ChatPlayground models={models} modelParam={modelParam} promptParam={promptParam} activeWorkspaceId={activeWorkspaceId} />
		</ChatModelAccessContext.Provider>
	);
}
