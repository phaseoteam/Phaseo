#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OR_PARAMS_CSV = path.join(ROOT, "internal", "OR_Parameters", "provider_model_params.csv");
const PROVIDERS_DIR = path.join(ROOT, "apps", "web", "src", "data", "api_providers");

function splitCsvLine(line) {
	const out = [];
	let current = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i += 1) {
		const ch = line[i];
		if (ch === "\"") {
			const next = line[i + 1];
			if (inQuotes && next === "\"") {
				current += "\"";
				i += 1;
				continue;
			}
			inQuotes = !inQuotes;
			continue;
		}
		if (ch === "," && !inQuotes) {
			out.push(current);
			current = "";
			continue;
		}
		current += ch;
	}
	out.push(current);
	return out.map((v) => v.trim());
}

function parseCsv(text) {
	const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
	if (lines.length === 0) return [];
	const header = splitCsvLine(lines[0]);
	const rows = [];
	for (let i = 1; i < lines.length; i += 1) {
		const parts = splitCsvLine(lines[i]);
		if (parts.length === 0) continue;
		const row = {};
		for (let c = 0; c < header.length; c += 1) {
			row[header[c]] = parts[c] ?? "";
		}
		rows.push(row);
	}
	return rows;
}

function mapOrProviderToLocal(rawProvider) {
	const base = String(rawProvider || "").toLowerCase().split("/")[0].trim();
	switch (base) {
		case "xai":
			return "x-ai";
		case "moonshotai":
			return "moonshot-ai";
		case "atlas-cloud":
			return "atlascloud";
		case "liquid":
			return "liquid-ai";
		case "wandb":
			return "weights-and-biases";
		case "novita":
			return "novitaai";
		case "nebius":
			return "nebius-token-factory";
		case "seed":
			return "bytedance-seed";
		default:
			return base;
	}
}

function providerCandidates(localProviderId) {
	const out = [localProviderId];
	if (localProviderId === "moonshot-ai-turbo") out.push("moonshot-ai");
	if (localProviderId === "minimax-lightning") out.push("minimax");
	return out;
}

function namespaceAliasesForProvider(localProviderId) {
	switch (localProviderId) {
		case "moonshot-ai":
		case "moonshot-ai-turbo":
			return ["moonshotai"];
		case "mistral":
			return ["mistralai"];
		case "google-ai-studio":
			return ["google"];
		default:
			return [];
	}
}

function normalizeModelId(value) {
	return String(value || "").trim().toLowerCase();
}

function simplifyModelId(value) {
	const variants = new Set();
	const queue = [normalizeModelId(value)];
	while (queue.length > 0) {
		const current = queue.pop();
		if (!current || variants.has(current)) continue;
		variants.add(current);

		const next = [
			current.replace(/:free$/i, ""),
			current.replace(/-preview$/i, ""),
			current.replace(/-latest$/i, ""),
			current.replace(/-non-reasoning$/i, ""),
			current.replace(/-reasoning$/i, ""),
			current.replace(/-thinking$/i, ""),
			current.replace(/-fast$/i, ""),
			current.replace(/-instruct$/i, ""),
			current.replace(/-\d+b$/i, ""),
			current.replace(/(\.\d+)-\d+b$/i, "$1"),
			current.replace(/-\d{4}-\d{2}-\d{2}$/i, ""),
			current.replace(/-\d{8}$/i, ""),
			current.replace(/-\d{2}-\d{4}$/i, ""),
			current.replace(/-\d{4}$/i, ""),
			current.replace(/-\d{3}$/i, ""),
			current.replace(/(\d+)\.0$/i, "$1"),
		];
		for (const candidate of next) {
			if (candidate && candidate !== current && !variants.has(candidate)) {
				queue.push(candidate);
			}
		}
	}
	return Array.from(variants);
}

