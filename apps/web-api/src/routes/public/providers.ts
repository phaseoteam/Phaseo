import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache, type PublicCachePolicy } from "@/http/cache";

const TELEMETRY_CACHE: PublicCachePolicy = {
	edgeTtlSeconds: 15 * 60,
	staleWhileRevalidateSeconds: 15 * 60,
	cacheTags: ["web-api-providers", "web-api-provider-telemetry"],
};
const UPDATES_CACHE: PublicCachePolicy = {
	edgeTtlSeconds: 60 * 60,
	staleWhileRevalidateSeconds: 24 * 60 * 60,
	cacheTags: ["web-api-providers", "web-api-provider-updates"],
};
const IDENTITY_CACHE: PublicCachePolicy = { edgeTtlSeconds: 24 * 60 * 60, staleWhileRevalidateSeconds: 7 * 24 * 60 * 60, cacheTags: ["web-api-providers"] };
const MODALITIES = ["text", "image", "video", "audio", "moderation", "embedding"] as const;
type Modality = typeof MODALITIES[number];
type Variant = { id: string; name: string; colour: string | null; country: string; family: string | null; offerLabel: string | null; offerScope: string | null; totalIds: string[]; activeIds: string[]; freeIds: string[]; dailyRequests: number; dailyTokens: number; monthlyTokens: number; updatedAt: string | null; modalities: Record<Modality, { input: string[]; output: string[] }> };

function providerPolicy(base: PublicCachePolicy, providerId: string): PublicCachePolicy {
	return { ...base, cacheTags: [...(base.cacheTags ?? []), `web-api-provider-${providerId}`.slice(0, 128)] };
}

function boundedInt(value: string | undefined, fallback: number, max: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.trunc(parsed))) : fallback;
}

function missingRelation(error: unknown): boolean {
	const message = String((error as { message?: unknown })?.message ?? "").toLowerCase();
	return message.includes("does not exist") || message.includes("could not find") || message.includes("relation") || message.includes("schema cache");
}

type PricingRule = { model_key: string; pricing_plan: string | null; meter: string | null; unit: string | null; unit_size: number | null; price_per_unit: number | null; effective_from: string | null; effective_to: string | null; priority: number | null };
function stringList(value: unknown): string[] { return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : []; }
function unique(left: string[], right: string[]): string[] { return Array.from(new Set([...left, ...right])); }
function currentRule(rule: PricingRule, now = Date.now()): boolean { return (!rule.effective_from || timeValue(rule.effective_from) <= now) && (!rule.effective_to || timeValue(rule.effective_to) > now); }
function perMillion(rule: PricingRule): number | null { const unit = String(rule.unit ?? "").toLowerCase(); const meter = String(rule.meter ?? "").toLowerCase(); const price = Number(rule.price_per_unit); const size = Number(rule.unit_size ?? 1); return (unit === "token" || unit === "pixel" || meter.includes("pixel")) && Number.isFinite(price) && Number.isFinite(size) && size > 0 ? price / size * 1_000_000 : null; }
function basicUnit(rule: PricingRule): string | null { const unit = String(rule.unit ?? "").toLowerCase(); const meter = String(rule.meter ?? "").toLowerCase(); const size = Number(rule.unit_size ?? 1); if (unit === "token") return "1M tokens"; if (unit === "pixel" || meter.includes("pixel")) return "1M pixels"; if (!unit) return null; return Number.isFinite(size) && size > 1 ? `${size} ${unit}s` : unit; }
function meterLabel(value: string): string { const labels: Record<string, string> = { input_tokens: "Input Tokens", input_text_tokens: "Input Text Tokens", output_tokens: "Output Tokens", output_text_tokens: "Output Text Tokens", output_reasoning_tokens: "Output Reasoning Tokens", cached_read_text_tokens: "Cache Read Tokens", cached_write_text_tokens: "Cache Write Tokens", cached_write_text_tokens_5m: "Cache Write Tokens (5 Min TTL)", cached_write_text_tokens_1h: "Cache Write Tokens (1 Hour TTL)", image_pixels: "Image Pixels", video_pixels: "Video Pixels", output_image: "Output Images", output_video_seconds: "Output Video Seconds", requests: "Requests", total_tokens: "Total Tokens" }; return labels[value] ?? value.split("_").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" "); }
function comparable(rule: PricingRule): number | null { const price = Number(rule.price_per_unit); const size = Number(rule.unit_size ?? 1); return Number.isFinite(price) && Number.isFinite(size) && size > 0 ? price / size : null; }
function pricingMeter(rule: PricingRule) { const meter = String(rule.meter ?? "").trim().toLowerCase(); const unit = String(rule.unit ?? "unit").trim().toLowerCase() || "unit"; const size = Number(rule.unit_size ?? 1); const unitSize = Number.isFinite(size) && size > 0 ? size : 1; const price = Number(rule.price_per_unit); if (!meter || !Number.isFinite(price)) return null; const million = perMillion(rule); return { meter, label: meterLabel(meter), unit, unit_size: unitSize, price_per_unit_usd: price, price_per_1m_usd: million, estimated_price_per_image_usd: meter === "image_pixels" ? price / unitSize * 1024 * 1024 : null, display_unit_label: basicUnit(rule) ?? unit }; }

function unknownApp(appId: string, title: unknown): boolean {
	const id = appId.trim().toLowerCase();
	const name = String(title ?? "").trim().toLowerCase();
	return !id || ["unknown", "unknown-app", "unknown_app"].includes(id) || ["unknown", "unknown app"].includes(name);
}

