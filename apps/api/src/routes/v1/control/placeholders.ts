// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { guardAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { json, withRuntime, cacheHeaders } from "../../utils";
import { requireCapability } from "./route-helpers";
import { fetchCatalogue } from "./models.catalogue";
import { getEndpointMetadata } from "./endpoint-metadata";

async function handleListEndpoints(req: Request) {
	const auth = await guardAuth(req);
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.MODELS_READ);
	if (scopeError) return scopeError;

	try {
		const catalogue = await fetchCatalogue({ availability: "all" });
		const endpointMap = new Map<string, {
			id: string;
			public_path: string;
			collection: string;
			model_count: number;
			provider_count: number;
			models: Set<string>;
			providers: Set<string>;
		}>();

		for (const model of catalogue) {
			for (const endpoint of model.endpoints) {
				const metadata = getEndpointMetadata(endpoint);
				const current = endpointMap.get(endpoint) ?? {
					id: endpoint,
					public_path: metadata.public_path,
					collection: metadata.collection,
					model_count: 0,
					provider_count: 0,
					models: new Set<string>(),
					providers: new Set<string>(),
				};
				current.models.add(model.model_id);
				for (const provider of model.providers) {
					if (provider.endpoints.some((candidate) => candidate === endpoint)) {
						current.providers.add(provider.api_provider_id);
					}
				}
				endpointMap.set(endpoint, current);
			}
		}

		const data = Array.from(endpointMap.values())
			.map((endpoint) => ({
				id: endpoint.id,
				capability_id: endpoint.id,
				public_path: endpoint.public_path,
				collection: endpoint.collection,
				model_count: endpoint.models.size,
				provider_count: endpoint.providers.size,
			}))
			.sort((a, b) => a.public_path.localeCompare(b.public_path));

		return json(
			{
				ok: true,
				endpoints: data.map((endpoint) => endpoint.id),
				data,
				sample_models: catalogue.slice(0, 10).map((model) => model.model_id),
			},
			200,
			cacheHeaders({
				scope: "endpoints:shared:v1",
				ttlSeconds: 1800,
				staleSeconds: 1800,
				varyHeaders: [],
			})
		);
	} catch (error: any) {
		return json(
			{ ok: false, error: "failed", message: String(error?.message ?? error) },
			500,
			{ "Cache-Control": "no-store" }
		);
	}
}

export const placeholdersRoutes = new Hono<Env>();

placeholdersRoutes.get("/endpoints", withRuntime(handleListEndpoints));
