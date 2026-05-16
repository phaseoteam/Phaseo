import type { PipelineContext } from "@/pipeline/before/types";
import type { RequestResult } from "@/pipeline/execute";

export type GatewayPluginStage = "response.post_provider";

export type ResponseHealingMode = "safe" | "strict";

export type NormalizedGatewayPluginConfig = {
	id: string;
	enabled: boolean;
	config: Record<string, unknown>;
	preventOverrides?: boolean;
};

export type GatewayPluginExecutionMetadata = {
	id: string;
	stage: GatewayPluginStage;
	changed: boolean;
	status: "applied" | "skipped" | "failed";
	metadata?: Record<string, unknown>;
};

export type GatewayResponsePluginApplyArgs = {
	ctx: PipelineContext;
	result: RequestResult;
	payload: any;
	plugin: NormalizedGatewayPluginConfig;
	finishReason: string | null;
};

export type GatewayResponsePluginResult = {
	payload: any;
	execution: GatewayPluginExecutionMetadata;
};

export type GatewayResponsePluginHandler = {
	id: string;
	stage: "response.post_provider";
	supportsStreaming: boolean;
	apply: (args: GatewayResponsePluginApplyArgs) => GatewayResponsePluginResult;
};