function modality(value: string): Modality | null { const normalized = value.toLowerCase().replace(/[._/-]+/g, " "); if (normalized.includes("text")) return "text"; if (normalized.includes("image")) return "image"; if (normalized.includes("video")) return "video"; if (normalized.includes("audio") || normalized.includes("music")) return "audio"; if (normalized.includes("moderat")) return "moderation"; if (normalized.includes("embed")) return "embedding"; return null; }
function emptyModalities() { return Object.fromEntries(MODALITIES.map((key) => [key, { input: [] as string[], output: [] as string[] }])) as Variant["modalities"]; }
function latest(values: Array<string | null>): string | null { return values.filter((value): value is string => Boolean(value)).sort((a, b) => timeValue(b) - timeValue(a))[0] ?? null; }

function providerCards(variants: Variant[]) {
	const byId = new Map(variants.map((variant) => [variant.id, variant])); const groups = new Map<string, Variant[]>();
	for (const variant of variants) {
		let key = variant.id;
		if (variant.offerScope === "regional") {
			for (const suffix of ["-eu", "-us"]) { if (variant.id.endsWith(suffix) && byId.has(variant.id.slice(0, -suffix.length))) key = variant.id.slice(0, -suffix.length); }
			if (key === variant.id && variant.family) {
				const siblings = variants.filter((item) => item.id !== variant.id && item.family === variant.family && item.offerScope !== "regional");
				const label = String(variant.offerLabel ?? "").toLowerCase(); const matching = label ? siblings.filter((item) => item.offerLabel && label.startsWith(item.offerLabel.toLowerCase())) : [];
				key = matching.length === 1 ? matching[0].id : siblings.find((item) => item.offerScope === "global")?.id ?? (siblings.length === 1 ? siblings[0].id : key);
			}
		}
		groups.set(key, [...(groups.get(key) ?? []), variant]);
	}
	const totalDailyRequests = variants.reduce((sum, item) => sum + Math.max(0, item.dailyRequests), 0);
	return Array.from(groups.entries()).map(([key, group]) => {
		const representative = group.find((item) => item.id === key) ?? [...group].sort((a, b) => (a.offerScope === "global" ? 0 : 1) - (b.offerScope === "global" ? 0 : 1) || a.id.localeCompare(b.id))[0];
		const modalitySupport = Object.fromEntries(MODALITIES.map((name) => [name, { input: new Set(group.flatMap((item) => item.modalities[name].input)).size, output: new Set(group.flatMap((item) => item.modalities[name].output)).size }]));
		const groupRequests = group.reduce((sum, item) => sum + Math.max(0, item.dailyRequests), 0);
		return { api_provider_id: representative.id, api_provider_name: ["anthropic-aws", "anthropic-aws-us"].includes(representative.id) ? "Anthropic on AWS" : representative.name, colour: representative.colour, country_code: representative.country, last_updated_at: latest(group.map((item) => item.updatedAt)), total_models: new Set(group.flatMap((item) => item.totalIds)).size, active_models: new Set(group.flatMap((item) => item.activeIds)).size, free_models: new Set(group.flatMap((item) => item.freeIds)).size, total_daily_tokens: group.reduce((sum, item) => sum + Math.max(0, item.dailyTokens), 0), total_monthly_tokens: group.reduce((sum, item) => sum + Math.max(0, item.monthlyTokens), 0), daily_share_pct: totalDailyRequests ? groupRequests / totalDailyRequests * 100 : 0, modality_support: modalitySupport };
	});
}

