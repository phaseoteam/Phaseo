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

	if (destinationId === "new_relic_ai" && !headers["api-key"]) {
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
		let response = await fetch(url, {
			method: "HEAD",
			headers,
			signal: controller.signal,
		});

		if (response.status === 405) {
			response = await fetch(url, {
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
		const response = await fetch(url, {
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

	const method = normalizeTraceMethod(getConfigValue(config, "method"));
	const headers = buildConnectionTestHeaders(destinationId, config);

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10_000);

	try {
		const response = await fetch(endpoint, {
			method,
			headers,
			body: JSON.stringify({ resourceSpans: [] }),
			signal: controller.signal,
		});
		const body = await response.text();
		if (!response.ok) {
			return {
				ok: false,
				status: `Failed (${response.status})${body ? `: ${body.slice(0, 180)}` : ""}`,
				httpStatus: response.status,
			};
		}
		return {
			ok: true,
			status: `Connected (${response.status})`,
			httpStatus: response.status,
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Connection check failed";
		return { ok: false, status: message };
	} finally {
		clearTimeout(timeout);
	}
}
