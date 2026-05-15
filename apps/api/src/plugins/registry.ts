import type { PipelineContext } from "@/pipeline/before/types";
import type { RequestResult } from "@/pipeline/execute";
import { applyResponseHealingPlugin } from "./response-healing";
import type {
	GatewayPluginExecutionMetadata,
	GatewayResponsePluginHandler,
} from "./types";

export const RESPONSE_PLUGIN_HANDLERS: GatewayResponsePluginHandler[] = [
	{
		id: "response-healing",
		stage: "response.post_provider",
		supportsStreaming: false,
		apply: applyResponseHealingPlugin,
	},
];

const RESPONSE_PLUGIN_HANDLER_MAP = new Map(
	RESPONSE_PLUGIN_HANDLERS.map((handler) => [handler.id, handler] as const),
);

export const KNOWN_GATEWAY_PLUGIN_IDS = new Set(
	RESPONSE_PLUGIN_HANDLERS.map((handler) => handler.id),
);

export function getResponsePluginHandler(id: string): GatewayResponsePluginHandler | null {
	return RESPONSE_PLUGIN_HANDLER_MAP.get(String(id ?? "").trim().toLowerCase()) ?? null;
}

export function findUnknownGatewayPluginIds(input: Array<{ id: string }> | null | undefined): string[] {
	if (!Array.isArray(input)) return [];
	return Array.from(
		new Set(
			input
				.map((plugin) => String(plugin?.id ?? "").trim().toLowerCase())
				.filter((id) => id.length > 0 && !KNOWN_GATEWAY_PLUGIN_IDS.has(id)),
		),
	);
}

export function applyResponsePlugins(args: {
	ctx: PipelineContext;
	result: RequestResult;
	payload: any;
	finishReason: string | null;
}): { payload: any; executions: GatewayPluginExecutionMetadata[] } {
	const plugins = Array.isArray(args.ctx.plugins) ? args.ctx.plugins : [];
	if (!plugins.length) return { payload: args.payload, executions: [] };

	let payload = args.payload;
	const executions: GatewayPluginExecutionMetadata[] = [];

	for (const plugin of plugins) {
		if (!plugin.enabled) continue;

		const handler = getResponsePluginHandler(plugin.id);
		if (handler) {
			if (args.ctx.stream && !handler.supportsStreaming) {
				executions.push({
					id: plugin.id,
					stage: handler.stage,
					changed: false,
					status: "skipped",
					metadata: {
						attempted: false,
						reason: "streaming_unsupported",
					},
				});
				continue;
			}
			try {
				const applied = handler.apply({
					ctx: args.ctx,
					result: args.result,
					payload,
					plugin,
					finishReason: args.finishReason,
				});
				payload = applied.payload;
				executions.push(applied.execution);
			} catch (error) {
				executions.push({
					id: plugin.id,
					stage: "response.post_provider",
					changed: false,
					status: "failed",
					metadata: {
						attempted: true,
						mode:
							typeof plugin.config?.mode === "string"
								? plugin.config.mode
								: "safe",
						reason: "plugin_error",
							error: error instanceof Error ? error.message : String(error),
						},
					});
			}
			continue;
		}

		executions.push({
			id: plugin.id,
			stage: "response.post_provider",
			changed: false,
			status: "skipped",
			metadata: {
				attempted: false,
				reason: "unknown_plugin",
			},
		});
	}

	return { payload, executions };
}
