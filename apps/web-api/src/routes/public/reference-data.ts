import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache, type PublicCachePolicy } from "@/http/cache";
import { fetchModelsPageCatalogue } from "@/models/page-catalogue";

const REFERENCE_CACHE: PublicCachePolicy = {
	edgeTtlSeconds: 24 * 60 * 60,
	staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
	cacheTags: ["web-api-reference-data"],
};

function policy(tag: string): PublicCachePolicy {
	return { ...REFERENCE_CACHE, cacheTags: [...(REFERENCE_CACHE.cacheTags ?? []), tag] };
}

export const publicReferenceDataRouter = new Hono<{ Bindings: Env }>();

function notFound(c: { json: (value: unknown, status: number) => Response }, resource: string) {
	return c.json({ error: `${resource}_not_found` }, 404);
}

function countryName(iso: string) {
	try {
		return new Intl.DisplayNames(["en"], { type: "region" }).of(iso) ?? iso;
	} catch {
		return iso;
	}
}

async function getCountrySummaries(env: Env) {
	const client = getDataClient(env);
	const [organisationsResult, catalogue] = await Promise.all([
		client.from("data_organisations").select("organisation_id,name,country_code,colour"),
		fetchModelsPageCatalogue(env),
	]);
	if (organisationsResult.error) throw organisationsResult.error;

	const modelsByOrganisation = new Map<string, Array<Record<string, unknown>>>();
	for (const model of catalogue.models) {
		const organisationId = String(model.organisation_id ?? "").trim();
		if (!organisationId) continue;
		const models = modelsByOrganisation.get(organisationId) ?? [];
		models.push({
			...model,
			organisation_id: organisationId,
		});
		modelsByOrganisation.set(organisationId, models);
	}

	const countries = new Map<string, Array<Record<string, unknown>>>();
	for (const organisation of organisationsResult.data ?? []) {
		const iso = String(organisation.country_code ?? "").trim().toUpperCase();
		if (!iso) continue;
		const models = [...(modelsByOrganisation.get(organisation.organisation_id) ?? [])]
			.sort((left, right) => Number(right.primary_timestamp ?? 0) - Number(left.primary_timestamp ?? 0))
			.map((model) => ({
				...model,
				organisation_name: organisation.name ?? null,
				organisation_colour: organisation.colour ?? null,
				organisation: {
					name: organisation.name ?? null,
					colour: organisation.colour ?? null,
				},
			}));
		const organisations = countries.get(iso) ?? [];
		organisations.push({
			organisation_id: organisation.organisation_id,
			organisation_name: organisation.name ?? null,
			colour: organisation.colour ?? null,
			models,
			modelCount: models.length,
			latestModel: models[0] ?? null,
		});
		countries.set(iso, organisations);
	}

	return Array.from(countries.entries())
		.map(([iso, organisations]) => {
			const sortedOrganisations = [...organisations].sort((left, right) => Number(right.modelCount) - Number(left.modelCount));
			const models = sortedOrganisations.flatMap((organisation) => organisation.models as Array<Record<string, unknown>>)
				.sort((left, right) => Number(right.primary_timestamp ?? 0) - Number(left.primary_timestamp ?? 0));
			return {
				iso,
				countryName: countryName(iso),
				totalOrganisations: sortedOrganisations.length,
				totalModels: models.length,
				recentModels: models.slice(0, 4),
				latestModel: models[0] ?? null,
				organisations: sortedOrganisations,
			};
		})
		.sort((left, right) => right.totalModels - left.totalModels);
}

async function getCountryListSummaries(env: Env) {
	const result = await getDataClient(env).rpc("get_public_country_summaries");
	if (!result.error) return (result.data ?? []).map((row) => ({
		iso: String(row.iso ?? "").toUpperCase(),
		countryName: countryName(String(row.iso ?? "").toUpperCase()),
		totalOrganisations: Number(row.total_organisations ?? 0),
		totalModels: Number(row.total_models ?? 0),
	}));
	const missing = result.error.code === "PGRST202" || /could not find|does not exist/i.test(result.error.message ?? "");
	if (!missing) throw result.error;
	return (await getCountrySummaries(env)).map(({ iso, countryName, totalOrganisations, totalModels }) => ({ iso, countryName, totalOrganisations, totalModels }));
}

