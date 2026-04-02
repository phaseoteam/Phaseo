#!/usr/bin/env node
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");

const DEFAULT_BASE_URL =
	process.env.AI_STATS_BASE_URL ||
	process.env.GATEWAY_URL ||
	"http://127.0.0.1:8787/v1";

const DEFAULT_API_KEY =
	process.env.AI_STATS_API_KEY ||
	process.env.GATEWAY_API_KEY ||
	"";

const DEFAULT_MAPPING_CSV = path.join(
	process.cwd(),
	"internal",
	"OR_Parameters",
	"repo_openrouter_mapping.csv"
);

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_SCOPE = "gaps";
const EST_INPUT_TOKENS = 24;
const EST_OUTPUT_TOKENS = 18;
const CANARY_PARAMS = ["max_tokens", "temperature", "top_p"];

const PARAM_TEST_VALUES = {
	temperature: 0.7,
	top_p: 0.9,
	top_k: 40,
	top_a: 0.2,
	min_p: 0.1,
	presence_penalty: 0.3,
	frequency_penalty: 0.3,
	repetition_penalty: 1.05,
	seed: 42,
	max_tokens: 32,
	stop: ["END"],
	logprobs: true,
	top_logprobs: 2,
	logit_bias: { "198": 1 },
	response_format: { type: "json_object" },
	tools: [
		{
			type: "function",
			function: {
				name: "ping",
				description: "Ping tool",
				parameters: {
					type: "object",
					properties: {},
					required: [],
				},
			},
		},
	],
	tool_choice: "auto",
	reasoning: { effort: "low" },
	service_tier: "auto",
};

const PROBE_REGISTRY = Object.keys(PARAM_TEST_VALUES);

function parseCsvList(value) {
	return String(value || "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function parseArgs(argv) {
	const out = {
		baseUrl: DEFAULT_BASE_URL,
		apiKey: DEFAULT_API_KEY,
		protocol: "chat",
		scope: DEFAULT_SCOPE,
		run: false,
		maxPairs: 0,
		maxProbes: 0,
		timeoutMs: DEFAULT_TIMEOUT_MS,
		delayMs: 0,
		mappingCsv: DEFAULT_MAPPING_CSV,
		providers: [],
		models: [],
		includeAligned: false,
		prompt: "Reply with only OK.",
		outFile: "",
		help: false,
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--base-url") out.baseUrl = argv[++i];
		else if (arg === "--api-key") out.apiKey = argv[++i];
		else if (arg === "--protocol") out.protocol = String(argv[++i] || "").toLowerCase();
		else if (arg === "--scope") out.scope = String(argv[++i] || "").toLowerCase();
		else if (arg === "--run") out.run = true;
		else if (arg === "--dry-run") out.run = false;
		else if (arg === "--max-pairs") out.maxPairs = Number(argv[++i]) || 0;
		else if (arg === "--max-probes") out.maxProbes = Number(argv[++i]) || 0;
		else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++i]) || DEFAULT_TIMEOUT_MS;
		else if (arg === "--delay-ms") out.delayMs = Number(argv[++i]) || 0;
		else if (arg === "--mapping-csv") out.mappingCsv = argv[++i];
		else if (arg === "--provider") out.providers.push(...parseCsvList(argv[++i]));
		else if (arg === "--model") out.models.push(...parseCsvList(argv[++i]));
		else if (arg === "--include-aligned") out.includeAligned = true;
		else if (arg === "--prompt") out.prompt = argv[++i] || out.prompt;
		else if (arg === "--out") out.outFile = argv[++i] || "";
		else if (arg === "--help" || arg === "-h") out.help = true;
	}

	return out;
}

