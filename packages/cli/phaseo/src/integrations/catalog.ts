import { apiFetch, getSessionAccessToken } from "../api.js";
import type { IntegrationId, IntegrationModel } from "./types.js";

const PAGE_SIZE = 250;
const MAX_CATALOG_MODELS = 5000;
const CATALOG_INTEGRATIONS = new Set<IntegrationId>(["opencode", "deepseek-harness", "pi", "prime-agent", "openclaw"]);

type GatewayModel = {
	id?: unknown;
	name?: unknown;
	lifecycle?: { status?: unknown };
	modalities?: { input?: unknown; output?: unknown };
	limits?: { input_tokens?: unknown; output_tokens?: unknown };
	capabilities?: { endpoints?: unknown; parameters?: unknown };
	availability?: { status?: unknown; active_provider_count?: unknown };
};

function positiveNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function includesString(value: unknown, expected: string): boolean {
	return Array.isArray(value) && value.includes(expected);
}

export function toIntegrationModel(value: GatewayModel): IntegrationModel | null {
	if (typeof value.id !== "string" || !value.id) return null;
	if (value.lifecycle?.status === "retired") return null;
	if (value.availability?.status !== "active" || positiveNumber(value.availability.active_provider_count) === undefined) return null;
	if (!includesString(value.modalities?.input, "text") || !includesString(value.modalities?.output, "text")) return null;
	if (!includesString(value.capabilities?.endpoints, "chat.completions")) return null;
	return {
		id: value.id,
		name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : value.id,
		contextWindow: positiveNumber(value.limits?.input_tokens),
		maxOutputTokens: positiveNumber(value.limits?.output_tokens),
		reasoning: includesString(value.capabilities?.parameters, "reasoning") || includesString(value.capabilities?.parameters, "reasoning_effort"),
		input: includesString(value.modalities?.input, "image") ? ["text", "image"] : ["text"],
	};
}

export function supportsModelCatalog(integration: IntegrationId): boolean {
	return CATALOG_INTEGRATIONS.has(integration);
}

export async function fetchIntegrationModels(integration: IntegrationId): Promise<IntegrationModel[]> {
	if (!supportsModelCatalog(integration)) return [];
	return fetchCompatibleModels();
}

export async function fetchCompatibleModels(): Promise<IntegrationModel[]> {
	const session = await getSessionAccessToken();
	const models: IntegrationModel[] = [];
	let offset = 0;
	let total = Number.POSITIVE_INFINITY;

	while (offset < total) {
		const params = new URLSearchParams({
			limit: String(PAGE_SIZE),
			offset: String(offset),
			availability: "active",
			endpoints: "chat.completions",
			input_types: "text",
			output_types: "text",
		});
		const body = await apiFetch(session.apiUrl, `/models?${params}`, { accessToken: session.accessToken });
		if (body?.ok === false) {
			throw new Error(typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : "Phaseo model catalog request failed");
		}
		const page = Array.isArray(body?.models) ? body.models as GatewayModel[] : [];
		total = typeof body?.total === "number" && Number.isFinite(body.total) ? body.total : offset + page.length;
		if (total > MAX_CATALOG_MODELS) throw new Error("The Phaseo model catalog is too large to sync in one setup operation");
		for (const value of page) {
			const model = toIntegrationModel(value);
			if (model) models.push(model);
		}
		if (page.length < PAGE_SIZE) break;
		offset += page.length;
		if (offset < total && offset >= MAX_CATALOG_MODELS) throw new Error("The Phaseo model catalog is too large to sync in one setup operation");
	}

	return [...new Map(models.map((model) => [model.id, model])).values()]
		.sort((left, right) => left.id.localeCompare(right.id));
}
