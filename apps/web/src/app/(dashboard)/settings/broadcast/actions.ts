"use server";

import { revalidatePath } from "next/cache";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import {
	requireAuthenticatedUser,
	requireTeamMembership,
} from "@/utils/serverActionAuth";

type BroadcastDestinationRow = {
	id: string;
	team_id: string;
	destination_id: string;
	name: string;
	enabled: boolean;
	sampling_rate: number;
	privacy_exclude_prompts_and_outputs: boolean;
	destination_config: Record<string, unknown> | null;
};

type BroadcastRuleField =
	| "model"
	| "provider"
	| "session_id"
	| "user_id"
	| "api_key_name"
	| "finish_reason"
	| "input"
	| "output"
	| "total_cost"
	| "total_tokens"
	| "prompt_tokens"
	| "completion_tokens";

type BroadcastRuleCondition =
	| "equals"
	| "not_equals"
	| "contains"
	| "not_contains"
	| "starts_with"
	| "ends_with"
	| "exists"
	| "not_exists"
	| "matches_regex";

type CreateBroadcastDestinationInput = {
	destinationId: string;
	name: string;
	config: Record<string, string>;
	privacyExcludePromptsAndOutputs?: boolean;
	samplingRate?: number;
	groupJoin?: "and" | "or";
	keyIds?: string[];
	ruleGroups?: Array<{
		match: "and" | "or";
		rules: Array<{
			field: BroadcastRuleField;
			condition: BroadcastRuleCondition;
			value?: string;
		}>;
	}>;
};

const ALLOWED_RULE_FIELDS = new Set<BroadcastRuleField>([
	"model",
	"provider",
	"session_id",
	"user_id",
	"api_key_name",
	"finish_reason",
	"input",
	"output",
	"total_cost",
	"total_tokens",
	"prompt_tokens",
	"completion_tokens",
]);

const ALLOWED_RULE_CONDITIONS = new Set<BroadcastRuleCondition>([
	"equals",
	"not_equals",
	"contains",
	"not_contains",
	"starts_with",
	"ends_with",
	"exists",
	"not_exists",
	"matches_regex",
]);

function isObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseHeaders(input: unknown): Record<string, string> {
	if (!input || typeof input !== "string") return {};
	try {
		const parsed = JSON.parse(input);
		if (!isObject(parsed)) return {};
		const out: Record<string, string> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === "string" && key.trim()) {
				out[key.trim()] = value;
			}
		}
		return out;
	} catch {
		return {};
	}
}

function getConfigValue(
	config: Record<string, unknown>,
	key: string,
): string {
	const value = config[key];
	if (typeof value !== "string") return "";
	return value.trim();
}

function resolveTestEndpoint(
	destinationId: string,
	config: Record<string, unknown>,
): string {
	if (destinationId === "webhook") return getConfigValue(config, "url");
	if (destinationId === "otel_collector") {
		return getConfigValue(config, "otlp_endpoint");
	}
	if (destinationId === "grafana_cloud") {
		return getConfigValue(config, "otlp_endpoint");
	}
	if (destinationId === "sentry") {
		return (
			getConfigValue(config, "otlp_endpoint") ||
			getConfigValue(config, "endpoint")
		);
	}

	const fallbackKeys = [
		"url",
		"endpoint",
		"otlp_endpoint",
		"collector_endpoint",
		"target",
		"host",
		"project_url",
		"base_url",
	] as const;
	for (const key of fallbackKeys) {
		const value = getConfigValue(config, key);
		if (value) return value;
	}
	return "";
}

function isPrivateIpv4(hostname: string): boolean {
	const parts = hostname.split(".").map((segment) => Number(segment));
	if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
		return false;
	}
	const [a, b] = parts;
	if (a === 10 || a === 127 || a === 0) return true;
	if (a === 169 && b === 254) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	return false;
}

function isPrivateIpv6(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	if (normalized === "::1") return true;
	if (normalized.startsWith("fe80:")) return true;
	if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
	return false;
}

