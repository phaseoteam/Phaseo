import {
	AgentGatewayError,
	createAgent,
	createGatewayAgentClient,
	isAgentGatewayError,
	maxCost,
	stepCountIs,
	type AgentModelClient,
	type AgentModelResponse,
	type AgentRunResult,
	type AgentTool,
} from "@phaseo/agent-sdk";
import type { Env } from "./env";
import { withoutTrailingSlashes } from "./url";

// The agent run behind a small interface, so a turn can be tested without the
// gateway. The real runner uses @phaseo/agent-sdk against the gateway's public URL,
// with the installation's managed key.
//
// The Slack data rules live on the installation's key, not in the request: its
// "Slack agent" guardrail allows no provider that trains on prompts (the gateway
// applies it from provider data-policy metadata), and the key stores no
// content (never_store_content, set at install). The request must not send
// provider.data_collection: the gateway rejects "deny" with a 400.

export const AGENT_ID = "phaseo-slack-agent";
export const MAX_STEPS = 12;
/** A turn stops once its model spend reaches this, in US dollars. */
export const TURN_MAX_COST_USD = 0.5;
export const APP_TITLE = "Phaseo Slack agent";
/** Server tools the gateway runs itself. */
export const GATEWAY_TOOLS: Array<{ type: "phaseo:web_search" } | { type: "phaseo:web_fetch" }> = [{ type: "phaseo:web_search" }, { type: "phaseo:web_fetch" }];
const DEFAULT_GATEWAY_BASE_URL = "https://api.phaseo.app/v1";

export type AgentTurnRequest = {
	gatewayKey: string;
	model: string;
	instructions: string;
	prompt: string;
	/** slack:<team>:<user>, the gateway's end user. */
	endUser: string;
	labels: { slackTeam: string; slackChannel: string };
	tools: AgentTool<any, any>[];
	/** What this run may spend, in US dollars: the turn's limit less what earlier attempts spent. */
	maxCostUsd: number;
	signal: AbortSignal;
};

export type AgentTurnHooks = {
	onText(delta: string): Promise<void>;
	/** After each agent step, with what the run has spent so far; the turn stages its reply and cost and checks its cancel flag here. */
	onStep(progress: { costUsd: number }): Promise<void>;
};

export type AgentTurnOutput = {
	costUsd: number;
	/** The model that answered last (the auto router resolves phaseo/auto to one). */
	model: string | null;
	/** Set when a limit stopped the run before the model finished, e.g. step_count:12 or max_cost:0.5. */
	stopReason: string | null;
};

export interface AgentRunner {
	run(request: AgentTurnRequest, hooks: AgentTurnHooks): Promise<AgentTurnOutput>;
}

/** The x-phaseo-metadata labels every Slack agent request carries (filterable in Logs and Usage). */
export function requestLabelsHeader(labels: AgentTurnRequest["labels"]): string {
	return JSON.stringify({
		labels: [
			{ key: "app", value: "slack-agent" },
			{ key: "slack_team", value: labels.slackTeam },
			{ key: "slack_channel", value: labels.slackChannel },
		],
	});
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The gateway's base URL. Requests carry the installation's managed key, so it
 * must be HTTPS; plain HTTP is only accepted for a gateway on this machine (local
 * development). Anything else fails, rather than sending the key unencrypted.
 */
export function gatewayBaseUrl(env: Pick<Env, "PHASEO_API_BASE_URL">): string {
	const configured = withoutTrailingSlashes(env.PHASEO_API_BASE_URL?.trim() ?? "");
	if (!configured) return DEFAULT_GATEWAY_BASE_URL;
	let url: URL;
	try {
		url = new URL(configured);
	} catch {
		throw new Error("PHASEO_API_BASE_URL is not a valid URL");
	}
	if (url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))) return configured;
	throw new Error("PHASEO_API_BASE_URL must use https");
}

/**
 * Requests go to the gateway's public URL, not through a service binding: a
 * binding's request carries no country, and providers that refuse requests from
 * an unknown country (OpenAI, Anthropic and others) would then never answer.
 * Called through a function so the runtime's fetch keeps its own `this`.
 */
export function gatewayFetch(): typeof fetch {
	return ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)) as typeof fetch;
}

