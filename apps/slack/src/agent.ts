import {
	AgentGatewayError,
	createAgent,
	createGatewayAgentClient,
	isAgentGatewayError,
	stepCountIs,
	type AgentModelClient,
	type AgentModelResponse,
	type AgentRunResult,
	type AgentStopCondition,
	type AgentTool,
	type AgentToolOutput,
	type AgentUsageSummary,
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
//
// An answer that has searched Slack goes further: from its first search on,
// every model request it makes (its own steps, the models it asks and the
// images it makes) sends provider.require_zero_data_retention, so only
// providers that keep no data serve it (withZeroDataRetention). When none can,
// the gateway refuses the request, and the turn says why (search_needs_zdr).
//
// Files shared in the thread go to the model as input parts of the run's first
// user message (withAttachments). Images the agent generates are made through
// the gateway's image endpoint with the same key, labels, end user and session
// (generateImage), and their cost counts against the turn's limit with the
// model's (otherCostUsd).

export const AGENT_ID = "phaseo-slack-agent";
export const MAX_STEPS = 12;
/** A turn stops once its model spend reaches this, in US dollars. */
export const TURN_MAX_COST_USD = 0.5;
export const APP_TITLE = "Phaseo Slack agent";
/** Server tools the gateway runs itself. */
export const GATEWAY_TOOLS: Array<{ type: "phaseo:web_search" } | { type: "phaseo:web_fetch" }> = [{ type: "phaseo:web_search" }, { type: "phaseo:web_fetch" }];
const DEFAULT_GATEWAY_BASE_URL = "https://api.phaseo.app/v1";
const IMAGE_TIMEOUT_MS = 120_000;
/** The largest generated image the Worker downloads or decodes. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export type AgentTurnRequest = {
	gatewayKey: string;
	model: string;
	instructions: string;
	prompt: string;
	/** slack:<team>:<user>, the gateway's end user. */
	endUser: string;
	/** The answer's gateway session (turnSessionId), shared by all its model requests so Logs can filter to them. */
	sessionId: string;
	labels: { slackTeam: string; slackChannel: string };
	tools: AgentTool<any, any>[];
	/** What this run may spend, in US dollars: the turn's limit less what earlier attempts spent. */
	maxCostUsd: number;
	/** What the run's tools spent on their own gateway requests (other models it asked, images it made), counted against maxCostUsd and in its cost. */
	otherCostUsd?: () => number;
	signal: AbortSignal;
	/** Continues a run that paused for the person's answer (ask_question), with its paused tool call's output. */
	resume?: { run: PausedRun; toolOutputs: AgentToolOutput[] };
	/** Files shared in the thread, as Responses input parts (input_image, input_file), sent after the prompt's text. */
	attachments?: Array<Record<string, unknown>>;
	/** Whether a request must go only to providers that keep no data: asked before each model request (withZeroDataRetention). */
	zeroDataRetention?: () => Promise<boolean>;
};

/**
 * A run paused for the person's answer, as pausedRun keeps it: the conversation
 * so far (Slack text, so it is kept with the thread's coordinator only), the
 * paused tool call and the step count. What earlier steps cost isn't in it: that
 * is counted by the turn, so the limit given to the continued run isn't spent twice.
 */
export type PausedRun = AgentRunResult<unknown, unknown, unknown>;

export type AgentTurnHooks = {
	onText(delta: string): Promise<void>;
	/** After each agent step, with what the run has spent so far; the turn stages its reply and cost and checks its cancel flag here. */
	onStep(progress: { costUsd: number }): Promise<void>;
	/** After each of the run's own model responses, with what they have cost so far (without otherCostUsd). */
	onCost?(modelCostUsd: number): void;
};

/** One non-streaming gateway request: a model asked mid-answer (ask_model), or one model of a Compare. */
export type AskRequest = Pick<AgentTurnRequest, "gatewayKey" | "model" | "endUser" | "sessionId" | "labels" | "signal" | "zeroDataRetention"> & {
	instructions: string;
	prompt: string;
	/** Lets the gateway search the web and read pages for this request. */
	webTools: boolean;
	maxOutputTokens: number;
};