function validateOutboundEndpoint(endpoint: string): { ok: true; value: string } | { ok: false; reason: string } {
	let parsed: URL;
	try {
		parsed = new URL(endpoint);
	} catch {
		return { ok: false, reason: "Endpoint must be a valid absolute URL." };
	}

	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		return { ok: false, reason: "Endpoint protocol must be http or https." };
	}
	if (parsed.username || parsed.password) {
		return { ok: false, reason: "Endpoint must not include URL credentials." };
	}

	const hostname = parsed.hostname.toLowerCase();
	if (!hostname) {
		return { ok: false, reason: "Endpoint hostname is required." };
	}
	if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
		return { ok: false, reason: "Endpoint hostname is not allowed." };
	}
	if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
		return { ok: false, reason: "Private or loopback endpoint addresses are not allowed." };
	}

	return { ok: true, value: parsed.toString() };
}

function normalizeDestinationId(destinationId: string): string {
	if (destinationId === "arize_ai") return "arize";
	if (destinationId === "new_relic_ai") return "new_relic";
	return destinationId;
}

function buildConnectionTestHeaders(
	destinationId: string,
	config: Record<string, unknown>,
): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...parseHeaders(config.headers_json),
	};

	const authHeader = getConfigValue(config, "auth_header");
	if (authHeader && !headers.Authorization && !headers.authorization) {
		headers.Authorization = authHeader;
	}

	if (destinationId === "grafana_cloud" && !headers.Authorization) {
		const instanceId = getConfigValue(config, "instance_id");
		const apiKey = getConfigValue(config, "api_key");
		if (instanceId && apiKey) {
			const basic = Buffer.from(`${instanceId}:${apiKey}`).toString("base64");
			headers.Authorization = `Basic ${basic}`;
		}
	}

	if (destinationId === "datadog" && !headers["DD-API-KEY"]) {
		const apiKey = getConfigValue(config, "api_key");
		if (apiKey) headers["DD-API-KEY"] = apiKey;
	}

	if ((destinationId === "new_relic" || destinationId === "new_relic_ai") && !headers["api-key"]) {
		const licenseKey = getConfigValue(config, "license_key");
		if (licenseKey) headers["api-key"] = licenseKey;
	}

	if (!headers.Authorization && !headers.authorization) {
		const tokenLikeKey =
			getConfigValue(config, "api_key") ||
			getConfigValue(config, "secret_key") ||
			getConfigValue(config, "token");
		if (tokenLikeKey) headers.Authorization = `Bearer ${tokenLikeKey}`;
	}

	return headers;
}

function normalizeTraceMethod(value: unknown): "POST" | "PUT" {
	const method = typeof value === "string" ? value.trim().toUpperCase() : "";
	if (method === "PUT") return "PUT";
	return "POST";
}

function nowUnixNanos(): bigint {
	return BigInt(Date.now()) * BigInt(1_000_000);
}