async function providerIndex(env: Env) {
	const client = getDataClient(env); const now = new Date(); const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
	const [providersResult, mappingsResult, freeRulesResult] = await Promise.all([
		client.from("data_api_providers").select("api_provider_id,api_provider_name,colour,country_code,provider_family_id,offer_label,offer_scope").order("api_provider_name", { ascending: true }),
		client.from("data_api_provider_models").select("provider_id,model_id,api_model_id,provider_api_model_id,provider_model_slug,is_active_gateway,effective_from,effective_to,input_modalities,output_modalities"),
		client.from("data_api_pricing_rules").select("model_key,effective_from,effective_to").ilike("model_key", "%:free:%"),
	]);
	if (providersResult.error || mappingsResult.error) throw providersResult.error ?? mappingsResult.error;
	const mappings = mappingsResult.data ?? []; const modelIds = Array.from(new Set(mappings.map((row) => row.model_id).filter((id): id is string => Boolean(id)))); const canonical = new Map<string, Record<string, unknown>>();
	for (let offset = 0; offset < modelIds.length; offset += 100) { const result = await client.from("data_models").select("model_id,input_types,output_types").in("model_id", modelIds.slice(offset, offset + 100)); if (result.error) throw result.error; for (const row of result.data ?? []) canonical.set(row.model_id, row); }
	const rollups: Array<Record<string, unknown>> = [];
	for (let offset = 0, page = 0; page < 8; page += 1, offset += 5000) { const result = await client.from("gateway_usage_rollup_15m_model_provider").select("bucket_15m,provider,requests,total_tokens").gte("bucket_15m", since).lte("bucket_15m", now.toISOString()).range(offset, offset + 4999); if (result.error) { if (!missingRelation(result.error)) throw result.error; break; } const rows = result.data ?? []; rollups.push(...rows); if (rows.length < 5000) break; }
	const total = new Map<string, Set<string>>(); const active = new Map<string, Set<string>>(); const free = new Map<string, Set<string>>(); const updated = new Map<string, string | null>(); const input = new Map<string, Record<Modality, Set<string>>>(); const output = new Map<string, Record<Modality, Set<string>>>();
	const modalitySets = () => Object.fromEntries(MODALITIES.map((key) => [key, new Set<string>()])) as Record<Modality, Set<string>>;
	for (const row of mappings) {
		const provider = String(row.provider_id ?? "").trim(); const modelKey = String(row.api_model_id ?? row.provider_api_model_id ?? "").trim(); if (!provider || !modelKey) continue;
		total.set(provider, new Set([...(total.get(provider) ?? []), modelKey])); updated.set(provider, latest([updated.get(provider) ?? null, row.effective_from ?? row.effective_to ?? null]));
		const canonicalModel = canonical.get(String(row.model_id ?? "")); const inputs = stringList(row.input_modalities).length ? stringList(row.input_modalities) : stringList(canonicalModel?.input_types); const outputs = stringList(row.output_modalities).length ? stringList(row.output_modalities) : stringList(canonicalModel?.output_types);
		const inputSets = input.get(provider) ?? modalitySets(); const outputSets = output.get(provider) ?? modalitySets(); for (const value of inputs) { const key = modality(value); if (key) inputSets[key].add(modelKey); } for (const value of outputs) { const key = modality(value); if (key) outputSets[key].add(modelKey); } input.set(provider, inputSets); output.set(provider, outputSets);
		if (modelKey.toLowerCase().includes(":free") || String(row.provider_model_slug ?? "").toLowerCase().includes("free")) free.set(provider, new Set([...(free.get(provider) ?? []), modelKey]));
		if (row.is_active_gateway && (!row.effective_from || timeValue(row.effective_from) <= now.getTime()) && (!row.effective_to || timeValue(row.effective_to) > now.getTime())) active.set(provider, new Set([...(active.get(provider) ?? []), modelKey]));
	}
	for (const rule of freeRulesResult.data ?? []) { if (!currentRule(rule as PricingRule)) continue; const parts = String(rule.model_key ?? "").split(":"); if (parts.length < 3) continue; const provider = parts.shift()!; parts.pop(); const id = parts.join(":"); free.set(provider, new Set([...(free.get(provider) ?? []), id])); }
	const dailyRequests = new Map<string, number>(); const dailyTokens = new Map<string, number>(); const monthlyTokens = new Map<string, number>(); const dayStart = now.getTime() - 86_400_000;
	for (const row of rollups) { const provider = String(row.provider ?? "").trim(); if (!provider) continue; const tokens = numeric(row.total_tokens); monthlyTokens.set(provider, (monthlyTokens.get(provider) ?? 0) + tokens); updated.set(provider, latest([updated.get(provider) ?? null, String(row.bucket_15m ?? "") || null])); if (timeValue(row.bucket_15m) >= dayStart) { dailyRequests.set(provider, (dailyRequests.get(provider) ?? 0) + numeric(row.requests)); dailyTokens.set(provider, (dailyTokens.get(provider) ?? 0) + tokens); } }
	const hidden = new Set(["inception", "inceptron", "nextbit"]);
	const variants: Variant[] = (providersResult.data ?? []).filter((row) => row.api_provider_id && !hidden.has(row.api_provider_id.toLowerCase())).map((row) => { const id = row.api_provider_id; const inputSets = input.get(id) ?? modalitySets(); const outputSets = output.get(id) ?? modalitySets(); return { id, name: row.api_provider_name ?? "", colour: row.colour ?? null, country: row.country_code ?? "", family: row.provider_family_id ?? null, offerLabel: row.offer_label ?? null, offerScope: row.offer_scope ?? null, totalIds: Array.from(total.get(id) ?? []), activeIds: Array.from(active.get(id) ?? []), freeIds: Array.from(free.get(id) ?? []), dailyRequests: dailyRequests.get(id) ?? 0, dailyTokens: dailyTokens.get(id) ?? 0, monthlyTokens: monthlyTokens.get(id) ?? 0, updatedAt: updated.get(id) ?? null, modalities: Object.fromEntries(MODALITIES.map((key) => [key, { input: Array.from(inputSets[key]), output: Array.from(outputSets[key]) }])) as Variant["modalities"] }; });
	return providerCards(variants);
}

type RecentModel = {
	model_id: string;
	api_model_id: string;
	created_at: string;
	is_active_gateway: boolean;
	data_models?: Record<string, unknown> | null;
};

type RollupRow = { bucket_15m: string; canonical_model_id: string | null; requests: number | null; success_requests: number | null; total_tokens: number | null; latency_sum_ms: number | null; latency_samples: number | null; throughput_sum: number | null; throughput_samples: number | null };
type Aggregate = { requests: number; successRequests: number; totalTokens: number; latencySum: number; latencySamples: number; throughputSum: number; throughputSamples: number };

