// Purpose: Decode the public Decisions request into the gateway IR.

import type { DecisionsRequest } from "@core/schemas";
import type { IRDecisionsRequest } from "@core/ir";

export function decodeDecisionsRequest(req: DecisionsRequest): IRDecisionsRequest {
	return {
		model: req.model,
		state: req.state,
		// Zod's discriminated-union inference marks the shared instruction field
		// optional here even though the runtime schema requires it.
		questions: req.questions as IRDecisionsRequest["questions"],
	};
}