function makeTracePayload(args: {
	traceName: string;
	apiKeyName: string;
	model: string;
	providerName: string;
	providerSlug: string;
	privateMode: boolean;
}) {
	const openrouterTraceId = crypto.randomUUID();
	const traceId = crypto.randomUUID().replace(/-/g, "");
	const spanId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
	const start = nowUnixNanos();
	const end = start + BigInt(1_500_000_000);

	const promptPayload = JSON.stringify({
		messages: [{ role: "user", content: "What is the capital of France?" }],
	});

	const completionPayload = JSON.stringify({
		id: "chatcmpl-test123",
		object: "chat.completion",
		created: Math.floor(Date.now() / 1000),
		model: args.model,
		choices: [
			{
				index: 0,
				message: { role: "assistant", content: "The capital of France is Paris." },
				finish_reason: "stop",
			},
		],
		usage: {
			prompt_tokens: 50,
			completion_tokens: 100,
			total_tokens: 150,
			prompt_tokens_details: { cached_tokens: 20 },
			completion_tokens_details: { reasoning_tokens: 10 },
		},
	});

	const attributes: Array<Record<string, unknown>> = [
		{ key: "trace.name", value: { stringValue: args.traceName } },
		{ key: "user.id", value: { stringValue: "user_test_broadcast" } },
		{
			key: "trace.tags",
			value: { stringValue: JSON.stringify(["test", "observability", args.model]) },
		},
		{ key: "trace.metadata.environment", value: { stringValue: "test" } },
		{
			key: "trace.metadata.source",
			value: { stringValue: "observability-test-button" },
		},
		{
			key: "trace.metadata.testId",
			value: { stringValue: openrouterTraceId },
		},
		{ key: "span.type", value: { stringValue: "generation" } },
		{ key: "span.level", value: { stringValue: "DEFAULT" } },
		{ key: "span.metadata.test", value: { stringValue: "true" } },
		{ key: "gen_ai.operation.name", value: { stringValue: "chat" } },
		{ key: "gen_ai.system", value: { stringValue: "openai" } },
		{ key: "gen_ai.provider.name", value: { stringValue: args.providerName } },
		{ key: "gen_ai.request.model", value: { stringValue: args.model } },
		{ key: "gen_ai.response.model", value: { stringValue: args.model } },
		{ key: "gen_ai.usage.input_tokens", value: { intValue: 50 } },
		{ key: "gen_ai.usage.output_tokens", value: { intValue: 100 } },
		{ key: "gen_ai.usage.total_tokens", value: { intValue: 150 } },
		{ key: "gen_ai.usage.input_cost", value: { doubleValue: 0.005 } },
		{ key: "gen_ai.usage.output_cost", value: { doubleValue: 0.015 } },
		{ key: "gen_ai.usage.total_cost", value: { doubleValue: 0.02 } },
		{ key: "gen_ai.request.temperature", value: { doubleValue: 0.7 } },
		{ key: "gen_ai.request.max_tokens", value: { intValue: 150 } },
		{ key: "gen_ai.request.top_p", value: { intValue: 1 } },
		{ key: "gen_ai.request.frequency_penalty", value: { intValue: 0 } },
		{ key: "gen_ai.request.presence_penalty", value: { intValue: 0 } },
		{ key: "gen_ai.usage.input_tokens.cached", value: { intValue: 20 } },
		{ key: "gen_ai.usage.output_tokens.reasoning", value: { intValue: 10 } },
		{
			key: "gen_ai.response.finish_reasons",
			value: { stringValue: JSON.stringify(["stop"]) },
		},
		{ key: "gen_ai.response.finish_reason", value: { stringValue: "stop" } },
		{ key: "trace.metadata.ai_stats.source", value: { stringValue: "ai-stats" } },
		{ key: "trace.metadata.ai_stats.api_key_name", value: { stringValue: args.apiKeyName } },
		{
			key: "trace.metadata.ai_stats.provider_name",
			value: { stringValue: args.providerName },
		},
		{
			key: "trace.metadata.ai_stats.provider_slug",
			value: { stringValue: args.providerSlug },
		},
		{ key: "trace.metadata.ai_stats.finish_reason", value: { stringValue: "stop" } },
	];

	if (!args.privateMode) {
		attributes.push(
			{ key: "trace.input", value: { stringValue: promptPayload } },
			{ key: "trace.output", value: { stringValue: completionPayload } },
			{ key: "span.input", value: { stringValue: promptPayload } },
			{ key: "span.output", value: { stringValue: completionPayload } },
			{ key: "gen_ai.prompt", value: { stringValue: promptPayload } },
			{ key: "gen_ai.completion", value: { stringValue: completionPayload } },
		);
	}

	return {
		resourceSpans: [
			{
				resource: {
					attributes: [
						{ key: "service.name", value: { stringValue: "ai-stats-gateway" } },
						{
							key: "ai_stats.trace.id",
							value: { stringValue: openrouterTraceId },
						},
					],
				},
				scopeSpans: [
					{
						scope: { name: "ai-stats" },
						spans: [
							{
								traceId: traceId,
								spanId: spanId,
								name: "Test Generation",
								kind: 3,
								startTimeUnixNano: start.toString(),
								endTimeUnixNano: end.toString(),
								status: { code: 1 },
								attributes,
							},
						],
					},
				],
			},
		],
	};
}

