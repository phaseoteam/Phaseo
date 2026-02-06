// Purpose: Protocol adapter for moderations payloads.
// Why: Normalize OpenAI-compatible moderations requests to IR.
// How: Maps between OpenAI moderations shapes and IR moderations types.

import type { ModerationsRequest } from "@core/schemas";
import type { IRModerationsRequest } from "@core/ir";

export function decodeOpenAIModerationsRequest(req: ModerationsRequest): IRModerationsRequest {
	return {
		model: req.model,
		input: req.input,
		userId: (req as any).user ?? undefined,
		metadata: (req as any).metadata ?? undefined,
	};
}
