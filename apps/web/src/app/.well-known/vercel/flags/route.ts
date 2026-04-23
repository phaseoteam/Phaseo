import { mergeProviderData } from "flags";
import { createFlagsDiscoveryEndpoint, getProviderData } from "flags/next";
import { getProviderData as getStatsigProviderData } from "@flags-sdk/statsig";

import * as flags from "../../../../../flags";

export const GET = createFlagsDiscoveryEndpoint(async () => {
	return mergeProviderData([
		getProviderData(flags),
		...(process.env.STATSIG_CONSOLE_API_KEY && process.env.STATSIG_PROJECT_ID
			? [
					getStatsigProviderData({
						consoleApiKey: process.env.STATSIG_CONSOLE_API_KEY,
						projectId: process.env.STATSIG_PROJECT_ID,
					}),
				]
			: []),
	]);
});
