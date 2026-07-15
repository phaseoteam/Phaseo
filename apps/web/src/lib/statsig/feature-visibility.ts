import "server-only";

import {
	GATEWAY_IO_LOGGING_GATE,
	PRESET_EXPERIMENTS_GATE,
	WEB_FEATURE_GATES,
	compareWebFeatureGates,
	shouldShowGaFeatureInDirectory,
	type WebFeatureGate,
} from "@/lib/statsig/shared";
import {
	gatewayIoLoggingFlag,
	presetExperimentsFlag,
} from "@/lib/flags";
import { isAdminViewer } from "@/lib/auth/getViewerRole";

async function featureGatePasses(featureKey: string): Promise<boolean> {
	switch (featureKey) {
		case GATEWAY_IO_LOGGING_GATE:
			return gatewayIoLoggingFlag();
		case PRESET_EXPERIMENTS_GATE:
			return presetExperimentsFlag();
		default:
			return false;
	}
}

export async function getVisibleWebBetaFeatures(): Promise<WebFeatureGate[]> {
	const isAdmin = await isAdminViewer();
	const features = WEB_FEATURE_GATES as readonly WebFeatureGate[];
	const visibility = await Promise.all(
		features.map(async (feature) => {
			if (feature.stage === "internal") {
				return isAdmin || featureGatePasses(feature.key);
			}
			if (feature.stage === "beta") {
				return isAdmin || featureGatePasses(feature.key);
			}
			if (feature.stage === "ga") {
				return shouldShowGaFeatureInDirectory(feature);
			}
			return false;
		})
	);

	return features.filter((_, index) => visibility[index]).sort(
		compareWebFeatureGates
	);
}