const EXPLICIT_MODEL_ALIASES = {
	"arcee-ai|arcee-ai/trinity-large": [
		"arcee-ai/trinity-large-preview",
	],
	"deepseek|deepseek/deepseek-v3.2-thinking": [
		"deepseek/deepseek-v3.2",
	],
	"google-ai-studio|google/gemini-2.0-flash": [
		"google/gemini-2.0-flash-001",
	],
	"google-ai-studio|google/gemini-2.0-flash-lite": [
		"google/gemini-2.0-flash-lite-001",
	],
	"minimax|minimax/m2-her": [
		"minimax/minimax-m2-her",
	],
	"mistral|mistral/mistral-medium-3.0": [
		"mistralai/mistral-medium-3",
	],
	"mistral|mistral/mistral-nemo-12b": [
		"mistralai/mistral-nemo",
	],
	"mistral|mistral/mistral-small-3.2": [
		"mistralai/mistral-small-3.2-24b-instruct",
	],
	"mistral|mistral/voxtral-small": [
		"mistralai/voxtral-small-24b-2507",
	],
	"x-ai|x-ai/grok-4-fast-non-reasoning": [
		"x-ai/grok-4-fast",
	],
	"x-ai|x-ai/grok-4.1": [
		"x-ai/grok-4.1-fast",
	],
	"x-ai|x-ai/grok-4.1-thinking": [
		"x-ai/grok-4.1-fast",
	],
};

function explicitAliasesForModel(providerId, apiModelId) {
	const key = `${providerId}|${normalizeModelId(apiModelId)}`;
	return EXPLICIT_MODEL_ALIASES[key] ?? [];
}

function modelCandidates({ providerId, apiModelId, providerModelSlug }) {
	const out = new Set();
	const localNamespace = (() => {
		const raw = normalizeModelId(apiModelId);
		if (!raw.includes("/")) return providerId;
		return raw.split("/", 1)[0];
	})();
	const namespaces = Array.from(
		new Set([localNamespace, ...namespaceAliasesForProvider(providerId)]),
	);

	const addWithNamespaceVariants = (raw) => {
		const normalized = normalizeModelId(raw);
		if (!normalized) return;
		if (normalized.includes("/")) {
			const [, ...restParts] = normalized.split("/");
			const rest = restParts.join("/");
			for (const ns of namespaces) {
				for (const v of simplifyModelId(`${ns}/${rest}`)) out.add(v);
			}
			for (const v of simplifyModelId(normalized)) out.add(v);
			return;
		}
		for (const ns of namespaces) {
			for (const v of simplifyModelId(`${ns}/${normalized}`)) out.add(v);
		}
	};

	addWithNamespaceVariants(apiModelId);
	addWithNamespaceVariants(providerModelSlug);
	for (const alias of explicitAliasesForModel(providerId, apiModelId)) {
		addWithNamespaceVariants(alias);
	}
	return Array.from(out);
}

function toParamObjects(paramIds) {
	return [...paramIds]
		.sort((a, b) => a.localeCompare(b))
		.map((paramId) => ({
			param_id: paramId,
		}));
}

function toParamObjectsWithNote(paramIds, note) {
	return [...paramIds]
		.sort((a, b) => a.localeCompare(b))
		.map((paramId) => ({
			param_id: paramId,
			...(note ? { notes: note } : {}),
		}));
}

function paramsEqual(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}

function getTextCapability(model) {
	if (!Array.isArray(model.capabilities)) return null;
	return model.capabilities.find((cap) => cap && cap.capability_id === "text.generate") ?? null;
}