function printUsageAndExit() {
	console.log(
		[
			"Usage:",
			"  node scripts/probe-parameter-support-matrix.js [options]",
			"",
			"Options:",
			"  --run                      Execute live probes (default is dry-run plan only)",
			"  --base-url <url>           Gateway URL (default: AI_STATS_BASE_URL/GATEWAY_URL/localhost)",
			"  --api-key <key>            Gateway API key (default: AI_STATS_API_KEY/GATEWAY_API_KEY)",
			"  --protocol <chat|responses> Endpoint surface to probe (default: chat)",
			"  --scope <gaps|mismatch|all> Pair selection scope (default: gaps)",
			"  --max-pairs <n>            Hard cap on number of provider-model pairs",
			"  --max-probes <n>           Hard cap on total requests (baseline+param probes)",
			"  --provider <csv>           Filter provider IDs (e.g. openai,anthropic)",
			"  --model <csv>              Filter model IDs (exact match)",
			"  --mapping-csv <path>       OR seed mapping CSV path",
			"  --include-aligned          Include aligned pairs in planning/probing",
			"  --timeout-ms <n>           Per request timeout (default: 30000)",
			"  --delay-ms <n>             Delay between live requests",
			"  --prompt <text>            Prompt used in probes",
			"  --out <path>               Output report path (JSON)",
		].join("\n")
	);
	process.exit(0);
}

function normalizeBaseUrl(baseUrl) {
	const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
	if (!trimmed) return "http://127.0.0.1:8787/v1";
	return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function endpointUrl(baseUrl, pathName) {
	return `${normalizeBaseUrl(baseUrl)}${pathName}`;
}

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
	return out.map((value) => value.trim());
}

function parseCsv(text) {
	const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim().length > 0);
	if (!lines.length) return [];
	const header = splitCsvLine(lines[0]);
	const rows = [];
	for (let i = 1; i < lines.length; i += 1) {
		const parts = splitCsvLine(lines[i]);
		if (!parts.length) continue;
		const row = {};
		for (let j = 0; j < header.length; j += 1) {
			row[header[j]] = parts[j] ?? "";
		}
		rows.push(row);
	}
	return rows;
}

function parseParamPipe(value) {
	if (!value) return [];
	return String(value)
		.split("|")
		.map((entry) => canonicalizeParam(entry))
		.filter(Boolean);
}

function canonicalizeParam(input) {
	const raw = String(input || "").trim().toLowerCase();
	if (!raw) return "";
	if (raw === "max_output_tokens" || raw === "max_completion_tokens") return "max_tokens";
	if (raw === "stop_sequences") return "stop";
	if (raw === "thinking" || raw === "include_reasoning") return "reasoning";
	if (raw === "structured_outputs" || raw === "text") return "response_format";
	if (raw === "max_tools_calls") return "max_tool_calls";
	return raw;
}

function unique(values) {
	return [...new Set(values)];
}

function sortedUnique(values) {
	return unique(values).sort((a, b) => a.localeCompare(b));
}

function toSet(values) {
	return new Set(sortedUnique(values));
}

function arrayDiff(left, right) {
	const rightSet = toSet(right);
	return sortedUnique(left).filter((value) => !rightSet.has(value));
}

function intersection(values, registry) {
	const allowed = new Set(registry);
	return sortedUnique(values).filter((value) => allowed.has(value));
}

function endpointAllowedForProtocol(model, protocol) {
	const endpoints = Array.isArray(model?.endpoints)
		? model.endpoints.map((value) => String(value || "").toLowerCase())
		: [];
	if (!endpoints.length) return true;
	if (protocol === "responses") return endpoints.includes("responses");
	if (protocol === "chat") return endpoints.includes("chat/completions");
	return false;
}

function providerActive(providerEntry) {
	if (!providerEntry || typeof providerEntry !== "object") return false;
	if (providerEntry.is_active_gateway === undefined) return true;
	return Boolean(providerEntry.is_active_gateway);
}

function normalizePairKey(providerId, modelId) {
	return `${String(providerId || "").trim().toLowerCase()}|${String(modelId || "").trim().toLowerCase()}`;
}

