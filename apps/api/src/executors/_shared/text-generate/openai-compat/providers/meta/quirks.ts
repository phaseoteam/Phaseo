import type { ProviderQuirks } from "../../quirks/types";

export const metaQuirks: ProviderQuirks = {
	transformRequest: ({ request }) => {
		if (request.service_tier === "standard") {
			request.service_tier = "default";
		}
	},
};
