import type { Account, ModelOption } from "../shared/workspace";

const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export async function apiModels(account: Account, key: string, fetcher: typeof fetch = fetch): Promise<ModelOption[]> {
	if (!account.endpoint || account.kind !== "api") throw new Error("Choose an API account.");
	const url = new URL(`${account.endpoint.replace(/\/$/, "")}/models`);
	const phaseo = url.protocol === "https:" && url.hostname === "api.phaseo.app";
	// Phaseo advertises canonical capabilities, not wire protocol route names.
	if (phaseo) { url.searchParams.set("limit", "250"); url.searchParams.set("gateway_available_only", "true"); url.searchParams.set("endpoints", "text.generate"); }
	const models = new Map<string, ModelOption>();
	const seenIds = new Set<string>();
	let offset = 0;
	const signal = AbortSignal.timeout(30_000);
	for (let page = 0; page < 40; page++) {
		const response = await fetcher(url.href, { headers: { Authorization: `Bearer ${key}` }, signal, redirect: "error" });
		if (!response.ok) throw new Error(`Model discovery returned HTTP ${response.status}.`);
		const result = record(await response.json());
		if (!result) throw new Error("The endpoint returned an invalid model catalog.");
		const native = Array.isArray(result.models);
		const entries = native ? result.models as unknown[] : result.data;
		if (!Array.isArray(entries) || entries.length > 10_000) throw new Error("The endpoint returned an invalid model catalog.");
		if (native && (result.ok !== true || !Number.isSafeInteger(result.offset) || result.offset !== offset || !Number.isSafeInteger(result.total) || (result.total as number) < 0)) throw new Error("The endpoint returned invalid model pagination.");
		let added = 0;
		for (const entry of entries) {
			const model = record(entry);
			if (!model || typeof model.id !== "string" || !model.id.trim()) continue;
			if (!seenIds.has(model.id)) added++;
			seenIds.add(model.id);
			if (native) {
				const endpoints = record(model.capabilities)?.endpoints;
				const offers = model.offers;
				if (!Array.isArray(endpoints) || !endpoints.some(endpoint => endpoint === "text.generate" || endpoint === "responses") || !Array.isArray(offers) || !offers.some(offer => record(offer)?.routable === true)) continue;
				if (record(model.lifecycle)?.status === "retired") continue;
			}
			const organisationId = record(model.organization)?.id;
			const organisationName = record(model.organization)?.name;
			const releaseDate = record(model.lifecycle)?.released_at;
			models.set(model.id, { id: model.id, name: typeof model.name === "string" && model.name.trim() ? model.name : model.id, ...(typeof model.description === "string" ? { description: model.description } : {}), ...(typeof organisationId === "string" && organisationId.trim() ? { organisationId } : {}), ...(typeof organisationName === "string" ? { organisationName } : {}), ...(typeof releaseDate === "string" ? { releaseDate } : {}) });
		}
		if (seenIds.size > 10_000) throw new Error("Model catalog exceeded the limit.");
		if (native && ((!entries.length && offset < (result.total as number)) || (page > 0 && entries.length > 0 && !added))) throw new Error("Model catalog repeated or omitted a page.");
		if (!native || offset + entries.length >= (result.total as number)) return [...models.values()];
		offset += entries.length;
		if (offset > 5000) throw new Error("Model catalog exceeded the pagination limit.");
		url.searchParams.set("offset", String(offset));
	}
	throw new Error("Model catalog exceeded the pagination limit.");
}
