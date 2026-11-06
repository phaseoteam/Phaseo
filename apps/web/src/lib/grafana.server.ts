import { emitLogs, safeError, telemetryConfig, traceContext } from "../../../../packages/shared/observability/index.mjs";
import { waitUntil } from "@/lib/start/wait-until";

export function capturePlatformServerError(error: unknown, request: Request, context: { source: string; routePath?: string }) {
	try {
		const trace = traceContext(request.headers.get("traceparent"));
		const config = telemetryConfig(process.env, "phaseo-web");
		config.release = process.env.PUBLIC_RELEASE;
		void waitUntil(emitLogs(config, [{
			event_name: "web.server_error", outcome: "error", actionable: true,
			route: context.routePath, method: request.method, signal: context.source,
			trace_id: trace?.traceId, ...safeError(error),
		}]));
	} catch { /* Preserve the original response. */ }
}