publicReferenceDataRouter.get("/organisations", async (c) => {
	try {
		const { data, error } = await getDataClient(c.env)
			.from("data_organisations")
			.select("organisation_id,name,country_code,colour")
			.order("name", { ascending: true });
		if (error) throw error;
		const organisations = (data ?? []).map((row) => ({
			organisation_id: row.organisation_id,
			organisation_name: row.name ?? null,
			country_code: row.country_code ?? null,
			colour: row.colour ?? null,
		}));
		return withPublicCache(c.json({ organisations }), policy("web-api-organisations"));
	} catch (error) {
		console.error("[web-api/reference] organisations failed", error);
		return c.json({ error: "organisations_unavailable" }, 503);
	}
});

publicReferenceDataRouter.get("/benchmarks", async (c) => {
	try {
		const sorted = c.req.query("sort") === "coverage";
		let query = getDataClient(c.env).from("data_benchmarks").select("id,name,total_models");
		query = sorted
			? query.order("total_models", { ascending: false, nullsFirst: false }).order("name", { ascending: true })
			: query.order("name", { ascending: true });
		const { data, error } = await query;
		if (error) throw error;
		const benchmarks = (data ?? []).map((row) => ({
			benchmark_id: row.id,
			benchmark_name: row.name ?? "",
			total_models: row.total_models ?? 0,
		}));
		return withPublicCache(c.json({ benchmarks }), policy("web-api-benchmarks"));
	} catch (error) {
		console.error("[web-api/reference] benchmarks failed", error);
		return c.json({ error: "benchmarks_unavailable" }, 503);
	}
});

publicReferenceDataRouter.get("/benchmarks/:benchmarkId", async (c) => {
	const benchmarkId = c.req.param("benchmarkId");
	try {
		const { data, error } = await getDataClient(c.env)
			.from("data_benchmarks")
			.select(`id,name,category,ascending_order,total_models,link,type,data_benchmark_results(id,model_id,score,is_self_reported,other_info,source_link,created_at,updated_at,rank,data_models(model_id,name,release_date,announcement_date,organisation_id,hidden,data_organisations(*)))`)
			.eq("id", benchmarkId)
			.maybeSingle();
		if (error) throw error;
		if (!data) return notFound(c, "benchmark");

		const results = (data.data_benchmark_results ?? [])
			.filter((result) => {
				const model = Array.isArray(result.data_models)
					? result.data_models[0]
					: result.data_models;
				return model && !model.hidden;
			})
			.map((result) => {
				const model = Array.isArray(result.data_models)
					? result.data_models[0]
					: result.data_models;
				const organisationRow = Array.isArray(model.data_organisations)
					? model.data_organisations[0]
					: model.data_organisations;
				const organisation = organisationRow
					? {
						organisation_id: organisationRow.organisation_id,
						name: organisationRow.name ?? null,
						colour: organisationRow.colour ?? null,
						display_name: organisationRow.display_name ?? organisationRow.name ?? null,
						logo: organisationRow.logo ?? null,
						logo_url: organisationRow.logo_url ?? null,
					}
					: null;
				return {
					id: result.id,
					model_id: result.model_id,
					score: result.score,
					is_self_reported: Boolean(result.is_self_reported),
					other_info: result.other_info ?? null,
					source_link: result.source_link ?? null,
					created_at: result.created_at ?? null,
					updated_at: result.updated_at ?? null,
					rank: result.rank ?? null,
					model: {
						model_id: model.model_id,
						name: model.name ?? null,
						release_date: model.release_date ?? null,
						announcement_date: model.announcement_date ?? null,
						organisation,
					},
				};
			});

		return withPublicCache(c.json({
			benchmark: {
				id: data.id,
				name: data.name ?? null,
				category: data.category ?? null,
				ascending_order:
					typeof data.ascending_order === "boolean" ? data.ascending_order : null,
				total_models: data.total_models ?? null,
				link: data.link ?? null,
				type: data.type ?? null,
				results,
			},
		}), policy(`web-api-benchmark-${encodeURIComponent(benchmarkId).replace(/%/g, "")}`));
	} catch (error) {
		console.error("[web-api/reference] benchmark failed", { benchmarkId, error });
		return c.json({ error: "benchmark_unavailable" }, 503);
	}
});

/**
 * Stable provider identity data. Live availability, traffic, and latency stay
 * in separate telemetry resources so this list can retain a long cache TTL.
 */
