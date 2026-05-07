import { Hono } from "hono";
import type { Env } from "@/runtime/types";

function buildFeatureDisabledPayload(feature: string) {
	return {
		error: "not_implemented",
		reason: "feature_temporarily_disabled",
		feature,
		message: `${feature} endpoints are temporarily disabled.`,
	};
}

export function createFeatureDisabledRoutes(feature: string) {
	const routes = new Hono<Env>();
	const respond = () =>
		new Response(JSON.stringify(buildFeatureDisabledPayload(feature)), {
			status: 501,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
		});

	routes.all("/", () => respond());
	routes.all("*", () => respond());
	return routes;
}

export const disabledVideosRoutes = createFeatureDisabledRoutes("videos");
export const disabledBatchRoutes = createFeatureDisabledRoutes("batches");
export const disabledFilesRoutes = createFeatureDisabledRoutes("files");
export const disabledMusicRoutes = createFeatureDisabledRoutes("music");
