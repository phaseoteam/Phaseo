import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";
import { fetchModelsPageCatalogue } from "@/models/page-catalogue";

const ORGANISATION_CACHE = {
	edgeTtlSeconds: 24 * 60 * 60,
	staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
} as const;

type OrganisationIdentity = {
	organisation_id: string;
	name: string | null;
	colour: string | null;
};

function parseLimit(value: string | undefined): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 8;
	return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

function primaryDateFields(releaseDate: unknown, announcementDate: unknown) {
	const primaryDate = [releaseDate, announcementDate].find(
		(value): value is string => typeof value === "string" && value.length > 0,
	) ?? null;
	if (!primaryDate) {
		return { primary_date: null, primary_timestamp: null, primary_group_key: null };
	}
	const timestamp = Date.parse(primaryDate);
	if (!Number.isFinite(timestamp)) {
		return { primary_date: primaryDate, primary_timestamp: null, primary_group_key: null };
	}
	const date = new Date(timestamp);
	return {
		primary_date: primaryDate,
		primary_timestamp: timestamp,
		primary_group_key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
	};
}

function toModelCard(row: Record<string, unknown>, organisation: OrganisationIdentity) {
	return {
		model_id: String(row.model_slug ?? row.model_id ?? ""),
		name: String(row.name ?? ""),
		organisation_id: organisation.organisation_id,
		organisation_name: organisation.name,
		organisation_colour: organisation.colour,
		description: row.description ?? null,
		status: row.status ?? null,
		hidden: Boolean(row.hidden),
		release_date: row.released_at ?? row.release_date ?? null,
		announcement_date: row.announced_at ?? row.announcement_date ?? null,
		updated_at: row.updated_at ?? null,
		api_model_id: row.model_slug ?? row.api_model_id ?? null,
		input_types: row.input_modalities ?? [],
		output_types: row.output_modalities ?? [],
		input_modalities: row.input_modalities ?? [],
		output_modalities: row.output_modalities ?? [],
		...primaryDateFields(row.released_at ?? row.release_date, row.announced_at ?? row.announcement_date),
	};
}

function cacheTags(organisationId: string, resource: string) {
	return [
		"web-api-reference-data",
		"web-api-organisations",
		`web-api-organisations-${resource}`,
		`web-api-organisation-${encodeURIComponent(organisationId).replace(/%/g, "")}`.slice(0, 128),
	];
}

async function getOrganisationIdentity(env: Env, organisationId: string) {
	const { data, error } = await getDataClient(env)
		.from("v2_labs")
		.select("lab_slug,name,metadata")
		.eq("lab_slug", organisationId)
		.maybeSingle();
	if (error) throw error;
	if (!data) return null;
	const details = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
		? data.metadata as Record<string, unknown>
		: {};
	return { organisation_id: data.lab_slug, name: data.name, colour: typeof details.colour === "string" ? details.colour : null };
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
		const organisation = await getOrganisationIdentity(c.env, organisationId);
		if (!organisation) return c.json({ error: "organisation_not_found" }, 404);
		const { data, error } = await getDataClient(c.env)
			.from("v2_models")
			.select("model_slug,name,description,status,released_at,announced_at,lab_slug,hidden,input_modalities,output_modalities,updated_at")
			.eq("lab_slug", organisationId)
			.eq("hidden", false)
			.order("released_at", { ascending: false });
		if (error) throw error;
		const models = (data ?? []).map((row) => toModelCard(row, organisation));
		return withPublicCache(c.json({ models }), {
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
