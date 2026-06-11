import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { formatCountryName } from "@/lib/fetchers/countries/utils";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";
import { createAdminClient } from "@/utils/supabase/admin";

export type OgEntity =
	| "organisations"
	| "models"
	| "benchmarks"
	| "api-providers"
	| "countries"
	| "subscription-plans";

export type OgStat = {
	label: string;
	value: string;
	helper?: string;
};

export type OgPayload = {
	id: string;
	name: string;
	logoId?: string;
	subtitle?: string;
	badge?: string;
	stats?: OgStat[];
	flagEmoji?: string;
};

const MAX_CACHE_TAG_LENGTH = 256;

function cacheTagSafe(tag: string): void {
	if (tag.length <= MAX_CACHE_TAG_LENGTH) {
		cacheTag(tag);
	}
}

function cacheEntityTag(prefix: string, value: string | undefined): void {
	const normalized = String(value ?? "").trim();
	if (!normalized) return;
	cacheTagSafe(`${prefix}:${normalized}`);
}

function isoToFlagEmoji(iso2: string): string {
	const base = 0x1f1e6;
	const [a, b] = iso2.toUpperCase();
	return String.fromCodePoint(
		base + (a.charCodeAt(0) - 65),
		base + (b.charCodeAt(0) - 65),
	);
}

async function loadOrganisation(slug: string): Promise<OgPayload | null> {
	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("data_organisations")
		.select("organisation_id, name")
		.eq("organisation_id", slug)
		.single();

	if (error || !data) return null;

	return {
		id: data.organisation_id,
		name: data.name ?? data.organisation_id,
		logoId: data.organisation_id,
	};
}

async function loadModel(modelId: string): Promise<OgPayload | null> {
	const supabase = createAdminClient();
	const { data, error } = await applyHiddenFilter(
		supabase
			.from("data_models")
			.select("model_id, name, organisation_id, status, hidden")
			.eq("model_id", modelId),
		false,
	).single();

	if (error || !data) return null;

	return {
		id: data.model_id,
		name: data.name ?? data.model_id,
		logoId: data.organisation_id ?? undefined,
		badge: data.status ?? undefined,
	};
}

async function loadBenchmark(slug: string): Promise<OgPayload | null> {
	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("data_benchmarks")
		.select("id, name")
		.eq("id", slug)
		.single();

	if (error || !data) return null;

	return {
		id: data.id,
		name: data.name ?? data.id,
	};
}

async function loadApiProvider(slug: string): Promise<OgPayload | null> {
	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("data_api_providers")
		.select("api_provider_id, api_provider_name")
		.eq("api_provider_id", slug)
		.single();

	if (error || !data) return null;

	return {
		id: data.api_provider_id,
		name: data.api_provider_name ?? data.api_provider_id,
		logoId: data.api_provider_id,
	};
}

async function loadSubscriptionPlan(slug: string): Promise<OgPayload | null> {
	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("data_subscription_plans")
		.select("plan_id, name, organisation_id")
		.eq("plan_id", slug)
		.limit(1)
		.single();

	if (error || !data) return null;

	return {
		id: data.plan_id,
		name: data.name ?? data.plan_id,
		logoId: data.organisation_id ?? undefined,
	};
}

async function loadCountry(slug: string): Promise<OgPayload | null> {
	const iso = slug.toUpperCase();
	if (!/^[A-Z]{2,3}$/.test(iso)) return null;
	const name = formatCountryName(iso);
	const flagEmoji = isoToFlagEmoji(iso);

	return {
		id: iso,
		name,
		flagEmoji,
	};
}

export async function getFrontendOgPayload(
	kind: OgEntity,
	segments: string[],
): Promise<OgPayload | null> {
	"use cache";

	cacheLife("hours");
	cacheTag("og:payload");
	cacheTag("frontend:og-payload");

	switch (kind) {
		case "organisations": {
			const [slug] = segments;
			if (!slug) return null;
			cacheTag("data:organisations");
			cacheEntityTag("data:organisations", slug);
			return loadOrganisation(slug);
		}
		case "models": {
			const modelId = segments.join("/");
			if (!modelId) return null;
			cacheTag("data:models");
			cacheEntityTag("data:models", modelId);
			return loadModel(modelId);
		}
		case "benchmarks": {
			const [slug] = segments;
			if (!slug) return null;
			cacheTag("data:benchmarks");
			cacheEntityTag("data:benchmarks", slug);
			return loadBenchmark(slug);
		}
		case "api-providers": {
			const [slug] = segments;
			if (!slug) return null;
			cacheTag("data:api_providers");
			cacheEntityTag("data:api_providers", slug);
			return loadApiProvider(slug);
		}
		case "countries": {
			const [slug] = segments;
			return slug ? loadCountry(slug) : null;
		}
		case "subscription-plans": {
			const [slug] = segments;
			if (!slug) return null;
			cacheTag("data:subscription_plans");
			cacheEntityTag("data:subscription_plans", slug);
			return loadSubscriptionPlan(slug);
		}
		default:
			return null;
	}
}