export type AskOutput = { text: string; costUsd: number };

export type AgentTurnOutput = {
	costUsd: number;
	/** The model that answered last (the auto router resolves phaseo/auto to one). */
	model: string | null;
	/** Set when a limit stopped the run before the model finished, e.g. step_count:12 or max_cost:0.5. */
	stopReason: string | null;
	/** Set when the run paused for the person's answer: what continues it. */
	paused?: PausedRun;
};

const NO_USAGE: AgentUsageSummary = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0, cost: 0 };

/**
 * What a paused run needs to continue, and no more: its record (the messages,
 * the pending tool call, the step count) and one entry per step, so the step
 * limit spans the continued run. Steps keep their model (the footer's) but not
 * their usage, items or tool results, which hold web pages and provider data.
 */
export function pausedRun(result: AgentRunResult<unknown, unknown, unknown>): PausedRun {
	return {
		run: { ...result.run, input: null, usage: { ...NO_USAGE } },
		steps: result.steps.map((step) => ({ runId: step.runId, index: step.index, status: step.status, model: step.model, createdAt: step.createdAt, updatedAt: step.updatedAt })),
		stepResults: (result.stepResults ?? []).map((step) => ({ stepIndex: step.stepIndex, text: "", toolCalls: [], toolResults: [], usage: { ...NO_USAGE } })),
		usage: { ...NO_USAGE },
		output: undefined,
		messages: [],
		items: [],
	};
}

export type ImageSize = "1024x1024" | "1536x1024" | "1024x1536";

export type ImageRequest = {
	gatewayKey: string;
	model: string;
	prompt: string;
	size: ImageSize;
	endUser: string;
	sessionId: string;
	labels: AgentTurnRequest["labels"];
	signal: AbortSignal;
	zeroDataRetention?: AgentTurnRequest["zeroDataRetention"];
};

export type GeneratedImage = { bytes: Uint8Array; mimeType: string; costUsd: number; model: string | null };

/** The gateway made (and billed) an image, but its bytes couldn't be downloaded or aren't an image: the cost still counts. */
export class ImageNotReadError extends Error {
	constructor(readonly costUsd: number) {
		super("image_response_invalid");
		this.name = "ImageNotReadError";
	}
}

export interface AgentRunner {
	run(request: AgentTurnRequest, hooks: AgentTurnHooks): Promise<AgentTurnOutput>;
	/** Throws the gateway's error, like run. */
	ask(request: AskRequest): Promise<AskOutput>;
	/** Makes one image through the gateway. Throws the gateway's error (classifyTurnError reads it). */
	generateImage?(request: ImageRequest): Promise<GeneratedImage>;
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

/**
 * The run's fetch, with the shared files added to the first user message of
 * each Responses request: the SDK's messages are text only. Every step's
 * request carries them, since the model reads the whole conversation each time.
 */
export function withAttachments(fetchImpl: typeof fetch, parts: Array<Record<string, unknown>>): typeof fetch {
	if (!parts.length) return fetchImpl;
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/responses")) return fetchImpl(request);
		const body = await request.clone().json().catch(() => null) as { input?: unknown } | null;
		const items = Array.isArray(body?.input) ? body.input as Array<Record<string, unknown>> : null;
		const first = items ? items.findIndex((item) => item?.role === "user" && typeof item.content === "string") : -1;
		if (!items || first < 0) return fetchImpl(request);
		items[first] = { ...items[first], content: [{ type: "input_text", text: items[first].content }, ...parts] };
		return fetchImpl(new Request(request, { body: JSON.stringify(body) }));
	}) as typeof fetch;
}

/** The gateway requests that go to a model: Responses (the agent's steps, the models it asks) and image generation. */
const MODEL_REQUEST_PATH = /\/(responses|images\/generations)$/;

