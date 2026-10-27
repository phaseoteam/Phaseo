import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";
import { fetchModelsPageCatalogue } from "@/models/page-catalogue";

const ORGANISATION_CACHE = {
	edgeTtlSeconds: 24 * 60 * 60,
	staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
} as const;

function parseLimit(value: string | undefined): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 8;
	return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

function cacheTags(organisationId: string, resource: string) {
	return [
		"web-api-reference-data",
		"web-api-organisations",
		`web-api-organisations-${resource}`,
		`web-api-organisation-${encodeURIComponent(organisationId).replace(/%/g, "")}`.slice(0, 128),
	];
}

async function organisationExists(env: Env, organisationId: string) {
	const { data, error } = await getDataClient(env)
		.from("v2_labs")
		.select("lab_slug")
		.eq("lab_slug", organisationId)
		.maybeSingle();
	if (error) throw error;
	return Boolean(data);
}

export const publicOrganisationsRouter = new Hono<{ Bindings: Env }>();

publicOrganisationsRouter.get("/organisations/:organisationId/header", async (c) => {
	const organisationId = c.req.param("organisationId");
	try {
		const { data, error } = await getDataClient(c.env)
			.from("v2_labs")
			.select("lab_slug,name,country_code,subdivision_code")
			.eq("lab_slug", organisationId)
			.maybeSingle();
		if (error) throw error;
		if (!data) return c.json({ error: "organisation_not_found" }, 404);
		return withPublicCache(c.json({ organisation: {
			organisation_id: data.lab_slug,
			name: data.name ?? "",
			country_code: data.country_code ?? null,
			subdivision_code: data.subdivision_code ?? null,
		} }), {
			...ORGANISATION_CACHE,
			cacheTags: cacheTags(organisationId, "headers"),
		});
	} catch (error) {
		console.error("[web-api/organisations] header failed", { organisationId, error });
		return c.json({ error: "organisation_unavailable" }, 503);
	}
});

publicOrganisationsRouter.get("/organisations/:organisationId/models", async (c) => {
	const organisationId = c.req.param("organisationId");
	try {
		if (!(await organisationExists(c.env, organisationId))) return c.json({ error: "organisation_not_found" }, 404);
		// Same card rows as the overview, so status, providers, pricing and
		// modalities render, and draft or internal models stay out.
		const catalogue = await fetchModelsPageCatalogue(c.env, { organisationId }, "v2");
		const models = catalogue.models.sort((left, right) =>
			Number(right.primary_timestamp ?? 0) - Number(left.primary_timestamp ?? 0),
		);
		// Optional `limit` returns only the newest models, for pages that show a few.
		const limit = c.req.query("limit");
		return withPublicCache(c.json({ models: limit === undefined ? models : models.slice(0, parseLimit(limit)) }), {
			...ORGANISATION_CACHE,
			cacheTags: cacheTags(organisationId, "models"),
		});
	} catch (error) {
		console.error("[web-api/organisations] models failed", { organisationId, error });
		return c.json({ error: "organisation_models_unavailable" }, 503);
	}
});

publicOrganisationsRouter.get("/organisations/:organisationId", async (c) => {
	const organisationId = c.req.param("organisationId");
	const limit = parseLimit(c.req.query("limit"));
	try {
		const client = getDataClient(c.env);
		const [organisationResult, catalogue, linksResult] = await Promise.all([
			client
				.from("v2_labs")
				.select("lab_slug,name,country_code,subdivision_code,description,metadata,updated_at")
				.eq("lab_slug", organisationId)
				.maybeSingle(),
			fetchModelsPageCatalogue(c.env, { organisationId }, "v2"),
			// Organisation links do not yet have a V2 table.
			client.from("v2_lab_links").select("url,platform").eq("lab_slug", organisationId),
		]);
		if (organisationResult.error) throw organisationResult.error;
		if (linksResult.error) throw linksResult.error;
		if (!organisationResult.data) {
			return c.json({ error: "organisation_not_found" }, 404);
		}
		const organisationRow = organisationResult.data;
		const organisationMetadata = organisationRow.metadata && typeof organisationRow.metadata === "object" && !Array.isArray(organisationRow.metadata)
			? organisationRow.metadata as Record<string, unknown>
			: {};
		const performanceModels = catalogue.models
			.sort((left, right) =>
				Number(right.primary_timestamp ?? 0) - Number(left.primary_timestamp ?? 0),
			);
		const models = performanceModels
			.filter((model) => model.primary_date != null)
			.slice(0, limit);
		const groupedModels: Record<string, typeof models> = {};
		for (const model of models) {
			const status = String(model.status ?? "unknown");
			(groupedModels[status] ??= []).push(model);
		}
		const links = linksResult.data ?? [];
		const organisation = {
			organisation_id: organisationRow.lab_slug ?? organisationId,
			name: organisationRow.name ?? organisationId,
			country_code: organisationRow.country_code ?? null,
			subdivision_code: organisationRow.subdivision_code ?? null,
			description: organisationRow.description ?? null,
			colour: typeof organisationMetadata.colour === "string" ? organisationMetadata.colour : null,
			updated_at: organisationRow.updated_at ?? null,
			organisation_links: links.map((link) => ({
				platform: link.platform,
				url: link.url,
			})),
			recent_models: models.slice(0, limit),
			performance_models: performanceModels,
			models: groupedModels,
		};
		return withPublicCache(c.json({ organisation }), {
			...ORGANISATION_CACHE,
			cacheTags: cacheTags(organisationId, "details"),
		});
	} catch (error) {
		console.error("[web-api/organisations] detail failed", { organisationId, error });
		return c.json({ error: "organisation_unavailable" }, 503);
	}
});