async function getDestinationForTeam(
	id: string,
): Promise<{ supabase: any; row: BroadcastDestinationRow }> {
	const { supabase, user } = await requireAuthenticatedUser();
	const teamId = await getTeamIdFromCookie();
	if (!teamId) throw new Error("Missing team id");
	await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

	const { data, error } = await supabase
		.from("team_broadcast_destinations")
		.select(
			"id, team_id, destination_id, name, enabled, sampling_rate, privacy_exclude_prompts_and_outputs, destination_config",
		)
		.eq("id", id)
		.eq("team_id", teamId)
		.maybeSingle();
	if (error) throw error;
	if (!data) throw new Error("Destination not found");

	return { supabase, row: data as BroadcastDestinationRow };
}

export async function createBroadcastDestinationAction(args: CreateBroadcastDestinationInput) {
	const { supabase, user } = await requireAuthenticatedUser();
	const teamId = await getTeamIdFromCookie();
	if (!teamId) throw new Error("Missing team id");
	await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

	const destinationId = normalizeDestinationId(String(args.destinationId ?? "").trim());
	if (!destinationId) throw new Error("Missing destination id");

	const name = String(args.name ?? "").trim();
	if (!name) throw new Error("Destination name is required");

	const samplingRate = Number(args.samplingRate ?? 1);
	if (!Number.isFinite(samplingRate) || samplingRate < 0 || samplingRate > 1) {
		throw new Error("Sampling rate must be between 0 and 1");
	}

	const groupJoin: "and" | "or" = args.groupJoin === "and" ? "and" : "or";
	const privacyExcludePromptsAndOutputs = Boolean(args.privacyExcludePromptsAndOutputs);

	const rawConfig = isObject(args.config) ? args.config : {};
	const destinationConfig: Record<string, string> = {};
	for (const [key, value] of Object.entries(rawConfig)) {
		if (!key.trim()) continue;
		if (typeof value !== "string") continue;
		destinationConfig[key.trim()] = value;
	}

	const requestedKeyIds = Array.isArray(args.keyIds)
		? Array.from(
				new Set(
					args.keyIds
						.map((value) => String(value ?? "").trim())
						.filter((value) => value.length > 0),
				),
			)
		: [];

	const rawRuleGroups = Array.isArray(args.ruleGroups) ? args.ruleGroups : [];
	const normalizedRuleGroups = rawRuleGroups
		.map((group) => ({
			match: group?.match === "and" ? "and" : "or",
			rules: Array.isArray(group?.rules)
				? group.rules
						.map((rule) => {
							const field = String(rule?.field ?? "") as BroadcastRuleField;
							const condition = String(rule?.condition ?? "") as BroadcastRuleCondition;
							if (!ALLOWED_RULE_FIELDS.has(field) || !ALLOWED_RULE_CONDITIONS.has(condition)) {
								return null;
							}
							const needsValue = condition !== "exists" && condition !== "not_exists";
							const value = needsValue ? String(rule?.value ?? "").trim() : "";
							return {
								field,
								condition,
								value: needsValue ? (value.length ? value : null) : null,
							};
						})
						.filter((rule): rule is { field: BroadcastRuleField; condition: BroadcastRuleCondition; value: string | null } => Boolean(rule))
				: [],
		}))
		.filter((group) => group.rules.length > 0);

	let destinationRowId: string | null = null;

	try {
		const { data: createdDestination, error: insertDestinationError } = await supabase
			.from("team_broadcast_destinations")
			.insert({
				team_id: teamId,
				destination_id: destinationId,
				name,
				enabled: true,
				destination_config: destinationConfig,
				privacy_exclude_prompts_and_outputs: privacyExcludePromptsAndOutputs,
				sampling_rate: samplingRate,
				group_join_operator: groupJoin,
			})
			.select("id")
			.single();
		if (insertDestinationError) throw insertDestinationError;
		destinationRowId = String(createdDestination.id);

		if (requestedKeyIds.length > 0) {
			const { data: existingKeys, error: existingKeysError } = await supabase
				.from("keys")
				.select("id")
				.eq("team_id", teamId)
				.in("id", requestedKeyIds);
			if (existingKeysError) throw existingKeysError;

			const validKeyIds = (existingKeys ?? []).map((row: { id: string }) => row.id).filter(Boolean);
			if (validKeyIds.length > 0) {
				const { error: insertKeysError } = await supabase
					.from("broadcast_destination_keys")
					.insert(validKeyIds.map((keyId) => ({ destination_id: destinationRowId, key_id: keyId })));
				if (insertKeysError) throw insertKeysError;
			}
		}

		for (let groupIndex = 0; groupIndex < normalizedRuleGroups.length; groupIndex++) {
			const group = normalizedRuleGroups[groupIndex]!;
			const { data: createdGroup, error: insertGroupError } = await supabase
				.from("broadcast_destination_rule_groups")
				.insert({
					destination_id: destinationRowId,
					name: `Group ${groupIndex + 1}`,
					match_operator: group.match,
					position: groupIndex,
				})
				.select("id")
				.single();
			if (insertGroupError) throw insertGroupError;

			const rulesPayload = group.rules.map((rule, ruleIndex) => ({
				rule_group_id: createdGroup.id,
				field: rule.field,
				condition: rule.condition,
				value: rule.value,
				position: ruleIndex,
			}));
			if (rulesPayload.length > 0) {
				const { error: insertRulesError } = await supabase
					.from("broadcast_destination_rules")
					.insert(rulesPayload);
				if (insertRulesError) throw insertRulesError;
			}
		}

		revalidatePath("/settings/broadcast");
		return {
			ok: true,
			id: destinationRowId,
		};
	} catch (error) {
		if (destinationRowId) {
			await supabase
				.from("team_broadcast_destinations")
				.delete()
				.eq("id", destinationRowId)
				.eq("team_id", teamId);
		}
		throw error;
	}
}