publicReferenceDataRouter.get("/api-providers/:providerId/header", async (c) => {
	const providerId = c.req.param("providerId").trim();
	if (["inception", "inceptron", "nextbit"].includes(providerId.toLowerCase())) return notFound(c, "api_provider");
	try {
		const { data, error } = await getDataClient(c.env).from("data_api_providers")
			.select("api_provider_id,api_provider_name,country_code")
			.eq("api_provider_id", providerId).maybeSingle();
		if (error) throw error;
		if (!data) return notFound(c, "api_provider");
		return withPublicCache(c.json({ provider: data }), policy(`web-api-provider-${encodeURIComponent(providerId).replace(/%/g, "")}`));
	} catch (error) {
		console.error("[web-api/reference] provider header failed", { providerId, error });
		return c.json({ error: "provider_unavailable" }, 503);
	}
});

publicReferenceDataRouter.get("/sources", async (c) => {
	try {
		const { data, error } = await getDataClient(c.env)
			.from("data_api_providers")
			.select("api_provider_id,api_provider_name,country_code")
			.order("api_provider_name", { ascending: true });
		if (error) throw error;
		const sources = (data ?? [])
			.map((row) => ({
				api_provider_id: row.api_provider_id,
				api_provider_name: row.api_provider_name ?? "",
				country_code: row.country_code ?? null,
			}))
			.filter((source) => Boolean(source.api_provider_id));
		return withPublicCache(c.json({ sources }), policy("web-api-sources"));
	} catch (error) {
		console.error("[web-api/reference] sources failed", error);
		return c.json({ error: "sources_unavailable" }, 503);
	}
});

publicReferenceDataRouter.get("/families", async (c) => {
	try {
		const { data, error } = await getDataClient(c.env)
			.from("data_model_families")
			.select("family_id,family_name,organisation_id")
			.order("family_name", { ascending: true });
		if (error) throw error;
		const families = (data ?? []).map((row) => ({
			family_id: row.family_id,
			family_name: row.family_name ?? row.family_id,
			organisation_id: row.organisation_id ?? String(row.family_id ?? "").split("/")[0] ?? "",
		}));
		return withPublicCache(c.json({ families }), policy("web-api-families"));
	} catch (error) {
		console.error("[web-api/reference] families failed", error);
		return c.json({ error: "families_unavailable" }, 503);
	}
});

publicReferenceDataRouter.get("/families/:familyId", async (c) => {
	const familyId = c.req.param("familyId");
	try {
		const { data, error } = await getDataClient(c.env)
			.from("data_model_families")
			.select(`family_id,family_name,models:data_models(model_id,name,organisation_id,status,hidden,release_date,announcement_date,organisation:data_organisations!data_models_organisation_id_fkey(name,colour,country_code))`)
			.eq("family_id", familyId)
			.maybeSingle();
		if (error) throw error;
		if (!data) return notFound(c, "family");
		const models = (data.models ?? [])
			.filter((model) => !model.hidden)
			.map((model) => ({
				model_id: model.model_id,
				name: model.name,
				organisation_id: model.organisation_id,
				status: model.status ?? null,
				release_date: model.release_date ?? null,
				announcement_date: model.announcement_date ?? null,
				organisation: Array.isArray(model.organisation) ? model.organisation[0] ?? null : model.organisation ?? null,
			}));
		return withPublicCache(c.json({ family_id: data.family_id, family_name: data.family_name, models }), policy(`web-api-family-${encodeURIComponent(familyId).replace(/%/g, "")}`));
	} catch (error) {
		console.error("[web-api/reference] family failed", { familyId, error });
		return c.json({ error: "family_unavailable" }, 503);
	}
});

publicReferenceDataRouter.get("/subscription-plans", async (c) => {
	try {
		const { data, error } = await getDataClient(c.env)
			.from("data_subscription_plans")
			.select("plan_uuid,plan_id,name,organisation_id,description,frequency,price,currency,link,other_info,organisation:data_organisations!organisation_id(organisation_id,name,colour)")
			.order("name", { ascending: true });
		if (error) throw error;
		const byPlanId = new Map<string, Record<string, unknown>>();
		for (const row of data ?? []) {
			if (!row.plan_id) continue;
			const plan = byPlanId.get(row.plan_id) ?? {
				plan_uuid: row.plan_uuid,
				plan_id: row.plan_id,
				name: row.name,
				organisation_id: row.organisation_id,
				description: row.description,
				link: row.link,
				other_info: row.other_info,
				organisation: Array.isArray(row.organisation) ? row.organisation[0] ?? null : row.organisation ?? null,
				prices: [],
			};
			(plan.prices as Array<Record<string, unknown>>).push({ frequency: row.frequency, price: row.price, currency: row.currency, plan_uuid: row.plan_uuid });
			byPlanId.set(row.plan_id, plan);
		}
		const subscriptionPlans = Array.from(byPlanId.values()).filter((plan) => Array.isArray(plan.prices) && plan.prices.length > 0);
		return withPublicCache(c.json({ subscription_plans: subscriptionPlans }), policy("web-api-subscription-plans"));
	} catch (error) {
		console.error("[web-api/reference] subscription plans failed", error);
		return c.json({ error: "subscription_plans_unavailable" }, 503);
	}
});

