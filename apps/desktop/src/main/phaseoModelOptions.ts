import type { ModelOptionDescriptor, ModelOptionValues } from "../shared/workspace";

// Mirrors the web chat's reasoningEffortSupport.ts and serviceTierSupport.ts for /v1/models parameter_details.
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const efforts = { none: "None", instant: "Instant", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra High", max: "Max" } as const;
const tiers = { standard: "Standard", priority: "Fast", ultrafast: "Ultrafast", flex: "Flex" } as const;
type Support = { values: string[]; default?: string };

const parseEffort = (value: unknown) => typeof value === "string" && Object.hasOwn(efforts, value.trim().toLowerCase()) ? value.trim().toLowerCase() : undefined;
function parseTier(value: unknown) {
	if (typeof value !== "string") return;
	const tier = value.trim().toLowerCase();
	return ["standard", "default", "auto"].includes(tier) ? "standard" : tier === "fast" ? "priority" : Object.hasOwn(tiers, tier) ? tier : undefined;
}
function parseList(value: unknown, parse: (value: unknown) => string | undefined, order: string[]) {
	if (!Array.isArray(value)) return [];
	const parsed = new Set(value.map(entry => parse(record(entry) ? record(entry)!.value ?? record(entry)!.id ?? record(entry)!.name ?? record(entry)!.tier : entry)));
	return order.filter(value => parsed.has(value));
}
function support(values: string[], fallback: string | undefined): Support | undefined {
	return values.length ? { values, ...(fallback && values.includes(fallback) ? { default: fallback } : {}) } : undefined;
}
function intersect(supports: Support[]): Support | undefined {
	if (!supports.length) return;
	const values = supports[0].values.filter(value => supports.every(entry => entry.values.includes(value)));
	const fallback = supports.every(entry => entry.default && entry.default === supports[0].default) ? supports[0].default : undefined;
	return { values, ...(fallback && values.includes(fallback) ? { default: fallback } : {}) };
}

function effortSupport(details: Record<string, unknown>) {
	const candidates = [details["reasoning.effort"], details.reasoning_effort, record(details.reasoning)?.effort, details.reasoning].flatMap(value => record(value) ? [record(value)!] : []);
	return intersect(candidates.flatMap(config => support(parseList(config.supported_values ?? config.values ?? config.enum, parseEffort, Object.keys(efforts)), parseEffort(config.default_value ?? config.default ?? config.provider_default)) ?? []));
}

const positiveNote = (notes: string, tier: string) => !new RegExp(`(?:not|no|without|unavailable|unsupported).{0,32}\\b(?:${tier})\\b|\\b(?:${tier})\\b.{0,32}(?:not available|not supported|unavailable|unsupported)`, "i").test(notes) && new RegExp(`(?:available|support(?:ed)?|offer(?:ed)?|processing|tier).{0,48}\\b(?:${tier})\\b|\\b(?:${tier})\\b.{0,48}(?:available|support(?:ed)?|offer(?:ed)?|processing|tier)`, "i").test(notes);
function tierValues(details: Record<string, unknown>): string[] {
	const config = details.service_tier ?? details.serviceTier ?? details["service.tier"];
	if (typeof config === "string") return [parseTier(config) ?? "standard"];
	if (Array.isArray(config)) return parseList(config, parseTier, Object.keys(tiers));
	const detail = record(config);
	if (!detail) return ["standard"];
	const values = parseList(detail.supported_values ?? detail.supportedValues ?? detail.values ?? detail.enum, parseTier, Object.keys(tiers));
	if (values.length) return values;
	const notes = typeof detail.notes === "string" ? detail.notes : "";
	return ["standard", ...positiveNote(notes, "priority|fast") ? ["priority"] : [], ...positiveNote(notes, "flex") ? ["flex"] : []];
}

/** Effort and speed settings for one /v1/models entry, read from its routable offers (or the model when offers carry no details). */
export function phaseoModelOptions(model: Record<string, unknown>): ModelOptionDescriptor[] {
	const offers = (Array.isArray(model.offers) ? model.offers : []).flatMap(offer => record(offer)?.routable === true && record(record(record(offer)!.capabilities)?.parameter_details) ? [record(record(record(offer)!.capabilities)!.parameter_details)!] : []);
	const routes = offers.length ? offers : [record(record(model.capabilities)?.parameter_details) ?? {}];
	const options: ModelOptionDescriptor[] = [];
	// Effort follows the web: providers that advertise values must agree; the gateway clamps the rest.
	const effort = intersect(routes.flatMap(details => effortSupport(details) ?? []));
	if (effort?.values.length) {
		const fallback = effort.default ?? (effort.values.includes("medium") ? "medium" : undefined);
		options.push({ id: "effort", label: "Reasoning", type: "select", options: effort.values.map(id => ({ id, label: efforts[id as keyof typeof efforts], ...(id === fallback ? { isDefault: true } : {}) })) });
	}
	// Any routable provider's tier counts: the gateway drops providers that cannot serve the requested tier.
	const speeds = new Set(routes.flatMap(tierValues));
	const extra = (["priority", "ultrafast", "flex"] as const).filter(tier => speeds.has(tier));
	if (extra.length) options.push({ id: "speed", label: "Speed", type: "select", options: [{ id: "standard", label: tiers.standard, isDefault: true }, ...extra.map(id => ({ id, label: tiers[id] }))] });
	return options;
}

/** Gateway request fields for a Phaseo task's explicit effort and speed choices. */
export function phaseoRequestSettings(options: ModelOptionValues | undefined): { reasoning?: { effort: string }; service_tier?: string } {
	const effort = options?.effort, speed = options?.speed;
	return { ...(typeof effort === "string" && effort ? { reasoning: { effort } } : {}), ...(typeof speed === "string" && speed && speed !== "standard" ? { service_tier: speed } : {}) };
}