function normalizeProviderList(values) {
	return sortedUnique(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
}

function getModelId(model) {
	return (
		String(model?.model_id || model?.id || model?.canonical_slug || "").trim()
	);
}

function getModelSupportedParams(model) {
	const source = Array.isArray(model?.supported_parameters)
		? model.supported_parameters
		: Array.isArray(model?.supported_params)
			? model.supported_params
			: [];
	return source.map((param) => canonicalizeParam(param)).filter(Boolean);
}

function getProviderParams(providerEntry) {
	const source = Array.isArray(providerEntry?.params) ? providerEntry.params : [];
	return source.map((param) => canonicalizeParam(param)).filter(Boolean);
}

function chooseMappingRow(existing, candidate) {
	if (!existing) return candidate;
	const score = (row) => {
		const matched = String(row.match_status || "").toLowerCase() === "matched" ? 2 : 0;
		const hasOrParams = row.orParams.length > 0 ? 1 : 0;
		return matched + hasOrParams;
	};
	return score(candidate) > score(existing) ? candidate : existing;
}

async function loadMappingRows(csvPath) {
	const raw = await fs.readFile(csvPath, "utf8");
	const rows = parseCsv(raw);
	const map = new Map();
	for (const row of rows) {
		const providerId = String(row.repo_provider_id || "").trim();
		const modelId = String(row.repo_api_model_id || "").trim();
		if (!providerId || !modelId) continue;
		const normalized = {
			providerId,
			modelId,
			matchStatus: String(row.match_status || "").trim().toLowerCase(),
			orParams: sortedUnique(parseParamPipe(row.provider_supported_parameters)),
			repoParams: sortedUnique(parseParamPipe(row.repo_supported_parameters)),
			missingInRepo: sortedUnique(parseParamPipe(row.missing_in_repo)),
			extraInRepo: sortedUnique(parseParamPipe(row.extra_in_repo)),
			candidateMatches: String(row.candidate_matches || "").trim(),
			overrideNote: String(row.override_note || "").trim(),
		};
		const key = normalizePairKey(providerId, modelId);
		const existing = map.get(key);
		map.set(key, chooseMappingRow(existing, normalized));
	}
	return map;
}

async function fetchJson(url, init, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { ...init, signal: controller.signal });
		const text = await res.text();
		let json = null;
		if (text) {
			try {
				json = JSON.parse(text);
			} catch {
				json = null;
			}
		}
		return { res, text, json };
	} finally {
		clearTimeout(timer);
	}
}

async function loadGatewayModels(args) {
	const modelsResult = await fetchJson(
		endpointUrl(args.baseUrl, "/models"),
		{
			method: "GET",
			headers: { Authorization: `Bearer ${args.apiKey}` },
		},
		args.timeoutMs
	);
	if (!modelsResult.res.ok) {
		throw new Error(
			`Failed to load /models: ${modelsResult.res.status} ${modelsResult.res.statusText}\n${modelsResult.text.slice(0, 500)}`
		);
	}
	const models = Array.isArray(modelsResult.json?.models)
		? modelsResult.json.models
		: Array.isArray(modelsResult.json?.data)
			? modelsResult.json.data
			: [];
	return models;
}