/** A model response's cost, read the way the SDK's maxCost reads it. */
function responseCost(response: AgentModelResponse): number {
	if (typeof response.cost === "number") return response.cost;
	for (const key of ["cost", "total_cost", "totalCost"]) {
		const value = response.usage?.[key];
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return 0;
}

/** The gateway client, adding up what each model response cost, so a turn can record its spend after every step. */
function meteredClient(client: AgentModelClient, onCost: (usd: number) => void): AgentModelClient {
	const stream = client.stream;
	return {
		...client,
		async generate(request) {
			const response = await client.generate(request);
			onCost(responseCost(response));
			return response;
		},
		...(stream ? {
			async *stream(request) {
				for await (const event of stream.call(client, request)) {
					if (event.type === "response.completed") onCost(responseCost(event.response));
					yield event;
				}
			},
		} : {}),
	};
}

function lastModel(result: AgentRunResult<unknown, unknown, unknown>): string | null {
	for (let index = result.steps.length - 1; index >= 0; index -= 1) {
		const model = result.steps[index]?.model;
		if (model) return model;
	}
	return null;
}

export function createSdkAgentRunner(options: { fetchImpl: typeof fetch; baseUrl: string }): AgentRunner {
	return {
		async run(request, hooks) {
			let spentUsd = 0;
			const client = meteredClient(createGatewayAgentClient({
				clientOptions: {
					apiKey: request.gatewayKey,
					baseUrl: options.baseUrl,
					fetchImpl: options.fetchImpl,
					devtools: { enabled: false },
					// No deprecation warnings in Worker logs.
					enableDeprecationWarnings: false,
					headers: { "x-title": APP_TITLE, "x-phaseo-metadata": requestLabelsHeader(request.labels) },
				},
				model: request.model,
				user: request.endUser,
				gatewayTools: GATEWAY_TOOLS,
			}), (usd) => {
				spentUsd += usd;
			});
			const agent = createAgent({
				id: AGENT_ID,
				model: request.model,
				instructions: request.instructions,
				tools: request.tools,
				maxSteps: MAX_STEPS,
				stopWhen: [stepCountIs(MAX_STEPS), maxCost(request.maxCostUsd)],
			});
			const stream = agent.stream({ input: request.prompt, client, signal: request.signal, devtools: { enabled: false } });
			let result: AgentRunResult<unknown, unknown, unknown> | null = null;
			for await (const event of stream.getFullStream()) {
				if (event.type === "response.output_text.delta") await hooks.onText(event.delta);
				else if (event.type === "step.completed") await hooks.onStep({ costUsd: spentUsd });
				else if (event.type === "result") result = event.result;
			}
			result ??= await stream.getResult();
			return {
				costUsd: result.usage?.cost ?? spentUsd,
				model: lastModel(result),
				stopReason: result.run.status === "stopped" ? result.run.stopReason ?? null : null,
			};
		},
	};
}

export type TurnErrorKind = "no_credits" | "cap_reached" | "model_not_allowed" | "model_unavailable" | "failed";

/**
 * Gateway refusals that won't change on a retry, because the agent's model can't
 * be used with its key: no provider meets its guardrail, or a workspace policy
 * blocks the model or its providers. The gateway names them in
 * `error_operational_kind`. Guardrails that block a message's content (prompt
 * injection, sensitive info) aren't among them.
 */
const MODEL_NOT_ALLOWED_CODES = new Set([
	"data_handling_policy_no_routes",
	"provider_restricted_by_policy",
	"model_restricted_by_policy",
	"auto_routing_feature_flag_disabled",
]);

/**
 * A workspace without Auto Routing gets a plain `not_supported` for phaseo/auto,
 * with no more specific reason. The gateway uses the same code for unrelated
 * refusals, so it only means "model not allowed" when the agent asked for Auto.
 */
function isAutoModel(model: string | null | undefined): boolean {
	return typeof model === "string" && model.trim().toLowerCase().startsWith("phaseo/auto");
}

function errorCodes(error: unknown): { status: number | null; codes: string[]; failedProviders: number } {
	// The SDK wraps gateway errors as AgentGatewayError; fromUnknown also reads anything that isn't.
	const asGateway = (value: unknown) => isAgentGatewayError(value) ? value : AgentGatewayError.fromUnknown(value);
	const gateway = asGateway(error) ?? asGateway((error as { cause?: unknown } | null)?.cause);
	if (!gateway) return { status: null, codes: [], failedProviders: 0 };
	const body = (gateway.body && typeof gateway.body === "object" ? gateway.body : {}) as Record<string, unknown>;
	const nested = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
	const codes = [gateway.reason, gateway.errorType, body.code, body.error, body.error_operational_kind, nested.code, nested.type, nested.reason]
		.filter((value): value is string => typeof value === "string")
		.map((value) => value.toLowerCase());
	return { status: gateway.status, codes, failedProviders: gateway.failedProviders.length };
}

/** Which plain reply a failed turn gets. `model` is the model the agent asked for. */
export function classifyTurnError(error: unknown, model?: string | null): TurnErrorKind {
	const { status, codes, failedProviders } = errorCodes(error);
	if (status === null) return "failed";
	if (status === 402 || codes.some((code) => /insufficient_(funds|quota|credits)/.test(code))) return "no_credits";
	if (codes.some((code) => /(_limit_reached|_budget_reached|key_limit_exceeded|spend_limit)/.test(code))) return "cap_reached";
	if (codes.some((code) => MODEL_NOT_ALLOWED_CODES.has(code))) return "model_not_allowed";
	if (isAutoModel(model) && codes.includes("not_supported")) return "model_not_allowed";
	if (status === 404 || codes.some((code) => /(model_not_found|model_unavailable|unsupported_model|no_.*providers?|not_found_error)/.test(code))
		|| (status >= 500 && failedProviders > 0)) return "model_unavailable";
	return "failed";
}

export function turnErrorText(kind: TurnErrorKind): string {
	switch (kind) {
		case "no_credits":
			return "This Phaseo workspace is out of credits, so I can't answer right now. An admin can add credits in Phaseo billing.";
		case "cap_reached":
			return "The Phaseo agent's monthly spending limit on its Phaseo key has been reached. An admin can raise it in Phaseo settings.";
		case "model_not_allowed":
			return "The model chosen for this agent isn't available to the Slack agent. An admin can choose another model in Phaseo settings.";
		case "model_unavailable":
			return "The model this agent uses isn't available right now. Please try again in a few minutes, or an admin can choose another model in Phaseo settings.";
		case "failed":
			return "Sorry, something went wrong while I was answering. Please try again.";
	}
}
