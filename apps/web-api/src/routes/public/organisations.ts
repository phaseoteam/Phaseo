import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

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
		model_id: String(row.model_id ?? ""),
		name: String(row.name ?? ""),
		organisation_id: organisation.organisation_id,
		organisation_name: organisation.name,
		organisation_colour: organisation.colour,
		description: row.description ?? null,
		status: row.status ?? null,
		hidden: Boolean(row.hidden),
		release_date: row.release_date ?? null,
		announcement_date: row.announcement_date ?? null,
		updated_at: row.updated_at ?? null,
		api_model_id: row.api_model_id ?? null,
		input_types: [],
		output_types: [],
		input_modalities: [],
		output_modalities: [],
		...primaryDateFields(row.release_date, row.announcement_date),
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
		.from("data_organisations")
		.select("organisation_id,name,colour")
		.eq("organisation_id", organisationId)
		.maybeSingle();
	if (error) throw error;
	return data as OrganisationIdentity | null;
}

export const publicOrganisationsRouter = new Hono<{ Bindings: Env }>();

publicOrganisationsRouter.get("/organisations/:organisationId/header", async (c) => {
	const organisationId = c.req.param("organisationId");
	try {
		const { data, error } = await getDataClient(c.env)
			.from("data_organisations")
			.select("organisation_id,name,country_code")
			.eq("organisation_id", organisationId)
			.maybeSingle();
		if (error) throw error;
		if (!data) return c.json({ error: "organisation_not_found" }, 404);
		return withPublicCache(c.json({ organisation: {
			organisation_id: data.organisation_id,
			name: data.name ?? "",
			country_code: data.country_code ?? null,
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
			.from("data_models")
			.select("model_id,name,status,release_date,announcement_date,organisation_id,hidden")
			.eq("organisation_id", organisationId)
			.eq("hidden", false)
			.order("release_date", { ascending: false });
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
		const [organisationResult, modelsResult] = await Promise.all([
			client
				.from("data_organisations")
				.select("organisation_id,name,country_code,description,colour,updated_at,organisation_links:data_organisation_links(url,platform)")
				.eq("organisation_id", organisationId)
				.maybeSingle(),
			client
				.from("data_models")
				.select("model_id,name,status,release_date,announcement_date,hidden")
				.eq("organisation_id", organisationId)
				.eq("hidden", false)
				.not("release_date", "is", null)
				.not("announcement_date", "is", null)
				.order("release_date", { ascending: false })
				.limit(limit),
		]);
		if (organisationResult.error) throw organisationResult.error;
		if (modelsResult.error) throw modelsResult.error;
		if (!organisationResult.data) {
			return c.json({ error: "organisation_not_found" }, 404);
		}
		const organisationRow = organisationResult.data;
		const identity: OrganisationIdentity = {
			organisation_id: organisationId,
			name: organisationRow.name ?? null,
			colour: organisationRow.colour ?? null,
		};
		const models = (modelsResult.data ?? [])
			.map((row) => toModelCard(row, identity))
			.sort((left, right) =>
				Number(right.primary_timestamp ?? 0) - Number(left.primary_timestamp ?? 0),
			);
		const groupedModels: Record<string, typeof models> = {};
		for (const model of models) {
			const status = String(model.status ?? "unknown");
			(groupedModels[status] ??= []).push(model);
		}
		const links = Array.isArray(organisationRow.organisation_links)
			? organisationRow.organisation_links
			: [];
		const organisation = {
			organisation_id: organisationRow.organisation_id ?? organisationId,
			name: organisationRow.name ?? organisationId,
			country_code: organisationRow.country_code ?? null,
			description: organisationRow.description ?? null,
			colour: organisationRow.colour ?? null,
			updated_at: organisationRow.updated_at ?? null,
			organisation_links: links.map((link) => ({
				platform: link.platform,
				url: link.url,
			})),
			recent_models: models.slice(0, limit),
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
