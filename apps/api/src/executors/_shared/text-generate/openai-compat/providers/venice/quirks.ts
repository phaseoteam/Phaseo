// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Normalizes Venice Responses payloads to the field names Venice expects.

import type { ProviderQuirks } from "../../quirks/types";

export const veniceQuirks: ProviderQuirks = {
	transformRequest: ({ request }) => {
		const isResponsesRequest = request.input_items != null || request.input != null;
		if (!isResponsesRequest) return;

		if (request.input == null && request.input_items != null) {
			request.input = request.input_items;
			delete request.input_items;
		}
	},
};
