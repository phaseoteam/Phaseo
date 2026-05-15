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

	const register = (method: "get" | "post" | "delete", path: string) => {
		routes[method](path, () => respond());
	};

	switch (feature) {
		case "videos":
			for (const path of ["/", "/models", "/:id", "/:id/content"]) {
				register("get", path);
			}
			for (const path of ["/", "/:id/cancel", "/:id/download_url"]) {
				register("post", path);
			}
			register("delete", "/:id");
			break;
		case "batches":
			register("post", "/");
			register("get", "/:id");
			register("post", "/:id/cancel");
			break;
		case "files":
			register("post", "/");
			register("get", "/");
			register("get", "/:id");
			register("get", "/:id/content");
			break;
		case "music":
			register("post", "/");
			register("get", "/:id");
			break;
		default:
			break;
	}

	routes.all("/", () => respond());
	routes.all("*", () => respond());
	return routes;
}

export const disabledVideosRoutes = createFeatureDisabledRoutes("videos");
export const disabledBatchRoutes = createFeatureDisabledRoutes("batches");
export const disabledFilesRoutes = createFeatureDisabledRoutes("files");
export const disabledMusicRoutes = createFeatureDisabledRoutes("music");
