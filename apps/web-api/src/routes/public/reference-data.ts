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

function metadata(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: {};
}

function labOrganisation(row: Record<string, unknown>) {
	const details = metadata(row.metadata);
	return {
		organisation_id: row.lab_slug,
		name: row.name ?? null,
		country_code: row.country_code ?? null,
		colour: details.colour ?? null,
		display_name: details.display_name ?? row.name ?? null,
		logo: details.logo ?? null,
		logo_url: details.logo_url ?? null,
	};
}

async function getCountrySummaries(env: Env) {
	const client = getDataClient(env);
	const [organisationsResult, catalogue] = await Promise.all([
		client.from("v2_labs").select("lab_slug,name,country_code,metadata"),
		fetchModelsPageCatalogue(env, {}, "v2"),
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
		const mappedOrganisation = labOrganisation(organisation);
		const organisationId = String(mappedOrganisation.organisation_id ?? "");
		const models = [...(modelsByOrganisation.get(organisationId) ?? [])]
			.sort((left, right) => Number(right.primary_timestamp ?? 0) - Number(left.primary_timestamp ?? 0))
			.map((model) => ({
				...model,
				organisation_name: mappedOrganisation.name ?? null,
				organisation_colour: mappedOrganisation.colour ?? null,
				organisation: {
					name: mappedOrganisation.name ?? null,
					colour: mappedOrganisation.colour ?? null,
				},
			}));
		const organisations = countries.get(iso) ?? [];
		organisations.push({
			organisation_id: organisationId,
			organisation_name: mappedOrganisation.name ?? null,
			colour: mappedOrganisation.colour ?? null,
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
	return (await getCountrySummaries(env)).map(({ iso, countryName, totalOrganisations, totalModels }) => ({ iso, countryName, totalOrganisations, totalModels }));
}

publicReferenceDataRouter.get("/organisations", async (c) => {
	try {
		const { data, error } = await getDataClient(c.env)
			.from("v2_labs")
			.select("lab_slug,name,country_code,metadata")
			.order("name", { ascending: true });
		if (error) throw error;
		const organisations = (data ?? []).map((row) => {
			const organisation = labOrganisation(row);
			return {
				organisation_id: organisation.organisation_id,
				organisation_name: organisation.name,
				country_code: organisation.country_code,
				colour: organisation.colour,
			};
		});
		return withPublicCache(c.json({ organisations }), policy("web-api-organisations"));
	} catch (error) {
		console.error("[web-api/reference] organisations failed", error);
		return c.json({ error: "organisations_unavailable" }, 503);
	}
});

publicReferenceDataRouter.get("/benchmarks", async (c) => {
	try {
		const sorted = c.req.query("sort") === "coverage";
		let query = getDataClient(c.env).from("v2_benchmarks").select("benchmark_id,name,total_models");
		query = sorted
			? query.order("total_models", { ascending: false, nullsFirst: false }).order("name", { ascending: true })
			: query.order("name", { ascending: true });
		const { data, error } = await query;
		if (error) throw error;
		const benchmarks = (data ?? []).map((row) => ({
			benchmark_id: row.benchmark_id,
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
		const client = getDataClient(c.env);
		const [benchmarkResult, resultsResult] = await Promise.all([
			client.from("v2_benchmarks")
				.select("benchmark_id,name,category,ascending_order,total_models,link,benchmark_type")
				.eq("benchmark_id", benchmarkId)
				.maybeSingle(),
			client.from("v2_benchmark_results")
				.select("result_id,model_slug,score,is_self_reported,other_info,source_link,created_at,updated_at,rank")
                .or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`)
				.eq("benchmark_id", benchmarkId)
				.order("rank", { ascending: true, nullsFirst: false }),
		]);
		if (benchmarkResult.error) throw benchmarkResult.error;
		if (resultsResult.error) throw resultsResult.error;
		const data = benchmarkResult.data;
		if (!data) return notFound(c, "benchmark");
		const modelSlugs = [...new Set((resultsResult.data ?? []).map((row) => row.model_slug).filter(Boolean))];
		const modelsResult = modelSlugs.length > 0
			? await client.from("v2_models")
				.select("model_slug,name,released_at,announced_at,lab_slug,hidden,lab:v2_labs!v2_models_lab_slug_fkey(lab_slug,name,metadata)")
				.in("model_slug", modelSlugs)
			: { data: [], error: null };
		if (modelsResult.error) throw modelsResult.error;
		const modelsBySlug = new Map((modelsResult.data ?? []).map((model) => [model.model_slug, model]));
		const results = (resultsResult.data ?? []).flatMap((result) => {
			const model = modelsBySlug.get(result.model_slug);
			if (!model || model.hidden) return [];
			const labRow = Array.isArray(model.lab) ? model.lab[0] : model.lab;
			const organisation = labRow ? labOrganisation(labRow) : null;
			return [{
				id: result.result_id,
				model_id: result.model_slug,
				score: result.score,
				is_self_reported: Boolean(result.is_self_reported),
				other_info: result.other_info ?? null,
				source_link: result.source_link ?? null,
				created_at: result.created_at ?? null,
				updated_at: result.updated_at ?? null,
				rank: result.rank ?? null,
				model: {
					model_id: model.model_slug,
					name: model.name ?? null,
					release_date: model.released_at ?? null,
					announcement_date: model.announced_at ?? null,
					organisation,
				},
			}];
		});

		return withPublicCache(c.json({
			benchmark: {
				id: data.benchmark_id,
				name: data.name ?? null,
				category: data.category ?? null,
				ascending_order:
					typeof data.ascending_order === "boolean" ? data.ascending_order : null,
				total_models: data.total_models ?? null,
				link: data.link ?? null,
				type: data.benchmark_type ?? null,
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
		const { data, error } = await getDataClient(c.env).from("v2_providers")
			.select("provider_slug,name,country_code")
			.eq("provider_slug", providerId).maybeSingle();
		if (error) throw error;
		if (!data) return notFound(c, "api_provider");
		return withPublicCache(c.json({ provider: {
			api_provider_id: data.provider_slug,
			api_provider_name: data.name,
			country_code: data.country_code,
		} }), policy(`web-api-provider-${encodeURIComponent(providerId).replace(/%/g, "")}`));
	} catch (error) {
		console.error("[web-api/reference] provider header failed", { providerId, error });
		return c.json({ error: "provider_unavailable" }, 503);
	}
});

publicReferenceDataRouter.get("/sources", async (c) => {
	try {
		const { data, error } = await getDataClient(c.env)
			.from("v2_providers")
			.select("provider_slug,name,country_code")
			.order("name", { ascending: true });
		if (error) throw error;
		const sources = (data ?? [])
			.map((row) => ({
				api_provider_id: row.provider_slug,
				api_provider_name: row.name ?? "",
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
			.from("v2_model_families")
			.select("family_id:family_slug,family_name:name,organisation_id:lab_slug,created_at,organisation:v2_labs(name)")
			.order("created_at", { ascending: false });
		if (error) throw error;
		const families = (data ?? []).map((row) => {
			const organisation = Array.isArray(row.organisation)
				? row.organisation[0]
				: row.organisation;
			const organisationId = row.organisation_id ?? String(row.family_id ?? "").split("/")[0] ?? "";
			return {
				family_id: row.family_id,
				family_name: row.family_name ?? row.family_id,
				organisation_id: organisationId,
				organisation_name: organisation?.name ?? organisationId,
				created_at: row.created_at ?? null,
			};
		});
		return withPublicCache(c.json({ families }), policy("web-api-families"));
	} catch (error) {
		console.error("[web-api/reference] families failed", error);
		return c.json({ error: "families_unavailable" }, 503);
	}
});

publicReferenceDataRouter.get("/families/:familyId", async (c) => {
	const familyId = c.req.param("familyId");
	try {
		const client = getDataClient(c.env);
		const { data, error } = await client
			.from("v2_model_families")
			.select("family_id:family_slug,family_name:name")
			.eq("family_slug", familyId)
			.maybeSingle();
		if (error) throw error;
		if (!data) return notFound(c, "family");
		const modelsResult = await client.from("v2_models")
			.select("model_slug,name,lab_slug,status,released_at,announced_at,lab:v2_labs!v2_models_lab_slug_fkey(lab_slug,name,country_code,metadata)")
			.eq("family_slug", familyId)
			.eq("hidden", false)
			.order("released_at", { ascending: false, nullsFirst: false });
		if (modelsResult.error) throw modelsResult.error;
		const models = (modelsResult.data ?? [])
			.map((model) => {
				const lab = Array.isArray(model.lab) ? model.lab[0] ?? null : model.lab ?? null;
				return {
				model_id: model.model_slug,
				name: model.name,
				organisation_id: model.lab_slug,
				status: model.status ?? null,
				release_date: model.released_at ?? null,
				announcement_date: model.announced_at ?? null,
				organisation: lab ? labOrganisation(lab) : null,
				};
			});
		return withPublicCache(c.json({ family_id: data.family_id, family_name: data.family_name, models }), policy(`web-api-family-${encodeURIComponent(familyId).replace(/%/g, "")}`));
	} catch (error) {
		console.error("[web-api/reference] family failed", { familyId, error });
		return c.json({ error: "family_unavailable" }, 503);
	}
});

publicReferenceDataRouter.get("/subscription-plans", async (c) => {
	try {
		const client = getDataClient(c.env);
		const [{ data, error }, labsResult] = await Promise.all([
			client.from("v2_subscription_plans")
				.select("plan_uuid,plan_id,name,lab_slug,description,frequency,price,currency,link,other_info")
				.order("name", { ascending: true }),
			client.from("v2_labs").select("lab_slug,name,country_code,metadata"),
		]);
		if (error) throw error;
		if (labsResult.error) throw labsResult.error;
		const labs = new Map((labsResult.data ?? []).map((row) => [row.lab_slug, labOrganisation(row)]));
		const byPlanId = new Map<string, Record<string, unknown>>();
		for (const row of data ?? []) {
			if (!row.plan_id) continue;
			const plan = byPlanId.get(row.plan_id) ?? {
				plan_uuid: row.plan_uuid,
				plan_id: row.plan_id,
				name: row.name,
				organisation_id: row.lab_slug,
				description: row.description,
				link: row.link,
				other_info: row.other_info,
				organisation: labs.get(row.lab_slug) ?? null,
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
			.from("v2_subscription_plans")
			.select("plan_uuid,plan_id,name,lab_slug,description,frequency,price,currency,link,other_info")
			.eq("plan_id", planId);
		if (planError) throw planError;
		if (!planRows?.length) return notFound(c, "subscription_plan");
		const primary = planRows[0];
		const [featuresResult, modelLinksResult, labResult] = await Promise.all([
			client.from("v2_subscription_plan_features").select("feature_name,feature_value,feature_description,other_info").eq("plan_uuid", primary.plan_uuid).order("feature_name", { ascending: true }),
			client.from("v2_subscription_plan_models").select("model_slug,model_info,rate_limit,other_info").or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`).eq("plan_uuid", primary.plan_uuid).order("model_slug", { ascending: true }),
			client.from("v2_labs").select("lab_slug,name,country_code,metadata").eq("lab_slug", primary.lab_slug).maybeSingle(),
		]);
		if (featuresResult.error) throw featuresResult.error;
		if (modelLinksResult.error) throw modelLinksResult.error;
		if (labResult.error) throw labResult.error;
		const modelSlugs = [...new Set((modelLinksResult.data ?? []).map((row) => row.model_slug).filter(Boolean))];
		const modelRowsResult = modelSlugs.length > 0
			? await client.from("v2_models").select("model_slug,name,lab_slug,hidden").in("model_slug", modelSlugs)
			: { data: [], error: null };
		if (modelRowsResult.error) throw modelRowsResult.error;
		const modelRows = new Map((modelRowsResult.data ?? []).map((row) => [row.model_slug, row]));
		const models = (modelLinksResult.data ?? []).flatMap((row) => {
			const model = modelRows.get(row.model_slug);
			if (!model || model.hidden) return [];
			return [{
				model_id: row.model_slug,
				model_info: row.model_info,
				rate_limit: row.rate_limit,
				other_info: row.other_info,
				model: {
					model_id: model.model_slug,
					name: model.name,
					organisation_id: model.lab_slug,
					organisation_name: model.lab_slug === primary.lab_slug ? labResult.data?.name ?? null : null,
				},
			}];
		});
		const plan = {
			plan_uuid: primary.plan_uuid,
			plan_id: primary.plan_id,
			name: primary.name,
			organisation_id: primary.lab_slug,
			description: primary.description,
			link: primary.link,
			other_info: primary.other_info,
			organisation: labResult.data ? labOrganisation(labResult.data) : null,
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