/**
 * The fetch, adding provider.require_zero_data_retention (with any provider
 * fields the request already has) to each model request sent while `required`
 * says so. It is asked before every request, not once per run, so the request
 * that first carries a Slack search's results has it, and so does every one
 * after. A model request it can't read isn't sent without it.
 */
export function withZeroDataRetention(fetchImpl: typeof fetch, required: (() => Promise<boolean>) | undefined): typeof fetch {
	if (!required) return fetchImpl;
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		if (request.method !== "POST" || !MODEL_REQUEST_PATH.test(new URL(request.url).pathname) || !(await required())) return fetchImpl(request);
		const body = await request.clone().json().catch(() => null) as Record<string, unknown> | null;
		if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("zero_data_retention_not_applied");
		const provider = body.provider && typeof body.provider === "object" && !Array.isArray(body.provider) ? body.provider : {};
		return fetchImpl(new Request(request, { body: JSON.stringify({ ...body, provider: { ...provider, require_zero_data_retention: true } }) }));
	}) as typeof fetch;
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

/** Decodes base64, refusing more than MAX_IMAGE_BYTES. */
function decodeBase64(value: string): Uint8Array | null {
	if (value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) return null;
	try {
		const binary = atob(value);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
		return bytes;
	} catch {
		return null;
	}
}

/** The image types a generated image may be, from its first bytes. */
function imageType(bytes: Uint8Array): string | null {
	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
	if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
	return null;
}

/** A number, or a numeric string; null, blanks and anything else are no amount. */
function amount(value: unknown): number | null {
	const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
	return Number.isFinite(number) && number >= 0 ? number : null;
}

/** An image response's cost: the gateway's cost_nanos, or its usage pricing. */
function imageCost(body: Record<string, any>): number {
	const nanos = [body.cost_nanos, body.usage?.pricing?.total_nanos].map(amount).find((value) => value !== null);
	if (nanos != null) return nanos / 1_000_000_000;
	return amount(body.usage?.cost) ?? 0;
}

/**
 * One image through the gateway's /images/generations, with the turn's key,
 * labels, end user and session. The image comes back as base64, or as a URL
 * (HTTPS only) that is downloaded here.
 */