export async function disableBroadcastDestinationAction(id: string) {
	if (!id) throw new Error("Missing destination id");
	const { supabase, row } = await getDestinationForTeam(id);

	const { error } = await supabase
		.from("team_broadcast_destinations")
		.update({ enabled: false, updated_at: new Date().toISOString() })
		.eq("id", row.id)
		.eq("team_id", row.team_id);
	if (error) throw error;

	revalidatePath("/settings/broadcast");
	return { ok: true };
}

export async function deleteBroadcastDestinationAction(id: string) {
	if (!id) throw new Error("Missing destination id");
	const { supabase, row } = await getDestinationForTeam(id);

	const { error } = await supabase
		.from("team_broadcast_destinations")
		.delete()
		.eq("id", row.id)
		.eq("team_id", row.team_id);
	if (error) throw error;

	revalidatePath("/settings/broadcast");
	return { ok: true };
}

export async function refreshBroadcastDestinationStatusAction(id: string) {
	if (!id) throw new Error("Missing destination id");
	const { row } = await getDestinationForTeam(id);

	if (row.destination_id !== "webhook") {
		return {
			ok: false,
			status: "Status check coming soon",
		};
	}

	const config = isObject(row.destination_config) ? row.destination_config : {};
	const url = String(config.url ?? "").trim();
	if (!url) {
		return { ok: false, status: "Missing webhook URL" };
	}
	const validatedEndpoint = validateOutboundEndpoint(url);
	if (!validatedEndpoint.ok) {
		return { ok: false, status: validatedEndpoint.reason };
	}

	const headers: Record<string, string> = {
		...parseHeaders(config.headers_json),
	};
	const authHeader = String(config.auth_header ?? "").trim();
	if (authHeader && !headers.Authorization && !headers.authorization) {
		headers.Authorization = authHeader;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10_000);

	try {
		let response = await fetch(validatedEndpoint.value, {
			method: "HEAD",
			headers,
			signal: controller.signal,
		});

		if (response.status === 405) {
			response = await fetch(validatedEndpoint.value, {
				method: "GET",
				headers,
				signal: controller.signal,
			});
		}

		if (response.ok) {
			return { ok: true, status: "Connected" };
		}

		return { ok: false, status: `Failed (${response.status})` };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Connection check failed";
		return { ok: false, status: message };
	} finally {
		clearTimeout(timeout);
	}
}

