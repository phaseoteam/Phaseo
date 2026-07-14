#!/usr/bin/env node
"use strict";

const DEFAULT_BASE_URL =
	process.env.PHASEO_BASE_URL ||
	process.env.GATEWAY_URL ||
	"http://127.0.0.1:8787/v1";

const DEFAULT_API_KEY =
	process.env.PHASEO_API_KEY ||
	process.env.GATEWAY_API_KEY ||
	"";

const SAMPLING_PARAMS = [
	"temperature",
	"top_p",
	"top_k",
	"top_a",
	"min_p",
	"presence_penalty",
	"frequency_penalty",
	"repetition_penalty",
	"seed",
];

const NON_SAMPLING_PARAMS = [
	"max_tokens",
	"stop",
	"logprobs",
	"top_logprobs",
	"logit_bias",
	"response_format",
	"structured_outputs",
	"tools",
	"tool_choice",
	"reasoning",
	"include_reasoning",
];

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
	max_tokens: 64,
	stop: ["END"],
	logprobs: true,
	top_logprobs: 2,
	logit_bias: { "198": 1 },
	response_format: { type: "json_object" },
	structured_outputs: {
		json_schema: {
			name: "probe_schema",
			schema: {
				type: "object",
				properties: { ok: { type: "string" } },
				required: ["ok"],
			},
		},
	},
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
	reasoning: { enabled: true },
	include_reasoning: true,
};

function parseArgs(argv) {
	const out = {
		baseUrl: DEFAULT_BASE_URL,
		apiKey: DEFAULT_API_KEY,
		model: "",
		protocol: "chat",
		strictness: "error",
		prompt: "Reply with a single short sentence.",
		timeoutMs: 30000,
		scope: "all",
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--base-url") out.baseUrl = argv[++i];
		else if (arg === "--api-key") out.apiKey = argv[++i];
		else if (arg === "--model") out.model = argv[++i];
		else if (arg === "--protocol") out.protocol = String(argv[++i] || "").toLowerCase();
		else if (arg === "--strictness") out.strictness = String(argv[++i] || "").toLowerCase();
		else if (arg === "--prompt") out.prompt = argv[++i];
		else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++i]) || out.timeoutMs;
		else if (arg === "--scope") out.scope = String(argv[++i] || "").toLowerCase();
	}

	return out;
}

