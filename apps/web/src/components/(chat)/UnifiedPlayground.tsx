"use client";

import ChatPlayground from "@/components/(chat)/ChatPlayground";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

type UnifiedPlaygroundProps = {
	models: GatewaySupportedModel[];
	modelParam?: string | null;
	promptParam?: string | null;
};

export default function UnifiedPlayground({
	models,
	modelParam,
	promptParam,
}: UnifiedPlaygroundProps) {
	return (
		<ChatPlayground
			models={models}
			modelParam={modelParam ?? null}
			promptParam={promptParam ?? null}
			mode="unified"
		/>
	);
}