export async function sendBroadcastSampleTraceAction(id: string) {
	if (!id) throw new Error("Missing destination id");
	const { row } = await getDestinationForTeam(id);

	if (row.destination_id !== "webhook") {
		throw new Error("Sample trace is only implemented for Webhook currently.");
	}

	const config = isObject(row.destination_config) ? row.destination_config : {};
	const url = String(config.url ?? "").trim();
	if (!url) throw new Error("Webhook URL is missing");
	const validatedEndpoint = validateOutboundEndpoint(url);
	if (!validatedEndpoint.ok) {
		throw new Error(validatedEndpoint.reason);
	}

	const method = normalizeTraceMethod(config.method);
	const payload = makeTracePayload({
		traceName: `Test Trace - ${row.name}`,
		apiKeyName: "Test API Key",
		model: "openai/gpt-4-turbo",
		providerName: "OpenAI",
		providerSlug: "openai",
		privateMode: Boolean(row.privacy_exclude_prompts_and_outputs),
	});

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...parseHeaders(config.headers_json),
	};
	const authHeader = String(config.auth_header ?? "").trim();
	if (authHeader && !headers.Authorization && !headers.authorization) {
		headers.Authorization = authHeader;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10_000);

	try {
		const response = await fetch(validatedEndpoint.value, {
			method,
			headers,
			body: JSON.stringify(payload),
			signal: controller.signal,
		});
		const body = await response.text();
		if (!response.ok) {
			throw new Error(
				`Destination returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
			);
		}
		return {
			ok: true,
			status: "Sample trace sent",
			httpStatus: response.status,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "Failed to send sample trace";
		throw new Error(message);
	} finally {
		clearTimeout(timeout);
	}
}

export async function testBroadcastConnectionFromConfigAction(args: {
	destinationId: string;
	config: Record<string, string>;
}) {
	const { supabase, user } = await requireAuthenticatedUser();
	const teamId = await getTeamIdFromCookie();
	if (!teamId) throw new Error("Missing team id");
	await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

	const destinationId = String(args.destinationId ?? "").trim();
	if (!destinationId) throw new Error("Missing destination id");

	const config = isObject(args.config) ? args.config : {};
	const endpoint = resolveTestEndpoint(destinationId, config);
	if (!endpoint) {
		throw new Error("Missing endpoint for this destination configuration.");
	}
	const validatedEndpoint = validateOutboundEndpoint(endpoint);
	if (!validatedEndpoint.ok) {
		throw new Error(validatedEndpoint.reason);
	}

	const method = normalizeTraceMethod(getConfigValue(config, "method"));
	const headers = buildConnectionTestHeaders(destinationId, config);

	// Security hardening: only perform local validation during setup.
	// This avoids server-side fetches to user-configured destinations.
	return {
		ok: true,
		status: `Endpoint validated (${method})`,
		httpStatus: null as number | null,
		endpoint: validatedEndpoint.value,
		headerCount: Object.keys(headers).length,
	};
}
