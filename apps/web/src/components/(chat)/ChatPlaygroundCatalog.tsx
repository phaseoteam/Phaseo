"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import ChatPlayground from "./ChatPlayground";
import ChatPlaygroundShell from "./ChatPlaygroundShell";
import { Button } from "@/components/ui/button";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { applyChatEffectivePolicy, type ChatEffectivePolicy } from "@/lib/chat/effectivePolicy";
import { webQueryKeys } from "@/lib/query/queryKeys";

export default function ChatPlaygroundCatalog({ previewModels, internalModels, effectivePolicy, modelParam, promptParam }: {
	previewModels: GatewaySupportedModel[];
	internalModels: GatewaySupportedModel[];
	effectivePolicy: ChatEffectivePolicy | null;
	modelParam?: string | null;
	promptParam?: string | null;
}) {
	const t = useTranslations("Common.errors");
	const catalogue = useQuery({ queryKey: webQueryKeys.public.chatGatewayModels(), queryFn: fetchFrontendGatewayModels });
	const models = useMemo(() => {
		const publicModels = catalogue.data ?? [];
		const catalogueIds = new Set(publicModels.map((model) => model.modelId));
		return applyChatEffectivePolicy([...publicModels, ...previewModels.filter((model) => !catalogueIds.has(model.modelId)), ...internalModels], effectivePolicy);
	}, [catalogue.data, previewModels, internalModels, effectivePolicy]);
	if (!catalogue.data) {
		if (catalogue.isError) return <div className="flex flex-col items-center gap-3 p-6" role="alert"><p>{t("unexpectedDescription")}</p><Button variant="outline" onClick={() => void catalogue.refetch()}>{t("tryAgain")}</Button></div>;
		return <ChatPlaygroundShell />;
	}
	return <ChatPlayground models={models} modelParam={modelParam} promptParam={promptParam} />;
}