function collectGatewayPairs(models, args) {
	const providerFilter = new Set(normalizeProviderList(args.providers));
	const modelFilter = new Set(normalizeProviderList(args.models));
	const pairs = [];
	for (const model of models) {
		const modelId = getModelId(model);
		if (!modelId) continue;
		if (modelFilter.size && !modelFilter.has(modelId.toLowerCase())) continue;
		if (!endpointAllowedForProtocol(model, args.protocol)) continue;

		const providers = Array.isArray(model.providers) ? model.providers : [];
		if (!providers.length) continue;
		const modelParams = getModelSupportedParams(model);
		for (const providerEntry of providers) {
			if (!providerActive(providerEntry)) continue;
			const providerId = String(providerEntry?.api_provider_id || "").trim();
			if (!providerId) continue;
			if (providerFilter.size && !providerFilter.has(providerId.toLowerCase())) continue;
			const providerParams = getProviderParams(providerEntry);
			const effectiveParams = providerParams.length ? providerParams : modelParams;
			pairs.push({
				key: normalizePairKey(providerId, modelId),
				providerId,
				modelId,
				modelName: String(model?.name || "").trim() || modelId,
				endpoints: Array.isArray(model?.endpoints) ? model.endpoints : [],
				pricing: model?.pricing || null,
				gatewayParams: sortedUnique(effectiveParams),
				gatewayModelParams: sortedUnique(modelParams),
				gatewayProviderParams: sortedUnique(providerParams),
			});
		}
	}
	return pairs.sort((a, b) =>
		a.providerId.localeCompare(b.providerId) || a.modelId.localeCompare(b.modelId)
	);
}

function classifyPair(pair, mappingRow) {
	if (!mappingRow) return "missing_mapping";
	if (mappingRow.matchStatus !== "matched") return "unmatched_mapping";
	if (!mappingRow.orParams.length) return "missing_or_params";
	const missingInGateway = arrayDiff(mappingRow.orParams, pair.gatewayParams);
	const missingInOR = arrayDiff(pair.gatewayParams, mappingRow.orParams);
	return missingInGateway.length || missingInOR.length ? "mismatch" : "aligned";
}

function buildProbeParams(status, pair, mappingRow) {
	const source = new Set();
	if (status === "mismatch") {
		for (const param of arrayDiff(mappingRow?.orParams || [], pair.gatewayParams)) source.add(param);
		for (const param of arrayDiff(pair.gatewayParams, mappingRow?.orParams || [])) source.add(param);
		for (const param of CANARY_PARAMS) source.add(param);
	} else if (status === "aligned") {
		for (const param of CANARY_PARAMS) source.add(param);
	} else {
		for (const param of PROBE_REGISTRY) source.add(param);
	}

	for (const param of pair.gatewayParams) source.add(param);
	for (const param of mappingRow?.orParams || []) source.add(param);

	const allCandidateParams = sortedUnique([...source].map((param) => canonicalizeParam(param)).filter(Boolean));
	const probeableParams = intersection(allCandidateParams, PROBE_REGISTRY);
	const unprobeableParams = allCandidateParams.filter((param) => !PROBE_REGISTRY.includes(param));
	return { probeableParams, unprobeableParams };
}

function includeStatusForScope(status, scope) {
	if (scope === "all") return true;
	if (scope === "mismatch") return status === "mismatch";
	return status !== "aligned";
}

function estimateRequestCostUsd(pricing, requestCount) {
	const prompt = Number(pricing?.prompt);
	const completion = Number(pricing?.completion);
	if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return null;
	const perRequest = prompt * EST_INPUT_TOKENS + completion * EST_OUTPUT_TOKENS;
	if (!Number.isFinite(perRequest) || perRequest < 0) return null;
	return perRequest * requestCount;
}

function applyPairAndProbeBudgets(pairs, maxPairs, maxProbes) {
	const slicedByPairs = maxPairs > 0 ? pairs.slice(0, maxPairs) : pairs;
	if (maxProbes <= 0) return slicedByPairs;

	const out = [];
	let used = 0;
	for (const pair of slicedByPairs) {
		const remaining = maxProbes - used;
		if (remaining <= 0) break;
		if (remaining === 1) {
			out.push({ ...pair, probeParams: [] });
			used += 1;
			continue;
		}
		const allowance = Math.max(0, remaining - 1);
		const probeParams = pair.probeParams.slice(0, allowance);
		out.push({ ...pair, probeParams });
		used += 1 + probeParams.length;
	}
	return out;
}

