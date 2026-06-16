// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: DeepInfra service tiers are consumed by gateway routing/pricing, not forwarded upstream.
// How: Drops service_tier once the gateway has selected the provider model slug.

import type { ProviderQuirks } from "../../quirks/types";

export const deepinfraQuirks: ProviderQuirks = {
	transformRequest: ({ request }) => {
		if (!request || typeof request !== "object") return;
		delete request.service_tier;
	},
};