publicReferenceDataRouter.get("/subscription-plans/:planId", async (c) => {
	const planId = c.req.param("planId");
	try {
		const client = getDataClient(c.env);
		const { data: planRows, error: planError } = await client
			.from("data_subscription_plans")
			.select("plan_uuid,plan_id,name,organisation_id,description,frequency,price,currency,link,other_info,organisation:data_organisations!organisation_id(organisation_id,name,colour)")
			.eq("plan_id", planId);
		if (planError) throw planError;
		if (!planRows?.length) return notFound(c, "subscription_plan");
		const primary = planRows[0];
		const [featuresResult, modelsResult] = await Promise.all([
			client.from("data_subscription_plan_features").select("feature_name,feature_value,feature_description,other_info").eq("plan_uuid", primary.plan_uuid).order("feature_name", { ascending: true }),
			client.from("data_subscription_plan_models").select("model_id,model_info,rate_limit,other_info,model:data_models(model_id,name,organisation_id,hidden,organisation:data_organisations(name))").eq("plan_uuid", primary.plan_uuid).order("model_id", { ascending: true }),
		]);
		if (featuresResult.error) throw featuresResult.error;
		if (modelsResult.error) throw modelsResult.error;
		const models = (modelsResult.data ?? [])
			.filter((row) => {
				const model = Array.isArray(row.model) ? row.model[0] : row.model;
				return model && !model.hidden;
			})
			.map((row) => {
				const model = Array.isArray(row.model) ? row.model[0] : row.model;
				const organisation = Array.isArray(model.organisation) ? model.organisation[0] : model.organisation;
				return { model_id: row.model_id, model_info: row.model_info, rate_limit: row.rate_limit, other_info: row.other_info, model: { model_id: model.model_id, name: model.name, organisation_id: model.organisation_id, organisation_name: organisation?.name ?? null } };
			});
		const plan = {
			plan_uuid: primary.plan_uuid,
			plan_id: primary.plan_id,
			name: primary.name,
			organisation_id: primary.organisation_id,
			description: primary.description,
			link: primary.link,
			other_info: primary.other_info,
			organisation: Array.isArray(primary.organisation) ? primary.organisation[0] ?? null : primary.organisation ?? null,
			features: featuresResult.data ?? [],
			models,
			prices: planRows.map((row) => ({ price: row.price, currency: row.currency, frequency: row.frequency, plan_uuid: row.plan_uuid })),
		};
		return withPublicCache(c.json({ subscription_plan: plan }), policy(`web-api-subscription-plan-${encodeURIComponent(planId).replace(/%/g, "")}`));
	} catch (error) {
		console.error("[web-api/reference] subscription plan failed", { planId, error });
		return c.json({ error: "subscription_plan_unavailable" }, 503);
	}
});

publicReferenceDataRouter.get("/countries", async (c) => {
	try {
		return withPublicCache(c.json({ countries: await getCountryListSummaries(c.env) }), policy("web-api-countries"));
	} catch (error) {
		console.error("[web-api/reference] countries failed", error);
		return c.json({ error: "countries_unavailable" }, 503);
	}
});

publicReferenceDataRouter.get("/countries/:iso", async (c) => {
	const iso = c.req.param("iso").trim().toUpperCase();
	try {
		const country = (await getCountrySummaries(c.env)).find((entry) => entry.iso === iso);
		if (!country) return notFound(c, "country");
		return withPublicCache(c.json({ country }), policy(`web-api-country-${iso}`));
	} catch (error) {
		console.error("[web-api/reference] country failed", { iso, error });
		return c.json({ error: "country_unavailable" }, 503);
	}
});