async function requestImage(fetchImpl: typeof fetch, baseUrl: string, request: ImageRequest): Promise<GeneratedImage> {
	const signal = AbortSignal.any([request.signal, AbortSignal.timeout(IMAGE_TIMEOUT_MS)]);
	const response = await fetchImpl(`${baseUrl}/images/generations`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${request.gatewayKey}`,
			"Content-Type": "application/json",
			"x-title": APP_TITLE,
			"x-phaseo-metadata": requestLabelsHeader(request.labels),
			"x-phaseo-session-id": request.sessionId,
		},
		body: JSON.stringify({ model: request.model, prompt: request.prompt, n: 1, size: request.size, quality: "medium", user: request.endUser }),
		signal,
	});
	const body = await response.json().catch(() => null) as Record<string, any> | null;
	if (!response.ok || !body) {
		const message = typeof body?.message === "string" ? body.message : typeof body?.error?.message === "string" ? body.error.message : "The image request failed";
		throw new AgentGatewayError({ status: response.status || 502, statusText: response.statusText || "Bad Gateway", body: body ?? {}, message });
	}
	// Billed from here on: a failed download or a bad image still costs.
	const costUsd = imageCost(body);
	const first = Array.isArray(body.data) ? body.data[0] as Record<string, unknown> | undefined : undefined;
	let bytes: Uint8Array | null = null;
	try {
		if (typeof first?.b64_json === "string") {
			bytes = decodeBase64(first.b64_json);
		} else if (typeof first?.url === "string" && first.url.startsWith("https://")) {
			const download = await fetchImpl(first.url, { signal });
			const length = Number(download.headers.get("content-length"));
			if (download.ok && !(Number.isFinite(length) && length > MAX_IMAGE_BYTES)) {
				const buffer = new Uint8Array(await download.arrayBuffer());
				bytes = buffer.byteLength <= MAX_IMAGE_BYTES ? buffer : null;
			}
		}
	} catch {
		bytes = null;
	}
	const mimeType = bytes ? imageType(bytes) : null;
	if (!bytes || !mimeType) throw new ImageNotReadError(costUsd);
	return { bytes, mimeType, costUsd, model: typeof body.model === "string" ? body.model : null };
}

/**
 * The gateway client for one answer's requests: the installation's key, its
 * Slack labels, app title, end user and session (the Responses API takes the
 * session from the body only).
 */
function gatewayClient(options: { fetchImpl: typeof fetch; baseUrl: string }, request: Pick<AgentTurnRequest, "gatewayKey" | "model" | "endUser" | "sessionId" | "labels">, webTools: boolean): AgentModelClient {
	return createGatewayAgentClient({
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
		...(webTools ? { gatewayTools: GATEWAY_TOOLS } : {}),
		requestOptions: { session_id: request.sessionId },
	});
}

/** Stops the run once its own spend and its tools' together reach the limit, the way the SDK's maxCost stops it on its own. */
function maxTurnCost(limit: number, otherCostUsd: () => number): AgentStopCondition {
	return ({ usage }) => usage.cost + otherCostUsd() >= Math.max(0, limit) ? `max_cost:${limit}` : false;
}

export function createSdkAgentRunner(options: { fetchImpl: typeof fetch; baseUrl: string }): AgentRunner {
	return {
		generateImage: (request) => requestImage(withZeroDataRetention(options.fetchImpl, request.zeroDataRetention), options.baseUrl, request),
		async run(request, hooks) {
			let spentUsd = 0;
			const otherCostUsd = () => request.otherCostUsd?.() ?? 0;
			const fetchImpl = withZeroDataRetention(withAttachments(options.fetchImpl, request.attachments ?? []), request.zeroDataRetention);
			const client = meteredClient(gatewayClient({ ...options, fetchImpl }, request, true), (usd) => {
				spentUsd += usd;
				hooks.onCost?.(spentUsd);
			});
			const agent = createAgent({
				id: AGENT_ID,
				model: request.model,
				instructions: request.instructions,
				tools: request.tools,
				maxSteps: MAX_STEPS,
				stopWhen: [stepCountIs(MAX_STEPS), maxTurnCost(request.maxCostUsd, otherCostUsd)],
			});
			// A continued run starts from its paused record, whose steps carry no cost: its usage is this run's alone.
			const stream = request.resume
				? agent.continueStream({ run: request.resume.run as AgentRunResult<string, unknown, unknown>, toolOutputs: request.resume.toolOutputs, client, signal: request.signal, devtools: { enabled: false } })
				: agent.stream({ input: request.prompt, client, signal: request.signal, devtools: { enabled: false } });
			let result: AgentRunResult<unknown, unknown, unknown> | null = null;
			for await (const event of stream.getFullStream()) {
				if (event.type === "response.output_text.delta") await hooks.onText(event.delta);
				else if (event.type === "step.completed") await hooks.onStep({ costUsd: spentUsd + otherCostUsd() });
				else if (event.type === "result") result = event.result;
			}
			result ??= await stream.getResult();
			return {
				costUsd: (result.usage?.cost ?? spentUsd) + otherCostUsd(),
				model: lastModel(result),
				stopReason: result.run.status === "stopped" ? result.run.stopReason ?? null : null,
				...(result.run.status === "waiting_for_human" ? { paused: pausedRun(result) } : {}),
			};
		},
		async ask(request) {
			const response = await gatewayClient({ ...options, fetchImpl: withZeroDataRetention(options.fetchImpl, request.zeroDataRetention) }, request, request.webTools).generate({
				agentId: AGENT_ID,
				model: request.model,
				instructions: request.instructions,
				messages: [{ role: "user", content: request.prompt }],
				tools: [],
				context: undefined,
				signal: request.signal,
				maxOutputTokens: request.maxOutputTokens,
			});
			return { text: response.message.content.trim(), costUsd: responseCost(response) };
		},
	};
}

/**
 * access_changed: after a question, the person (or the installation) could no longer use the agent.
 * files_unsupported: no route of the model takes the files sent with the request.
 * search_needs_zdr: after a Slack search, no provider that keeps no data could serve the model.
 */
export type TurnErrorKind = "no_credits" | "cap_reached" | "model_not_allowed" | "model_unavailable" | "files_unsupported" | "search_needs_zdr" | "access_changed" | "failed";

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
export function isAutoModel(model: string | null | undefined): boolean {
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

/**
 * Which plain reply a failed turn gets. `model` is the model the agent asked for.
 * `zeroDataRetention`: the request asked for providers that keep no data (the
 * answer had searched Slack). The agent asks for no region, so the gateway's
 * model_region_unavailable then means no route of the model keeps no data.
 */
export function classifyTurnError(error: unknown, model?: string | null, zeroDataRetention = false): TurnErrorKind {
	const { status, codes, failedProviders } = errorCodes(error);
	if (status === null) return "failed";
	if (status === 402 || codes.some((code) => /insufficient_(funds|quota|credits)/.test(code))) return "no_credits";
	if (codes.some((code) => /(_limit_reached|_budget_reached|key_limit_exceeded|spend_limit)/.test(code))) return "cap_reached";
	if (zeroDataRetention && codes.includes("model_region_unavailable")) return "search_needs_zdr";
	if (codes.some((code) => MODEL_NOT_ALLOWED_CODES.has(code))) return "model_not_allowed";
	if (codes.includes("unsupported_modalities")) return "files_unsupported";
	if (isAutoModel(model) && codes.includes("not_supported")) return "model_not_allowed";
	if (status === 404 || codes.some((code) => /(model_not_found|model_unavailable|unsupported_model|no_.*providers?|not_found_error)/.test(code))
		|| (status >= 500 && failedProviders > 0)) return "model_unavailable";
	return "failed";
}

/** `chosenForMessage`: the person chose the model with `with <model>:`, so the reply talks about that model. */
export function turnErrorText(kind: TurnErrorKind, chosenForMessage = false): string {
	switch (kind) {
		case "no_credits":
			return "This Phaseo workspace is out of credits, so I can't answer right now. An admin can add credits in Phaseo billing.";
		case "cap_reached":
			return "The Phaseo agent's monthly spending limit on its Phaseo key has been reached. An admin can raise it in Phaseo settings.";
		case "model_not_allowed":
			return chosenForMessage
				? "The model you chose for this message isn't available to the Slack agent. Ask again without `with …:` to use the agent's model, or an admin can change the models you can choose in Phaseo settings."
				: "The model chosen for this agent isn't available to the Slack agent. An admin can choose another model in Phaseo settings.";
		case "model_unavailable":
			return chosenForMessage
				? "The model you chose for this message isn't available right now. Please try again in a few minutes, or ask without `with …:` to use the agent's model."
				: "The model this agent uses isn't available right now. Please try again in a few minutes, or an admin can choose another model in Phaseo settings.";
		case "files_unsupported":
			return chosenForMessage
				? "The model you chose for this message can't read the files shared here. Ask again without `with …:` to use the agent's model, or without the files."
				: "The model this agent uses can't read the files shared here. Ask again without them, or an admin can choose a model that reads images and PDFs in Phaseo settings.";
		case "search_needs_zdr":
			return chosenForMessage
				? "I stopped here: after a Slack search, I can only use AI providers that keep no data (zero data retention), and none could answer with the model you chose for this message. Ask again with a model that keeps no data, or without `with …:` to use the agent's model."
				: "I stopped here: after a Slack search, I can only use AI providers that keep no data (zero data retention), and none could answer with this agent's model. An admin can choose a model that keeps no data in Phaseo settings.";
		case "access_changed":
			return "I stopped here: what you can use the Phaseo agent for changed while I waited for your answer. Ask me again if you still need this.";
		case "failed":
			return "Sorry, something went wrong while I was answering. Please try again.";
	}
}