function familyKey(providerId, apiModelId, providerModelSlug) {
	const candidates = modelCandidates({ providerId, apiModelId, providerModelSlug });
	const preferred = candidates.find((c) => c === normalizeModelId(apiModelId)) ?? candidates[0] ?? "";
	const rest = preferred.includes("/") ? preferred.split("/").slice(1).join("/") : preferred;
	const cleaned = rest
		.replace(/:free$/i, "")
		.replace(/-preview$/i, "")
		.replace(/-latest$/i, "")
		.replace(/-\d{4}-\d{2}-\d{2}$/i, "")
		.replace(/-\d{8}$/i, "");
	const head = cleaned.split("-")[0] || cleaned;
	const secondary = cleaned.split("-").slice(0, 2).join("-");

	if (providerId === "openai" && /^o\d+/.test(head)) return head;
	if (providerId === "openai" && head === "gpt") return "gpt";
	if (providerId === "google-ai-studio" && (head === "gemini" || head === "gemma")) return head;
	if (providerId === "mistral" && /^mistral|ministral|magistral|pixtral|voxtral|devstral|codestral/.test(head)) {
		return head;
	}
	if (providerId === "x-ai" && head === "grok") return secondary || head;
	return head;
}

function inferParamsFromAnchors(providerId, models, targetModel) {
	const targetCap = getTextCapability(targetModel);
	if (!targetCap) return null;
	const targetId = normalizeModelId(targetModel.api_model_id);
	if (targetId.includes("moderation")) return null;
	if (targetId.includes("embedding")) return null;

	const anchors = [];
	for (const model of models) {
		const cap = getTextCapability(model);
		const params = Array.isArray(cap?.params) ? cap.params : [];
		if (!cap || params.length === 0) continue;
		anchors.push({
			model,
			paramIds: params.map((p) => p?.param_id).filter((id) => typeof id === "string" && id),
			family: familyKey(providerId, model.api_model_id, model.provider_model_slug),
		});
	}
	if (anchors.length === 0) return null;

	const targetFamily = familyKey(providerId, targetModel.api_model_id, targetModel.provider_model_slug);
	const familyAnchors = anchors.filter((a) => a.family && a.family === targetFamily);
	if (familyAnchors.length > 0) {
		const freq = new Map();
		for (const anchor of familyAnchors) {
			for (const paramId of anchor.paramIds) {
				freq.set(paramId, (freq.get(paramId) ?? 0) + 1);
			}
		}
		const threshold = familyAnchors.length === 1 ? 1 : Math.ceil(familyAnchors.length * 0.6);
		const selected = [...freq.entries()]
			.filter(([, count]) => count >= threshold)
			.map(([paramId]) => paramId);
		if (selected.length > 0) {
			return {
				paramIds: selected,
				note: `inferred_from_family:${targetFamily}`,
			};
		}
	}

	if (anchors.length >= 8) {
		const freq = new Map();
		for (const anchor of anchors) {
			for (const paramId of anchor.paramIds) {
				freq.set(paramId, (freq.get(paramId) ?? 0) + 1);
			}
		}
		const threshold = Math.ceil(anchors.length * 0.85);
		const selected = [...freq.entries()]
			.filter(([, count]) => count >= threshold)
			.map(([paramId]) => paramId);
		if (selected.length > 0) {
			return {
				paramIds: selected,
				note: "inferred_from_provider_defaults",
			};
		}
	}
	return null;
}