function emptyAggregate(): Aggregate { return { requests: 0, successRequests: 0, totalTokens: 0, latencySum: 0, latencySamples: 0, throughputSum: 0, throughputSamples: 0 }; }
function numeric(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function average(sum: number, samples: number): number | null { return Number.isFinite(sum) && Number.isFinite(samples) && samples > 0 ? sum / samples : null; }
function dayBucket(value: Date): string { const date = new Date(value); date.setUTCHours(0, 0, 0, 0); return date.toISOString(); }
function mergeAggregate(target: Aggregate, row: RollupRow) {
	target.requests += numeric(row.requests); target.successRequests += numeric(row.success_requests); target.totalTokens += numeric(row.total_tokens);
	target.latencySum += numeric(row.latency_sum_ms); target.latencySamples += numeric(row.latency_samples);
	target.throughputSum += numeric(row.throughput_sum); target.throughputSamples += numeric(row.throughput_samples);
}

async function providerRollups(env: Env, providerId: string, hours: number, now: Date): Promise<RollupRow[]> {
	const rows: RollupRow[] = [];
	const client = getDataClient(env);
	const fromIso = new Date(now.getTime() - hours * 3_600_000).toISOString();
	for (let offset = 0, page = 0; page < 8; page += 1, offset += 5000) {
		const result = await client.from("gateway_usage_rollup_15m_model_provider")
			.select("bucket_15m,canonical_model_id,requests,success_requests,total_tokens,latency_sum_ms,latency_samples,throughput_sum,throughput_samples")
			.eq("provider", providerId).gte("bucket_15m", fromIso).lte("bucket_15m", now.toISOString())
			.order("bucket_15m", { ascending: true }).range(offset, offset + 4999);
		if (result.error) {
			if (missingRelation(result.error)) return [];
			throw result.error;
		}
		const batch = (result.data ?? []) as RollupRow[];
		rows.push(...batch);
		if (batch.length < 5000) break;
	}
	return rows;
}

function metricLeaders(stats: Map<string, Aggregate> | undefined, labels: Map<string, string>, metric: "throughput" | "latency", limit = 5) {
	if (!stats) return [];
	return Array.from(stats.entries()).map(([id, values]) => ({
		id, label: labels.get(id) ?? id, requests: values.requests,
		value: metric === "throughput" ? average(values.throughputSum, values.throughputSamples) : average(values.latencySum, values.latencySamples),
	})).filter((row) => row.value != null).sort((left, right) => metric === "throughput"
		? Number(right.value) - Number(left.value) || right.requests - left.requests || left.label.localeCompare(right.label)
		: Number(left.value) - Number(right.value) || right.requests - left.requests || left.label.localeCompare(right.label)).slice(0, limit);
}

async function buildProviderMetrics(env: Env, providerId: string, hours: number) {
	const now = new Date();
	const rows = await providerRollups(env, providerId, hours, now);
	const empty = { summary: { uptimePct: null, avgLatencyMs: null, avgThroughput: null, avgGenerationMs: null, requests24h: 0, successful24h: 0 }, timeseries: { latency: [], throughput: [] }, dailyModelLeaderboards: {} };
	if (!rows.length) return empty;
	const modelIds = Array.from(new Set(rows.map((row) => String(row.canonical_model_id ?? "").trim()).filter(Boolean)));
	const labelResult = modelIds.length ? await getDataClient(env).from("data_models").select("model_id,name").in("model_id", modelIds) : { data: [], error: null };
	if (labelResult.error) throw labelResult.error;
	const labels = new Map((labelResult.data ?? []).map((row) => [String(row.model_id), String(row.name ?? row.model_id)]));
	const totals = emptyAggregate();
	const days = new Map<string, Aggregate>();
	const dayModels = new Map<string, Map<string, Aggregate>>();
	for (const row of rows) {
		const date = new Date(row.bucket_15m); if (!Number.isFinite(date.getTime())) continue;
		const key = dayBucket(date); const day = days.get(key) ?? emptyAggregate(); mergeAggregate(day, row); days.set(key, day); mergeAggregate(totals, row);
		const modelId = String(row.canonical_model_id ?? "").trim(); if (!modelId) continue;
		const models = dayModels.get(key) ?? new Map<string, Aggregate>(); const model = models.get(modelId) ?? emptyAggregate(); mergeAggregate(model, row); models.set(modelId, model); dayModels.set(key, models);
	}
	const points: Array<Record<string, unknown>> = [];
	const dailyModelLeaderboards: Record<string, unknown> = {};
	for (let cursor = new Date(now.getTime() - hours * 3_600_000); cursor <= now; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
		const key = dayBucket(cursor); const values = days.get(key) ?? emptyAggregate();
		points.push({ timestamp: key, requests: values.requests, uptimePct: values.requests ? values.successRequests / values.requests * 100 : null, avgLatencyMs: average(values.latencySum, values.latencySamples), avgThroughput: average(values.throughputSum, values.throughputSamples), avgGenerationMs: null });
		const modelStats = dayModels.get(key); const latency = metricLeaders(modelStats, labels, "latency");
		dailyModelLeaderboards[key] = { throughput: metricLeaders(modelStats, labels, "throughput"), latency, e2e: latency };
	}
	return {
		summary: { uptimePct: totals.requests ? totals.successRequests / totals.requests * 100 : null, avgLatencyMs: average(totals.latencySum, totals.latencySamples), avgThroughput: average(totals.throughputSum, totals.throughputSamples), avgGenerationMs: null, requests24h: totals.requests, successful24h: totals.successRequests },
		timeseries: { latency: points, throughput: points }, dailyModelLeaderboards,
	};
}

function calendarDays(days: number) {
	const now = new Date();
	const since = new Date(now); since.setUTCDate(since.getUTCDate() - (days - 1)); since.setUTCHours(0, 0, 0, 0);
	const buckets = Array.from({ length: days }, (_, index) => { const date = new Date(since); date.setUTCDate(date.getUTCDate() + index); return date.toISOString().slice(0, 10); });
	return { now, since, buckets, bucketSet: new Set(buckets) };
}

async function tokenRollups(args: { env: Env; providerId: string; table: "gateway_usage_rollup_15m_model_provider" | "gateway_usage_rollup_15m_provider_app"; idColumn: "canonical_model_id" | "app_id"; ids?: string[]; since: string; to: string; maxPages: number }) {
	if (args.ids && !args.ids.length) return [];
	const rows: Array<Record<string, unknown>> = [];
	for (let offset = 0, page = 0; page < args.maxPages; page += 1, offset += 5000) {
		let query = getDataClient(args.env).from(args.table).select(`bucket_15m,${args.idColumn},total_tokens`).eq("provider", args.providerId)
			.gte("bucket_15m", args.since).lte("bucket_15m", args.to).order("bucket_15m", { ascending: true }).range(offset, offset + 4999);
		if (args.ids?.length) query = query.in(args.idColumn, args.ids);
		const result = await query;
		if (result.error) {
			if (missingRelation(result.error)) return [];
			throw result.error;
		}
		const pageRows = (result.data ?? []) as Array<Record<string, unknown>>; rows.push(...pageRows);
		if (pageRows.length < 5000) break;
	}
	return rows;
}

async function modelTokenSeries(env: Env, providerId: string, days: number, topLimit: number) {
	const window = calendarDays(days);
	const topResult = await getDataClient(env).rpc("get_top_models_stats_tokens", { p_provider: providerId, p_since: window.since.toISOString(), p_limit: Math.min(100, Math.max(topLimit * 5, topLimit)) });
	const preferred = topResult.error ? [] : (topResult.data ?? []).map((row) => String(row.model_id ?? "").trim()).filter(Boolean);
	let rows = await tokenRollups({ env, providerId, table: "gateway_usage_rollup_15m_model_provider", idColumn: "canonical_model_id", ids: preferred, since: window.since.toISOString(), to: window.now.toISOString(), maxPages: 8 });
	if (!rows.length) rows = await tokenRollups({ env, providerId, table: "gateway_usage_rollup_15m_model_provider", idColumn: "canonical_model_id", since: window.since.toISOString(), to: window.now.toISOString(), maxPages: 4 });
	const totals = new Map<string, number>(); const daily = new Map<string, Map<string, number>>();
	for (const row of rows) {
		const id = String(row.canonical_model_id ?? "").trim(); const tokens = Number(row.total_tokens ?? 0); const day = new Date(String(row.bucket_15m)).toISOString().slice(0, 10);
		if (!id || !Number.isFinite(tokens) || tokens <= 0 || !window.bucketSet.has(day)) continue;
		totals.set(id, (totals.get(id) ?? 0) + tokens); const values = daily.get(day) ?? new Map<string, number>(); values.set(id, (values.get(id) ?? 0) + tokens); daily.set(day, values);
	}
	const ids = Array.from(totals.entries()).sort((left, right) => right[1] - left[1]).slice(0, topLimit).map(([id]) => id);
	const namesResult = ids.length ? await getDataClient(env).from("data_models").select("model_id,name").in("model_id", ids) : { data: [], error: null };
	if (namesResult.error) throw namesResult.error;
	const names = new Map((namesResult.data ?? []).map((row) => [String(row.model_id), String(row.name ?? row.model_id)]));
	const models = ids.map((modelId) => ({ modelId, modelName: names.get(modelId) ?? modelId, totalTokens: Math.round(totals.get(modelId) ?? 0) }));
	return { models, points: window.buckets.flatMap((bucket) => models.map((model) => ({ bucket, modelId: model.modelId, tokens: Math.round(daily.get(bucket)?.get(model.modelId) ?? 0) }))) };
}

async function appTokenSeries(env: Env, providerId: string, days: number, topLimit: number) {
	const window = calendarDays(days); const period = days <= 1 ? "day" : days <= 7 ? "week" : "month"; const periodDays = period === "month" ? 30 : period === "week" ? 7 : 1;
	const topResult = await getDataClient(env).rpc("get_top_apps_stats", { p_provider: providerId, p_since: new Date(Date.now() - periodDays * 86_400_000).toISOString(), p_limit: Math.max(topLimit * 5, topLimit) });
	const topRows = topResult.error ? [] : (topResult.data ?? []).filter((row) => !unknownApp(String(row.app_id ?? ""), row.title));
	const preferred = topRows.map((row) => String(row.app_id ?? "").trim()).filter(Boolean);
	let rows = await tokenRollups({ env, providerId, table: "gateway_usage_rollup_15m_provider_app", idColumn: "app_id", ids: preferred, since: window.since.toISOString(), to: window.now.toISOString(), maxPages: 8 });
	if (!rows.length) rows = await tokenRollups({ env, providerId, table: "gateway_usage_rollup_15m_provider_app", idColumn: "app_id", since: window.since.toISOString(), to: window.now.toISOString(), maxPages: 4 });
	const totals = new Map<string, number>(); const daily = new Map<string, Map<string, number>>();
	for (const row of rows) {
		const id = String(row.app_id ?? "").trim(); const tokens = Number(row.total_tokens ?? 0); const day = new Date(String(row.bucket_15m)).toISOString().slice(0, 10);
		if (!id || !Number.isFinite(tokens) || tokens <= 0 || !window.bucketSet.has(day)) continue;
		totals.set(id, (totals.get(id) ?? 0) + tokens); const values = daily.get(day) ?? new Map<string, number>(); values.set(id, (values.get(id) ?? 0) + tokens); daily.set(day, values);
	}
	const ids = Array.from(totals.entries()).sort((left, right) => right[1] - left[1]).slice(0, topLimit).map(([id]) => id);
	const metaResult = ids.length ? await getDataClient(env).from("api_apps").select("id,title,url,image_url").in("id", ids) : { data: [], error: null };
	if (metaResult.error) throw metaResult.error;
	const meta = new Map((metaResult.data ?? []).map((row) => [String(row.id), row])); const topMeta = new Map(topRows.map((row) => [String(row.app_id), row]));
	const apps = ids.map((appId) => {
		const primary = topMeta.get(appId) as Record<string, unknown> | undefined; const fallback = meta.get(appId); const title = String(primary?.title ?? fallback?.title ?? appId).trim() || appId;
		const primaryUrl = typeof primary?.url === "string" ? primary.url : null;
		return unknownApp(appId, title) ? null : { appId, title, url: primaryUrl ?? fallback?.url ?? null, imageUrl: fallback?.image_url ?? null, totalTokens: Math.round(totals.get(appId) ?? 0) };
	}).filter((app): app is NonNullable<typeof app> => Boolean(app));
	return { apps, points: window.buckets.flatMap((bucket) => apps.map((app) => ({ bucket, appId: app.appId, tokens: Math.round(daily.get(bucket)?.get(app.appId) ?? 0) }))) };
}

function timeValue(value: unknown): number {
	const parsed = Date.parse(String(value ?? ""));
	return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function lifecycleDate(model: RecentModel): string | null {
	return typeof model.data_models?.release_date === "string"
		? model.data_models.release_date
		: typeof model.data_models?.announcement_date === "string"
			? model.data_models.announcement_date
			: null;
}

async function recentModels(env: Env, providerId: string, since: string | null, limit: number): Promise<RecentModel[]> {
	const client = getDataClient(env);
	const providerResult = await client.from("data_api_provider_models")
		.select("model_id,api_model_id,created_at,is_active_gateway").eq("provider_id", providerId);
	if (providerResult.error) throw providerResult.error;
	const modelIds = Array.from(new Set((providerResult.data ?? []).map((row) => row.model_id).filter((id): id is string => Boolean(id))));
	const modelResult = modelIds.length
		? await client.from("data_models").select("model_id,name,organisation_id,release_date,announcement_date,organisation:data_organisations!data_models_organisation_id_fkey(organisation_id,name)").in("model_id", modelIds)
		: { data: [], error: null };
	if (modelResult.error) throw modelResult.error;
	const details = new Map((modelResult.data ?? []).map((row) => [row.model_id, {
		name: row.name ?? null,
		organisation_id: row.organisation_id ?? null,
		release_date: row.release_date ?? null,
		announcement_date: row.announcement_date ?? null,
		organisation: row.organisation ?? null,
	}]));
	const merged = new Map<string, RecentModel>();
	for (const row of providerResult.data ?? []) {
		const key = row.model_id ?? row.api_model_id;
		if (!key || !row.api_model_id || !row.created_at) continue;
		const next: RecentModel = {
			model_id: key,
			api_model_id: row.api_model_id,
			created_at: row.created_at,
			is_active_gateway: Boolean(row.is_active_gateway),
			data_models: row.model_id ? details.get(row.model_id) ?? null : null,
		};
		const previous = merged.get(key);
		if (!previous) { merged.set(key, next); continue; }
		if (timeValue(next.created_at) > timeValue(previous.created_at)) {
			previous.created_at = next.created_at;
			previous.api_model_id = next.api_model_id;
		}
		previous.is_active_gateway ||= next.is_active_gateway;
		if (!previous.data_models && next.data_models) previous.data_models = next.data_models;
	}
	return Array.from(merged.values())
		.filter((model) => !since || timeValue(lifecycleDate(model)) >= timeValue(since))
		.sort((left, right) => timeValue(lifecycleDate(right)) - timeValue(lifecycleDate(left)) || timeValue(right.created_at) - timeValue(left.created_at) || left.model_id.localeCompare(right.model_id))
		.slice(0, limit);
}

export const publicProvidersRouter = new Hono<{ Bindings: Env }>();

publicProvidersRouter.get("/", async (c) => {
	try { return withPublicCache(c.json({ providers: await providerIndex(c.env) }), IDENTITY_CACHE); }
	catch (error) { console.error("[web-api/providers] index failed", error); return c.json({ error: "providers_unavailable" }, 503); }
});

publicProvidersRouter.get("/:providerId/top-models", async (c) => {
	const providerId = c.req.param("providerId");
	const count = boundedInt(c.req.query("count"), 6, 50);
	try {
		const client = getDataClient(c.env);
		const result = await client.rpc("get_top_models_stats_tokens", {
			p_provider: providerId,
			p_since: new Date(Date.now() - 86_400_000).toISOString(),
			p_limit: count,
		});
		if (result.error) {
			if (missingRelation(result.error)) return withPublicCache(c.json({ models: [] }), providerPolicy(TELEMETRY_CACHE, providerId));
			throw result.error;
		}
		const ids = (result.data ?? []).map((row) => row.model_id).filter((id): id is string => Boolean(id));
		const visibility = ids.length ? await client.from("data_models").select("model_id,hidden").in("model_id", ids) : { data: [], error: null };
		if (visibility.error) throw visibility.error;
		const hidden = new Set((visibility.data ?? []).filter((row) => row.hidden).map((row) => row.model_id));
		const models = (result.data ?? []).filter((row) => !hidden.has(row.model_id)).map((row) => ({
			model_id: row.model_id,
			model_name: row.model_name,
			request_count: Number(row.request_count),
			total_tokens: row.total_tokens == null ? null : Number(row.total_tokens),
			median_latency_ms: row.median_latency_ms ? Math.round(Number(row.median_latency_ms)) : null,
			median_throughput: row.median_throughput ? Math.round(Number(row.median_throughput) * 100) / 100 : null,
		}));
		return withPublicCache(c.json({ models }), providerPolicy(TELEMETRY_CACHE, providerId));
	} catch (error) {
		console.error("[web-api/providers] top models failed", { providerId, error });
		return c.json({ error: "provider_top_models_unavailable" }, 503);
	}
});

publicProvidersRouter.get("/:providerId/top-apps", async (c) => {
	const providerId = c.req.param("providerId");
	const period = ["day", "week", "month"].includes(c.req.query("period") ?? "") ? c.req.query("period")! : "day";
	const count = boundedInt(c.req.query("count"), 20, 100);
	const days = period === "month" ? 30 : period === "week" ? 7 : 1;
	try {
		const client = getDataClient(c.env);
		const result = await client.rpc("get_top_apps_stats", { p_provider: providerId, p_since: new Date(Date.now() - days * 86_400_000).toISOString(), p_limit: count });
		if (result.error) {
			if (missingRelation(result.error)) return withPublicCache(c.json({ apps: [] }), providerPolicy(TELEMETRY_CACHE, providerId));
			throw result.error;
		}
		const rows = (result.data ?? []).filter((row) => !unknownApp(String(row.app_id ?? ""), row.title));
		const ids = rows.map((row) => String(row.app_id ?? "")).filter(Boolean);
		const appResult = ids.length ? await client.from("api_apps").select("id,image_url").in("id", ids) : { data: [], error: null };
		if (appResult.error) throw appResult.error;
		const images = new Map((appResult.data ?? []).map((row) => [row.id, row.image_url ?? null]));
		const apps = rows.map((row) => ({ app_id: row.app_id, title: row.title || row.app_id, url: row.url || null, image_url: images.get(row.app_id) ?? null, total_tokens: Number(row.total_tokens) }));
		return withPublicCache(c.json({ apps }), providerPolicy(TELEMETRY_CACHE, providerId));
	} catch (error) {
		console.error("[web-api/providers] top apps failed", { providerId, error });
		return c.json({ error: "provider_top_apps_unavailable" }, 503);
	}
});

publicProvidersRouter.get("/:providerId/updates", async (c) => {
	const providerId = c.req.param("providerId");
	const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
	try {
		const [recent, added, tokensResult] = await Promise.all([
			recentModels(c.env, providerId, null, 5),
			recentModels(c.env, providerId, since, 5),
			getDataClient(c.env).rpc("get_provider_token_usage", { provider_id: providerId, since_ts: since }),
		]);
		if (tokensResult.error) throw tokensResult.error;
		return withPublicCache(c.json({ newModels: added, recentModels: recent, recentTokens: Number(tokensResult.data?.[0]?.total_tokens ?? 0) }), providerPolicy(UPDATES_CACHE, providerId));
	} catch (error) {
		console.error("[web-api/providers] updates failed", { providerId, error });
		return c.json({ error: "provider_updates_unavailable" }, 503);
	}
});

publicProvidersRouter.get("/:providerId/metrics", async (c) => {
	const providerId = c.req.param("providerId");
	const hours = boundedInt(c.req.query("hours"), 24 * 7, 24 * 365);
	try {
		return withPublicCache(c.json(await buildProviderMetrics(c.env, providerId, hours)), providerPolicy(TELEMETRY_CACHE, providerId));
	} catch (error) {
		console.error("[web-api/providers] metrics failed", { providerId, hours, error });
		return c.json({ error: "provider_metrics_unavailable" }, 503);
	}
});

publicProvidersRouter.get("/:providerId/model-token-timeseries", async (c) => {
	const providerId = c.req.param("providerId"); const days = boundedInt(c.req.query("days"), 30, 365); const topModels = boundedInt(c.req.query("topModels"), 8, 50);
	try { return withPublicCache(c.json(await modelTokenSeries(c.env, providerId, days, topModels)), providerPolicy(TELEMETRY_CACHE, providerId)); }
	catch (error) { console.error("[web-api/providers] model series failed", { providerId, error }); return c.json({ error: "provider_model_series_unavailable" }, 503); }
});

publicProvidersRouter.get("/:providerId/app-token-timeseries", async (c) => {
	const providerId = c.req.param("providerId"); const days = boundedInt(c.req.query("days"), 30, 365); const topApps = boundedInt(c.req.query("topApps"), 20, 100);
	try { return withPublicCache(c.json(await appTokenSeries(c.env, providerId, days, topApps)), providerPolicy(TELEMETRY_CACHE, providerId)); }
	catch (error) { console.error("[web-api/providers] app series failed", { providerId, error }); return c.json({ error: "provider_app_series_unavailable" }, 503); }
});

publicProvidersRouter.get("/:providerId/models", async (c) => {
	const providerId = c.req.param("providerId");
	if (["inception", "inceptron", "nextbit"].includes(providerId.toLowerCase())) return withPublicCache(c.json({ models: [] }), providerPolicy(UPDATES_CACHE, providerId));
	try {
		const client = getDataClient(c.env);
		const providerResult = await client.from("data_api_provider_models").select("provider_api_model_id,provider_id,api_model_id,provider_model_slug,model_id,is_active_gateway,input_modalities,output_modalities,created_at").eq("provider_id", providerId).order("created_at", { ascending: false });
		if (providerResult.error) throw providerResult.error;
		const providerRows = providerResult.data ?? [];
		const providerModelIds = providerRows.map((row) => row.provider_api_model_id).filter((id): id is string => Boolean(id));
		const modelIds = Array.from(new Set(providerRows.map((row) => row.model_id).filter((id): id is string => Boolean(id))));
		const [capsResult, modelsResult, rulesResult] = await Promise.all([
			providerModelIds.length ? client.from("data_api_provider_model_capabilities").select("provider_api_model_id,capability_id,params,status").in("provider_api_model_id", providerModelIds) : Promise.resolve({ data: [], error: null }),
			modelIds.length ? client.from("data_models").select("model_id,name,release_date,announcement_date,hidden").in("model_id", modelIds).eq("hidden", false) : Promise.resolve({ data: [], error: null }),
			client.from("data_api_pricing_rules").select("model_key,pricing_plan,meter,unit,unit_size,price_per_unit,effective_from,effective_to,priority").like("model_key", `${providerId}:%`),
		]);
		if (capsResult.error || modelsResult.error || rulesResult.error) throw capsResult.error ?? modelsResult.error ?? rulesResult.error;
		const visible = new Set((modelsResult.data ?? []).map((row) => row.model_id)); const modelMeta = new Map((modelsResult.data ?? []).map((row) => [row.model_id, row]));
		const capabilities = new Map<string, string[]>(); const params = new Map<string, string[]>();
		for (const cap of capsResult.data ?? []) {
			if (cap.status === "disabled" || !cap.provider_api_model_id || !cap.capability_id) continue;
			capabilities.set(cap.provider_api_model_id, unique(capabilities.get(cap.provider_api_model_id) ?? [], [cap.capability_id]));
			const supported = cap.params && typeof cap.params === "object" && !Array.isArray(cap.params) ? Object.keys(cap.params) : [];
			params.set(cap.provider_api_model_id, unique(params.get(cap.provider_api_model_id) ?? [], supported));
		}
		const merged = new Map<string, Record<string, unknown>>(); const apiIds = new Map<string, Set<string>>();
		for (const row of providerRows) {
			if (row.model_id && !visible.has(row.model_id)) continue;
			const modelId = row.model_id || row.api_model_id; if (!modelId) continue;
			if (row.api_model_id) apiIds.set(modelId, new Set([...(apiIds.get(modelId) ?? []), row.api_model_id]));
			const meta = modelMeta.get(row.model_id ?? ""); const endpoints = capabilities.get(row.provider_api_model_id) ?? []; const supported = params.get(row.provider_api_model_id) ?? [];
			const existing = merged.get(modelId);
			if (!existing) {
				merged.set(modelId, { model_id: modelId, api_model_id: row.api_model_id ?? modelId, model_name: meta?.name ?? row.provider_model_slug ?? row.api_model_id ?? modelId, provider_model_slug: row.provider_model_slug ?? null, endpoints, supported_params: supported, is_active_gateway: Boolean(row.is_active_gateway), input_modalities: stringList(row.input_modalities), output_modalities: stringList(row.output_modalities), release_date: meta?.release_date ?? null, announcement_date: meta?.announcement_date ?? null, created_at: row.created_at ?? null });
				continue;
			}
			if (timeValue(row.created_at) > timeValue(existing.created_at)) existing.created_at = row.created_at ?? null;
			existing.endpoints = unique(stringList(existing.endpoints), endpoints); existing.supported_params = unique(stringList(existing.supported_params), supported);
			existing.input_modalities = unique(stringList(existing.input_modalities), stringList(row.input_modalities)); existing.output_modalities = unique(stringList(existing.output_modalities), stringList(row.output_modalities));
			existing.is_active_gateway = Boolean(existing.is_active_gateway || row.is_active_gateway);
		}
		const rules = ((rulesResult.data ?? []) as PricingRule[]).filter((rule) => currentRule(rule));
		const meterOrder = new Map(["input_text_tokens", "output_text_tokens", "cached_read_text_tokens", "cached_write_text_tokens", "cached_write_text_tokens_5m", "cached_write_text_tokens_1h", "total_tokens", "image_pixels", "video_pixels", "output_image", "input_image", "output_video_seconds", "input_video_seconds", "requests"].map((meter, index) => [meter, index]));
		const results = Array.from(merged.values());
		for (const model of results) {
			const ids = apiIds.get(String(model.model_id)) ?? new Set<string>(); const matches = rules.filter((rule) => Array.from(ids).some((id) => rule.model_key?.startsWith(`${providerId}:${id}:`))); if (!matches.length) continue;
			const standard = matches.filter((rule) => String(rule.pricing_plan ?? "standard").toLowerCase() === "standard"); const effective = standard.length ? standard : matches;
			const sorted = [...effective].sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0) || timeValue(b.effective_from) - timeValue(a.effective_from));
			const input = effective.filter((rule) => String(rule.meter ?? "").toLowerCase().startsWith("input") && String(rule.meter ?? "").toLowerCase().includes("token")).map(perMillion).filter((value): value is number => value != null);
			const output = effective.filter((rule) => String(rule.meter ?? "").toLowerCase().startsWith("output") && String(rule.meter ?? "").toLowerCase().includes("token")).map(perMillion).filter((value): value is number => value != null);
			const byMeter = new Map<string, PricingRule>(); for (const rule of sorted) { const meter = String(rule.meter ?? "").toLowerCase().trim(); if (!meter) continue; const current = byMeter.get(meter); if (!current || (comparable(rule) != null && (comparable(current) == null || comparable(rule)! < comparable(current)!))) byMeter.set(meter, rule); }
			const meters = Array.from(byMeter.values()).map(pricingMeter).filter((meter): meter is NonNullable<typeof meter> => Boolean(meter)).sort((a, b) => (meterOrder.get(a.meter) ?? 999) - (meterOrder.get(b.meter) ?? 999) || a.label.localeCompare(b.label));
			const baseline = sorted[0]; model.input_price_per_1m_usd = input.length ? Math.min(...input) : null; model.output_price_per_1m_usd = output.length ? Math.min(...output) : null; model.starting_price_usd = baseline && Number.isFinite(Number(baseline.price_per_unit)) ? Number(baseline.price_per_unit) : null; model.starting_price_unit = baseline ? basicUnit(baseline) : null; model.pricing_meters = meters.length ? meters : null;
		}
		results.sort((a, b) => timeValue(b.release_date ?? b.announcement_date) - timeValue(a.release_date ?? a.announcement_date) || timeValue(b.created_at) - timeValue(a.created_at) || String(a.model_name ?? a.model_id).localeCompare(String(b.model_name ?? b.model_id)));
		return withPublicCache(c.json({ models: results }), providerPolicy(UPDATES_CACHE, providerId));
	} catch (error) {
		console.error("[web-api/providers] models failed", { providerId, error });
		return c.json({ error: "provider_models_unavailable" }, 503);
	}
});
