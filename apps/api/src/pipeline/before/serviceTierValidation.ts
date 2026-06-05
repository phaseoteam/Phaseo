import { isSynchronousTextEndpoint, readRequestedServiceTier, validateTextServiceTier } from "@core/serviceTiers";
import type { Endpoint } from "@core/types";
import { err } from "./http";

export function validateSynchronousTextServiceTierRequest(args: {
	endpoint: Endpoint;
	body: any;
	requestId: string;
	workspaceId: string;
}): { ok: true } | { ok: false; response: Response } {
	if (!isSynchronousTextEndpoint(args.endpoint)) return { ok: true };

	const requested = readRequestedServiceTier(args.body);
	const result = validateTextServiceTier(requested.value, requested.field);
	if (result.ok === true) return { ok: true };

	const isBatch = result.reason === "batch_not_supported";
	return {
		ok: false,
		response: err("validation_error", {
			details: [
				{
					message: isBatch
						? 'service_tier "batch" is not supported for synchronous requests. Please use the Batch API instead.'
						: `Unsupported service_tier "${result.raw}". Use standard, priority, flex, or batch.`,
					path: [result.field],
					keyword: isBatch
						? "batch_service_tier_not_supported"
						: "unsupported_service_tier",
					params: {
						allowed_values: ["standard", "priority", "flex", "batch"],
						...(isBatch ? { use_endpoint: "/v1/batches" } : {}),
					},
				},
			],
			request_id: args.requestId,
			workspace_id: args.workspaceId,
		}),
	};
}
