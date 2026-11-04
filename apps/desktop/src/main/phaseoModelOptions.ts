import type { ModelOptionDescriptor, ModelOptionValues } from "../shared/workspace";

// Mirrors the web chat's reasoningEffortSupport.ts and serviceTierSupport.ts for /v1/models parameter_details.
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const efforts = { none: "None", instant: "Instant", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra High", max: "Max" } as const;
const tiers = { standard: "Standard", priority: "Fast", ultrafast: "Ultrafast", flex: "Flex" } as const;
const regionNames: Record<string, string> = { us: "United States", eu: "European Union", uk: "United Kingdom", ca: "Canada", apac: "Asia Pacific", ap: "Asia Pacific", jp: "Japan", kr: "South Korea", au: "Australia", sg: "Singapore", in: "India", my: "Malaysia", id: "Indonesia", cn: "China", br: "Brazil", ch: "Switzerland", de: "Germany", fr: "France" };
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
	// Offers list their priced tiers in service_tiers; older gateways only hint at them in parameter details.
	const routable = (Array.isArray(model.offers) ? model.offers : []).flatMap(offer => record(offer)?.routable === true ? [record(offer)!] : []);
	const listed = routable.filter(offer => Array.isArray(offer.service_tiers));
	const speeds = new Set(listed.length ? listed.flatMap(offer => parseList(offer.service_tiers, parseTier, Object.keys(tiers))) : routes.flatMap(tierValues));
	// Slowest to fastest, each saying what it is and, when not every provider has it, which ones serve it:
	// asking for a tier routes only to providers that offer it.
	const extra = (["priority", "ultrafast", "flex"] as const).filter(tier => speeds.has(tier));
	const servedBy = (tier: string) => {
		if (!listed.length) return "";
		const names = [...new Set(listed.filter(offer => parseList(offer.service_tiers, parseTier, Object.keys(tiers)).includes(tier)).map(offer => text(record(offer.provider)?.name) ?? text(record(offer.provider)?.id) ?? ""))].filter(Boolean);
		return names.length && names.length < routable.length ? ` Only through ${names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(names.length === 2 ? " and " : ", ")}.` : "";
	};
	const about = { flex: "Slower and cheaper, when providers have spare capacity.", standard: "The provider's usual speed and price.", priority: "Served ahead of standard traffic, at the provider's Fast price.", ultrafast: "The provider's quickest processing, at its Ultrafast price." } as const;
	// Region keeps a request's data where chosen: the gateway routes only to providers that keep data there (an exact match).
	const regions = new Map<string, string[]>();
	for (const offer of routable) for (const region of Array.isArray(record(offer.residency)?.data_regions) ? record(offer.residency)!.data_regions as unknown[] : []) {
		if (typeof region !== "string" || !/^[a-z]{2,4}$/.test(region) || region === "global") continue;
		const name = text(record(offer.provider)?.name) ?? text(record(offer.provider)?.id) ?? "";
		regions.set(region, [...new Set([...regions.get(region) ?? [], ...name ? [name] : []])]);
	}
	if (regions.size) options.push({ id: "region", label: "Region", type: "select", options: [{ id: "any", label: "Any region", description: "Any provider, wherever it keeps data.", isDefault: true },
		...[...regions].sort(([a], [b]) => (regionNames[a] ?? a).localeCompare(regionNames[b] ?? b)).map(([id, providers]) => ({ id, label: regionNames[id] ?? id.toUpperCase(), description: `Keeps the request's data in ${regionNames[id] ?? id.toUpperCase()}. Only through ${providers.length > 3 ? `${providers.slice(0, 3).join(", ")} and ${providers.length - 3} more` : providers.join(providers.length === 2 ? " and " : ", ")}.` }))] });
	if (extra.length) options.push({ id: "speed", label: "Speed", type: "select", options: (["flex", "standard", "priority", "ultrafast"] as const).filter(id => id === "standard" || speeds.has(id)).map(id => ({ id, label: tiers[id], description: `${about[id]}${id === "standard" ? "" : servedBy(id)}`, ...(id === "standard" ? { isDefault: true } : {}) })) });
	return options;
}

/** Gateway request fields for a Phaseo task's explicit effort, speed and region choices. */
export function phaseoRequestSettings(options: ModelOptionValues | undefined): { reasoning?: { effort: string }; service_tier?: string; provider?: { required_data_region: string } } {
	const effort = options?.effort, speed = options?.speed, region = options?.region;
	return { ...(typeof effort === "string" && effort ? { reasoning: { effort } } : {}), ...(typeof speed === "string" && speed && speed !== "standard" ? { service_tier: speed } : {}),
		...(typeof region === "string" && /^[a-z]{2,4}$/.test(region) && region !== "any" ? { provider: { required_data_region: region } } : {}) };
}