function buildPlan(gatewayPairs, mappingRows, args) {
	const classified = gatewayPairs.map((pair) => {
		const mappingRow = mappingRows.get(pair.key) || null;
		const status = classifyPair(pair, mappingRow);
		const missingInGateway = mappingRow ? arrayDiff(mappingRow.orParams, pair.gatewayParams) : [];
		const missingInOR = mappingRow ? arrayDiff(pair.gatewayParams, mappingRow.orParams) : [];
		const probe = buildProbeParams(status, pair, mappingRow);
		return {
			...pair,
			status,
			mappingRow,
			orParams: mappingRow?.orParams || [],
			missingInGateway,
			missingInOR,
			probeParams: probe.probeableParams,
			unprobeableParams: probe.unprobeableParams,
		};
	});

	const statusCounts = {};
	for (const pair of classified) {
		statusCounts[pair.status] = (statusCounts[pair.status] || 0) + 1;
	}

	let selected = classified.filter((pair) => includeStatusForScope(pair.status, args.scope));
	if (!args.includeAligned) {
		selected = selected.filter((pair) => pair.status !== "aligned");
	}
	const budgeted = applyPairAndProbeBudgets(selected, args.maxPairs, args.maxProbes);

	let estimatedCostUsd = 0;
	let estimatedCostKnown = 0;
	let estimatedRequests = 0;
	for (const pair of budgeted) {
		const requestCount = 1 + pair.probeParams.length;
		estimatedRequests += requestCount;
		const estimated = estimateRequestCostUsd(pair.pricing, requestCount);
		if (estimated !== null) {
			estimatedCostUsd += estimated;
			estimatedCostKnown += 1;
		}
	}

	return {
		allPairs: classified,
		selectedPairs: budgeted,
		statusCounts,
		estimatedRequests,
		estimatedCostUsd,
		estimatedCostKnownPairs: estimatedCostKnown,
	};
}

function buildBaseBody(args, pair) {
	const provider = {
		only: [pair.providerId],
		order: [pair.providerId],
		allow_fallbacks: false,
	};

	if (args.protocol === "responses") {
		return {
			model: pair.modelId,
			input: [
				{
					role: "user",
					content: [{ type: "input_text", text: args.prompt }],
				},
			],
			max_output_tokens: 32,
			provider,
		};
	}

	return {
		model: pair.modelId,
		messages: [{ role: "user", content: args.prompt }],
		max_tokens: 32,
		provider,
	};
}

function applyProbeParam(body, args, paramName) {
	const value = PARAM_TEST_VALUES[paramName];
	if (value === undefined) return;
	if (paramName === "max_tokens") {
		if (args.protocol === "responses") body.max_output_tokens = value;
		else body.max_tokens = value;
		return;
	}
	body[paramName] = value;
	if (paramName === "tool_choice") body.tools = PARAM_TEST_VALUES.tools;
	if (paramName === "top_logprobs") body.logprobs = true;
}

function requestPath(protocol) {
	return protocol === "responses" ? "/responses" : "/chat/completions";
}

function didParamDrop(responseJson, paramName, providerId) {
	const dropped = responseJson?.meta?.routing?.param_dropped_providers;
	if (!Array.isArray(dropped)) return false;
	return dropped.some((entry) => {
		const unsupported = Array.isArray(entry?.unsupported_params)
			? entry.unsupported_params.map((param) => canonicalizeParam(param))
			: [];
		const entryProvider = String(entry?.provider || "").trim().toLowerCase();
		if (providerId && entryProvider && entryProvider !== providerId.toLowerCase()) return false;
		return unsupported.includes(canonicalizeParam(paramName));
	});
}

function getRoutingSelectedProvider(responseJson) {
	const selected = responseJson?.meta?.routing?.selected_provider;
	return String(selected || "").trim();
}

function summarizeHttpError(probeResult) {
	if (probeResult.json?.error?.message) return String(probeResult.json.error.message);
	if (probeResult.json?.message) return String(probeResult.json.message);
	if (probeResult.text) return String(probeResult.text);
	return probeResult.res.statusText || "request failed";
}