function normalizeBaseUrl(baseUrl) {
	const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
	if (!trimmed) return "http://127.0.0.1:8787/v1";
	return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function endpointUrl(baseUrl, path) {
	return `${normalizeBaseUrl(baseUrl)}${path}`;
}

function buildProbeBody(protocol, model, prompt, paramName, paramValue) {
	if (protocol === "responses") {
		const base = {
			model,
			input: [
				{
					role: "user",
					content: [{ type: "input_text", text: prompt }],
				},
			],
			max_output_tokens: 32,
			[paramName]: paramValue,
		};
		if (paramName === "tool_choice") base.tools = PARAM_TEST_VALUES.tools;
		if (paramName === "top_logprobs") base.logprobs = true;
		return base;
	}

	const base = {
		model,
		messages: [{ role: "user", content: prompt }],
		max_tokens: 32,
		[paramName]: paramValue,
	};
	if (paramName === "tool_choice") base.tools = PARAM_TEST_VALUES.tools;
	if (paramName === "top_logprobs") base.logprobs = true;
	return base;
}

function buildRequestPath(protocol) {
	return protocol === "responses" ? "/responses" : "/chat/completions";
}

function findModelEntry(models, modelId) {
	return models.find(
		(model) =>
			model?.model_id === modelId ||
			model?.id === modelId ||
			model?.canonical_slug === modelId
	);
}

function getSupportedParams(modelEntry) {
	const source =
		Array.isArray(modelEntry?.supported_parameters)
			? modelEntry.supported_parameters
			: Array.isArray(modelEntry?.supported_params)
				? modelEntry.supported_params
				: [];
	return source.map((value) => String(value || "").trim()).filter(Boolean);
}

function didParamDrop(responseJson, paramName) {
	const dropped = responseJson?.meta?.routing?.param_dropped_providers;
	if (!Array.isArray(dropped)) return false;
	return dropped.some((entry) => {
		const unsupported = Array.isArray(entry?.unsupported_params)
			? entry.unsupported_params
			: [];
		return unsupported.includes(paramName);
	});
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

function printUsageAndExit() {
	console.error(
		[
			"Usage:",
			"  node scripts/test-sampling-params.js --model <provider/model>",
			"",
			"Options:",
			"  --base-url <url>        Gateway base URL",
			"  --api-key <key>         Gateway API key",
			"  --protocol <chat|responses>   Request surface to probe (default: chat)",
			"  --strictness <off|warn|error> Strictness header value (default: error)",
			"  --scope <sampling|all>  Param scope (default: all)",
			"  --prompt <text>         Prompt for probe requests",
			"  --timeout-ms <number>   Per-request timeout in ms",
		].join("\n")
	);
	process.exit(1);
}

function summarizeProbeResult(result) {
	const statusText = result.status ? String(result.status) : "ERR";
	const verdict = result.ok ? (result.dropped ? "dropped" : "accepted") : "failed";
	return `${statusText.padStart(3)} | ${verdict.padEnd(8)} | ${result.param}`;
}

function paramsByScope(scope) {
	if (scope === "sampling") return [...SAMPLING_PARAMS];
	return [...new Set([...SAMPLING_PARAMS, ...NON_SAMPLING_PARAMS])];
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args.model) printUsageAndExit();
	if (!args.apiKey) {
		console.error("Missing API key. Pass --api-key or set PHASEO_API_KEY / GATEWAY_API_KEY.");
		process.exit(1);
	}
	if (!["chat", "responses"].includes(args.protocol)) {
		console.error(`Unsupported protocol '${args.protocol}'. Use chat or responses.`);
		process.exit(1);
	}
	if (!["off", "warn", "error"].includes(args.strictness)) {
		console.error(`Unsupported strictness '${args.strictness}'. Use off, warn, or error.`);
		process.exit(1);
	}
	if (!["sampling", "all"].includes(args.scope)) {
		console.error(`Unsupported scope '${args.scope}'. Use sampling or all.`);
		process.exit(1);
	}

	const commonHeaders = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${args.apiKey}`,
		"X-Phaseo-Strictness": args.strictness,
		"x-gateway-debug": "1",
	};

	const modelsResult = await fetchJson(
		endpointUrl(args.baseUrl, "/models"),
		{ method: "GET", headers: { Authorization: `Bearer ${args.apiKey}` } },
		args.timeoutMs
	);
	if (!modelsResult.res.ok) {
		console.error(`Failed to load /models: ${modelsResult.res.status} ${modelsResult.res.statusText}`);
		console.error(modelsResult.text.slice(0, 500));
		process.exit(1);
	}

	const models = Array.isArray(modelsResult.json?.models)
		? modelsResult.json.models
		: Array.isArray(modelsResult.json?.data)
			? modelsResult.json.data
			: [];
	const modelEntry = findModelEntry(models, args.model);
	if (!modelEntry) {
		console.error(`Model '${args.model}' was not found in /v1/models.`);
		process.exit(1);
	}

	const supported = getSupportedParams(modelEntry);
	const scopedKnown = paramsByScope(args.scope);
	const paramsToProbe = scopedKnown.filter((param) => supported.includes(param));
	const unknownSupported = supported.filter((param) => !scopedKnown.includes(param));

	if (!paramsToProbe.length) {
		console.log(`Model '${args.model}' exposes no probeable ${args.scope} params in supported_parameters.`);
		process.exit(0);
	}

	console.log(`Model: ${args.model}`);
	console.log(`Protocol: ${args.protocol}`);
	console.log(`Scope: ${args.scope}`);
	console.log(`Supported params: ${supported.join(", ")}`);
	if (unknownSupported.length) {
		console.log(`Unmapped supported params: ${unknownSupported.join(", ")}`);
	}
	console.log(`Probing (${paramsToProbe.length}): ${paramsToProbe.join(", ")}`);
	console.log("");

	const requestPath = buildRequestPath(args.protocol);
	const results = [];
	for (const param of paramsToProbe) {
		const body = buildProbeBody(args.protocol, args.model, args.prompt, param, PARAM_TEST_VALUES[param]);
		try {
			const probe = await fetchJson(
				endpointUrl(args.baseUrl, requestPath),
				{
					method: "POST",
					headers: commonHeaders,
					body: JSON.stringify(body),
				},
				args.timeoutMs
			);
			const dropped = probe.res.ok ? didParamDrop(probe.json, param) : false;
			results.push({
				param,
				ok: probe.res.ok,
				status: probe.res.status,
				dropped,
				message: probe.res.ok
					? null
					: (probe.json?.error?.message || probe.json?.message || probe.text || probe.res.statusText),
			});
		} catch (error) {
			results.push({
				param,
				ok: false,
				status: 0,
				dropped: false,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	for (const result of results) {
		console.log(summarizeProbeResult(result));
		if (!result.ok && result.message) {
			console.log(`      ${String(result.message).slice(0, 300)}`);
		}
	}

	const failed = results.filter((result) => !result.ok);
	const dropped = results.filter((result) => result.ok && result.dropped);
	console.log("");
	console.log(`Summary: ${results.length} probed, ${failed.length} failed, ${dropped.length} accepted-with-drop.`);

	if (failed.length || dropped.length) {
		process.exit(2);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