async function main() {
	const csvRaw = await fs.readFile(OR_PARAMS_CSV, "utf8");
	const rows = parseCsv(csvRaw);
	const orMap = new Map();
	const globalModelParamMap = new Map();
	for (const row of rows) {
		const localProvider = mapOrProviderToLocal(row.provider_id);
		const modelId = normalizeModelId(row.model_id);
		const param = String(row.parameter || "").trim();
		if (!localProvider || !modelId || !param) continue;
		const providerMap = orMap.get(localProvider) ?? new Map();
		const paramSet = providerMap.get(modelId) ?? new Set();
		paramSet.add(param);
		providerMap.set(modelId, paramSet);
		orMap.set(localProvider, providerMap);

		const globalParamSet = globalModelParamMap.get(modelId) ?? new Set();
		globalParamSet.add(param);
		globalModelParamMap.set(modelId, globalParamSet);
	}

	const providerDirs = await fs.readdir(PROVIDERS_DIR, { withFileTypes: true });
	let filesChanged = 0;
	let modelsMatched = 0;
	let modelsUpdated = 0;
	let inferredUpdated = 0;
	const changedProviders = [];

	for (const dirent of providerDirs) {
		if (!dirent.isDirectory()) continue;
		const providerId = dirent.name;
		const modelsPath = path.join(PROVIDERS_DIR, providerId, "models.json");
		try {
			await fs.access(modelsPath);
		} catch {
			continue;
		}

		const raw = await fs.readFile(modelsPath, "utf8");
		const models = JSON.parse(raw);
		let fileChanged = false;
		let providerMatched = 0;
		let providerUpdated = 0;
		let providerInferred = 0;

		for (const model of models) {
			if (!Array.isArray(model.capabilities)) continue;
			const textCap = model.capabilities.find(
				(cap) => cap && cap.capability_id === "text.generate",
			);
			if (!textCap) continue;

			let matchedParams = null;
			let matchedFromGlobal = false;
			for (const providerKey of providerCandidates(providerId)) {
				const providerMap = orMap.get(providerKey);
				if (!providerMap) continue;
				const candidates = modelCandidates({
					providerId,
					apiModelId: model.api_model_id,
					providerModelSlug: model.provider_model_slug,
				});
				for (const candidateModelId of candidates) {
					const paramSet = providerMap.get(candidateModelId);
					if (paramSet && paramSet.size > 0) {
						matchedParams = paramSet;
						break;
					}
				}
				if (matchedParams) break;
			}
			if (!matchedParams) {
				const candidates = modelCandidates({
					providerId,
					apiModelId: model.api_model_id,
					providerModelSlug: model.provider_model_slug,
				});
				for (const candidateModelId of candidates) {
					const globalSet = globalModelParamMap.get(candidateModelId);
					if (globalSet && globalSet.size > 0) {
						matchedParams = globalSet;
						matchedFromGlobal = true;
						break;
					}
				}
			}

			if (!matchedParams) continue;
			modelsMatched += 1;
			providerMatched += 1;

			const nextParams = matchedFromGlobal
				? toParamObjectsWithNote(matchedParams, "sourced_from_or_global_model")
				: toParamObjects(matchedParams);
			const currentParams = Array.isArray(textCap.params) ? textCap.params : [];
			if (!paramsEqual(currentParams, nextParams)) {
				textCap.params = nextParams;
				modelsUpdated += 1;
				providerUpdated += 1;
				fileChanged = true;
			}
		}

		for (const model of models) {
			const textCap = getTextCapability(model);
			if (!textCap) continue;
			const currentParams = Array.isArray(textCap.params) ? textCap.params : [];
			if (currentParams.length > 0) continue;

			const inferred = inferParamsFromAnchors(providerId, models, model);
			if (!inferred || !Array.isArray(inferred.paramIds) || inferred.paramIds.length === 0) continue;

			const nextParams = toParamObjectsWithNote(inferred.paramIds, inferred.note);
			textCap.params = nextParams;
			modelsUpdated += 1;
			inferredUpdated += 1;
			providerUpdated += 1;
			providerInferred += 1;
			fileChanged = true;
		}

		if (fileChanged) {
			filesChanged += 1;
			changedProviders.push({
				provider: providerId,
				matched: providerMatched,
				updated: providerUpdated,
				inferred: providerInferred,
			});
			await fs.writeFile(modelsPath, `${JSON.stringify(models, null, 2)}\n`, "utf8");
		}
	}

	changedProviders.sort((a, b) => b.updated - a.updated || a.provider.localeCompare(b.provider));
	console.log(
		JSON.stringify(
			{
				or_rows: rows.length,
				or_provider_model_pairs: [...orMap.values()].reduce((acc, map) => acc + map.size, 0),
				files_changed: filesChanged,
				models_matched: modelsMatched,
				models_updated: modelsUpdated,
				models_inferred_updated: inferredUpdated,
				changed_providers: changedProviders,
			},
			null,
			2,
		),
	);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