async function runProbeRequest(args, pair, paramName) {
	const body = buildBaseBody(args, pair);
	if (paramName) applyProbeParam(body, args, paramName);

	const probe = await fetchJson(
		endpointUrl(args.baseUrl, requestPath(args.protocol)),
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${args.apiKey}`,
				"x-gateway-debug": "1",
			},
			body: JSON.stringify(body),
		},
		args.timeoutMs
	);

	const selectedProvider = getRoutingSelectedProvider(probe.json);
	const dropped = paramName ? didParamDrop(probe.json, paramName, pair.providerId) : false;
	const routedElsewhere = Boolean(
		selectedProvider && selectedProvider.toLowerCase() !== pair.providerId.toLowerCase()
	);
	return {
		ok: probe.res.ok,
		status: probe.res.status,
		dropped,
		routedElsewhere,
		selectedProvider: selectedProvider || null,
		message: probe.res.ok ? null : summarizeHttpError(probe),
	};
}

async function runLivePlan(args, selectedPairs) {
	const results = [];
	let totalRequests = 0;
	for (const pair of selectedPairs) {
		const pairResult = {
			providerId: pair.providerId,
			modelId: pair.modelId,
			status: pair.status,
			probeParams: pair.probeParams,
			baseline: null,
			probes: [],
			skippedReason: null,
		};

		try {
			pairResult.baseline = await runProbeRequest(args, pair, null);
			totalRequests += 1;
		} catch (error) {
			pairResult.baseline = {
				ok: false,
				status: 0,
				dropped: false,
				routedElsewhere: false,
				selectedProvider: null,
				message: error instanceof Error ? error.message : String(error),
			};
			pairResult.skippedReason = "baseline_failed";
			results.push(pairResult);
			continue;
		}

		if (!pairResult.baseline.ok) {
			pairResult.skippedReason = "baseline_failed";
			results.push(pairResult);
			if (args.delayMs > 0) await sleep(args.delayMs);
			continue;
		}

		for (const paramName of pair.probeParams) {
			try {
				const probe = await runProbeRequest(args, pair, paramName);
				totalRequests += 1;
				pairResult.probes.push({
					param: paramName,
					...probe,
				});
			} catch (error) {
				pairResult.probes.push({
					param: paramName,
					ok: false,
					status: 0,
					dropped: false,
					routedElsewhere: false,
					selectedProvider: null,
					message: error instanceof Error ? error.message : String(error),
				});
			}
			if (args.delayMs > 0) await sleep(args.delayMs);
		}
		results.push(pairResult);
	}

	return { results, totalRequests };
}

function toIsoStamp() {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

function formatUsd(value) {
	if (!Number.isFinite(value) || value < 0) return "n/a";
	return `$${value.toFixed(6)}`;
}

async function writeReport(args, plan, liveResult) {
	const outPath =
		args.outFile ||
		path.join(process.cwd(), "reports", `parameter-support-matrix-${toIsoStamp()}.json`);
	await fs.mkdir(path.dirname(outPath), { recursive: true });

	const report = {
		generated_at: new Date().toISOString(),
		config: {
			base_url: normalizeBaseUrl(args.baseUrl),
			protocol: args.protocol,
			scope: args.scope,
			run: args.run,
			max_pairs: args.maxPairs,
			max_probes: args.maxProbes,
			timeout_ms: args.timeoutMs,
			delay_ms: args.delayMs,
			mapping_csv: args.mappingCsv,
			providers: normalizeProviderList(args.providers),
			models: normalizeProviderList(args.models),
		},
		summary: {
			gateway_pairs_total: plan.allPairs.length,
			selected_pairs: plan.selectedPairs.length,
			status_counts: plan.statusCounts,
			planned_requests: plan.estimatedRequests,
			estimated_cost_usd: plan.estimatedCostUsd,
			estimated_cost_known_pairs: plan.estimatedCostKnownPairs,
			live_requests_sent: liveResult?.totalRequests ?? 0,
		},
		pairs: plan.selectedPairs.map((pair) => {
			const live = liveResult?.results.find(
				(entry) => normalizePairKey(entry.providerId, entry.modelId) === pair.key
			);
			return {
				provider_id: pair.providerId,
				model_id: pair.modelId,
				model_name: pair.modelName,
				status: pair.status,
				endpoints: pair.endpoints,
				gateway_params: pair.gatewayParams,
				or_params: pair.orParams,
				missing_in_gateway: pair.missingInGateway,
				missing_in_or: pair.missingInOR,
				probe_params: pair.probeParams,
				unprobeable_params: pair.unprobeableParams,
				mapping_match_status: pair.mappingRow?.matchStatus || null,
				live: live || null,
			};
		}),
	};

	await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	return outPath;
}

function printPlanSummary(args, plan) {
	console.log(`Protocol: ${args.protocol}`);
	console.log(`Scope: ${args.scope}`);
	console.log(`Run live probes: ${args.run ? "yes" : "no (dry-run)"}`);
	console.log(`Gateway pairs: ${plan.allPairs.length}`);
	console.log(`Selected pairs: ${plan.selectedPairs.length}`);
	console.log(`Status counts: ${JSON.stringify(plan.statusCounts)}`);
	console.log(`Planned requests: ${plan.estimatedRequests}`);
	console.log(
		`Estimated spend (known pricing on ${plan.estimatedCostKnownPairs} pairs): ${formatUsd(plan.estimatedCostUsd)}`
	);
	if (plan.selectedPairs.length > 0) {
		const preview = plan.selectedPairs
			.slice(0, 12)
			.map((pair) => `${pair.providerId}/${pair.modelId} [${pair.status}] probes=${pair.probeParams.length}`);
		console.log("Preview:");
		for (const row of preview) console.log(`  - ${row}`);
		if (plan.selectedPairs.length > preview.length) {
			console.log(`  ... ${plan.selectedPairs.length - preview.length} more`);
		}
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) printUsageAndExit();

	if (!["chat", "responses"].includes(args.protocol)) {
		throw new Error(`Unsupported protocol '${args.protocol}'. Use chat or responses.`);
	}
	if (!["gaps", "mismatch", "all"].includes(args.scope)) {
		throw new Error(`Unsupported scope '${args.scope}'. Use gaps, mismatch, or all.`);
	}
	if (args.run && !args.apiKey) {
		throw new Error("Missing API key. Pass --api-key or set AI_STATS_API_KEY / GATEWAY_API_KEY.");
	}
	if (!args.apiKey) {
		console.warn("No API key set. Continuing in plan-only mode from /models will likely fail.");
	}

	const models = await loadGatewayModels(args);
	const mappingRows = await loadMappingRows(args.mappingCsv);
	const gatewayPairs = collectGatewayPairs(models, args);
	const plan = buildPlan(gatewayPairs, mappingRows, args);
	printPlanSummary(args, plan);

	let liveResult = null;
	if (args.run) {
		console.log("");
		console.log("Running live probes...");
		liveResult = await runLivePlan(args, plan.selectedPairs);
		const baselineFailures = liveResult.results.filter((entry) => !entry.baseline?.ok).length;
		const probeFailures = liveResult.results.reduce(
			(acc, entry) => acc + entry.probes.filter((probe) => !probe.ok || probe.dropped || probe.routedElsewhere).length,
			0
		);
		console.log(`Live requests sent: ${liveResult.totalRequests}`);
		console.log(`Baseline failures: ${baselineFailures}`);
		console.log(`Probe failures/drops/routing-mismatches: ${probeFailures}`);
	}

	const reportPath = await writeReport(args, plan, liveResult);
	console.log("");
	console.log(`Report written: ${reportPath}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
