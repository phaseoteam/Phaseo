// Sends realistic gateway events through the Broadcast queue consumer to real
// destinations, then reads back what each one stored. Only Supabase and the
// queue are faked: payload rendering, batching, signing and the HTTP requests
// are the production code.
//
// scripts/broadcast-live-local.sh runs it against local servers; see
// tests/integration/README.md. Skipped unless BROADCAST_LIVE_CONFIG names a JSON
// file (keep it outside the repo; it holds credentials):
//
//   {
//     "allowLocal": true,              // let destinations use 127.0.0.1 / localhost
//     "tls": { "cert": "…", "key": "…" }, // for the HTTPS fault server (optional)
//     "destinations": [
//       { "name": "collector", "type": "otel_collector", "config": { "endpoint": "http://127.0.0.1:4318" }, "otlpFile": "…/traces.jsonl" },
//       { "name": "hook", "type": "webhook", "config": { "signing_secret": "…" }, "localWebhook": true },
//       { "name": "s3", "type": "s3", "config": { "bucket": "…", "region": "…", "access_key_id": "…", "secret_access_key": "…" } },
//       { "name": "langfuse", "type": "langfuse", "config": { … } }          // no readback: check the vendor UI
//     ]
//   }
//
// Each destination gets two variants, one with every option on and one with
// privacy mode on and the cost and identity groups off. Object storage paths and
// warehouse rows are tagged with a run ID; rows written are deleted afterwards
// where the store allows it.
import fs from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BroadcastQueueMessage, BroadcastTelemetry } from "@/observability/broadcast-event";
import type { GatewayGenAiTelemetry } from "@/observability/otel-genai";

type DestinationSpec = {
	name: string;
	type: string;
	config: Record<string, unknown>;
	otlpFile?: string;
	localWebhook?: boolean;
	cleanup?: boolean;
};
type LiveConfig = { allowLocal?: boolean; tls?: { cert: string; key: string }; destinations: DestinationSpec[] };

const CONFIG_PATH = process.env.BROADCAST_LIVE_CONFIG;
const live: LiveConfig | null = CONFIG_PATH ? JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) : null;

const state = vi.hoisted(() => ({
	allowLocal: false,
	// localtest.me resolves to 127.0.0.1. The OTLP sender refuses "localhost"
	// and loopback literals by name, so the local collector is reached through it.
	localHosts: ["127.0.0.1", "localhost", "localtest.me"],
	destinations: [] as Array<Record<string, unknown>>,
	receipts: new Set<string>(),
	health: [] as Array<Record<string, unknown>>,
	requeued: [] as Array<{ body: BroadcastQueueMessage; delaySeconds?: number }>,
}));

vi.mock("@core/webhook-endpoints", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@core/webhook-endpoints")>();
	return {
		...actual,
		validateWebhookEndpointUrlForDelivery: vi.fn(async (value: unknown, options?: Parameters<typeof actual.validateWebhookEndpointUrlForDelivery>[1]) => {
			const url = new URL(String(value));
			if (state.allowLocal && state.localHosts.includes(url.hostname)) return { ok: true as const, url: url.toString() };
			return actual.validateWebhookEndpointUrlForDelivery(value, options);
		}),
	};
});

vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindings: () => ({
		BROADCAST_QUEUE: {
			sendBatch: async (messages: Array<{ body: BroadcastQueueMessage; delaySeconds?: number }>) => {
				state.requeued.push(...messages);
			},
		},
	}),
	getSupabaseAdmin: () => ({
		rpc: async (name: string, args: { p_results: Array<Record<string, unknown>> }) => {
			if (name === "record_broadcast_destination_health") state.health.push(...args.p_results);
			return { data: args.p_results.length, error: null };
		},
		from: (table: string) => table === "broadcast_event_receipts" ? {
			upsert: (rows: Array<{ event_id: string }>) => ({
				select: async () => {
					const inserted = rows.filter((row) => !state.receipts.has(row.event_id));
					for (const row of inserted) state.receipts.add(row.event_id);
					return { data: inserted, error: null };
				},
			}),
		} : {
			select: () => ({
				in: async (_column: string, ids: string[]) => ({ data: state.destinations.filter((row) => ids.includes(String(row.id))), error: null }),
			}),
		},
	}),
}));

const { processBroadcastQueueBatch } = await import("@/observability/broadcast-queue");
const { metadataTraceContext, requestMetadata } = await import("@/observability/trace-context");
const { broadcastRows, broadcastRowsEndpoint, isBroadcastRowsDestination, MAX_BROADCAST_ROW_BYTES, signAwsRequest, signRs256Jwt } = await import("@/observability/broadcast-rows");

const ROW_COLUMNS = ["event_id", "trace_id", "span_id", "parent_span_id", "name", "kind", "start_time", "end_time", "duration_ms", "status_code", "status_message", "service_name", "attributes", "resource_attributes"];
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const hex = (bytes: number) => randomBytes(bytes).toString("hex");

type Variant = "full" | "private";
type Row = Record<string, unknown> & { event_id: string; trace_id: string; span_id: string; parent_span_id: string | null; name: string; status_code: string; attributes: Record<string, unknown> };
type Run = {
	runId: string;
	// Unique to this destination and variant, sent as metadata.run_id.
	tag: string;
	variant: Variant;
	traceId: string;
	parentSpanId: string;
	traceName: string;
	marker: string;
	eventIds: { chat: string; tools: string; large: string; failed: string };
	events: Array<{ eventId: string; telemetry: BroadcastTelemetry }>;
};

// Four requests a workspace might send: a chat completion carrying trace
// metadata, a streamed tool call in the same trace, one with a prompt too large
// for a row, and one the provider rate-limited.
function buildRun(runId: string, variant: Variant, scope: string): Run {
	const traceId = hex(16);
	const parentSpanId = hex(8);
	const tag = `${runId}-${scope}-${variant}`;
	const traceName = `smoke ${tag}`;
	const marker = `phaseo-smoke-${tag}-content`;
	const metadata = requestMetadata({ trace_id: traceId, parent_span_id: parentSpanId, trace_name: traceName, generation_name: "answer", customer_tier: "gold", run_id: tag });
	const now = Date.now();
	const base = (requestId: string, offsetMs: number): GatewayGenAiTelemetry => ({
		requestId,
		workspaceId: "smoke-workspace",
		keyId: "smoke-key",
		keyName: "Smoke test key",
		userId: "smoke-user",
		appName: "Broadcast smoke test",
		endpoint: "chat.completions",
		requestedModel: "openai/gpt-5-nano",
		provider: "openai",
		providerModel: "gpt-5-nano",
		responseModel: "gpt-5-nano-2026-08-07",
		responseId: `chatcmpl-${requestId}`,
		statusCode: 200,
		success: true,
		finishReason: "stop",
		usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
		totalNanos: 4_200,
		currency: "USD",
		generationMs: 640,
		timeToFirstChunkMs: 210,
		startedAtMs: now - 1_000 + offsetMs,
		completedAtMs: now - 300 + offsetMs,
		metadata,
		traceContext: metadataTraceContext(metadata),
		labels: [{ key: "team", value: "smoke" }],
		requestMethod: "POST",
		requestPath: "/v1/chat/completions",
		serverAddress: "api.phaseo.app",
		serverPort: 443,
		edgeColo: "LHR",
		providerAttempts: [{
			attempt_number: 1,
			started_at_unix_ms: now - 900 + offsetMs,
			provider: "openai",
			endpoint: "chat.completions",
			model: "openai/gpt-5-nano",
			provider_model_slug: "gpt-5-nano",
			outcome: "success",
			duration_ms: 600,
			status: 200,
		}],
	});
	const id = (name: string) => `${runId}-${scope}-${variant}-${name}`;
	const chat: GatewayGenAiTelemetry = {
		...base(id("chat"), 0),
		requestPayload: { model: "openai/gpt-5-nano", messages: [{ role: "system", content: "Be brief." }, { role: "user", content: `Say hello. ${marker}` }], temperature: 0.2, metadata },
		responsePayload: { choices: [{ index: 0, message: { role: "assistant", content: `Hello! ${marker}` }, finish_reason: "stop" }] },
	};
	const tools: GatewayGenAiTelemetry = {
		...base(id("tools"), 50),
		stream: true,
		finishReason: "tool_calls",
		requestPayload: {
			model: "openai/gpt-5-nano",
			stream: true,
			messages: [{ role: "user", content: `What's the weather in Paris? ${marker}` }],
			tools: [{ type: "function", function: { name: "get_weather", description: "Get the weather", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } }],
			metadata,
		},
		responsePayload: { choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: "{\"city\":\"Paris\"}" } }] }, finish_reason: "tool_calls" }] },
	};
	const large: GatewayGenAiTelemetry = {
		...base(id("large"), 100),
		// No trace metadata: this request starts its own trace.
		metadata: requestMetadata({ customer_tier: "gold", run_id: tag }),
		traceContext: null,
		// Each attribute is capped at 64,000 characters, so a row passes 512 KB
		// only when several long attributes hold multi-byte text.
		requestPayload: {
			model: "openai/gpt-5-nano",
			messages: [{ role: "user", content: `${marker} ${"漢".repeat(70_000)}` }],
			tools: [{ type: "function", function: { name: "lookup", description: "字".repeat(70_000), parameters: { type: "object" } } }],
		},
		responsePayload: { choices: [{ index: 0, message: { role: "assistant", content: "語".repeat(70_000) }, finish_reason: "stop" }] },
	};
	const failed: GatewayGenAiTelemetry = {
		...base(id("failed"), 150),
		statusCode: 429,
		success: false,
		errorType: "rate_limited",
		finishReason: null,
		usage: null,
		totalNanos: 0,
		requestPayload: { model: "openai/gpt-5-nano", messages: [{ role: "user", content: `Hi ${marker}` }], metadata },
		responsePayload: null,
		providerAttempts: [{
			attempt_number: 1,
			started_at_unix_ms: now - 850,
			provider: "openai",
			endpoint: "chat.completions",
			model: "openai/gpt-5-nano",
			outcome: "rate_limited",
			duration_ms: 120,
			status: 429,
			status_text: "Too Many Requests",
		}],
	};
	const events = [chat, tools, large, failed].map((args) => ({ eventId: `gateway:${args.requestId}`, telemetry: { kind: "gateway", args } as BroadcastTelemetry }));
	return {
		runId,
		tag,
		variant,
		traceId,
		parentSpanId,
		traceName,
		marker,
		eventIds: { chat: events[0].eventId, tools: events[1].eventId, large: events[2].eventId, failed: events[3].eventId },
		events,
	};
}

function destinationRow(spec: DestinationSpec, variant: Variant, runId: string, config: Record<string, unknown>) {
	const objectStore = ["s3", "r2", "gcs"].includes(spec.type);
	return {
		id: `${spec.name}-${variant}`,
		destination_id: spec.type,
		destination_config: objectStore ? { ...config, path_template: `phaseo-smoke/${runId}/${variant}/{uuid}` } : config,
		enabled: true,
		...(variant === "private" ? { privacy_exclude_prompts_and_outputs: true, include_cost_metadata: false, include_identity_metadata: false } : {}),
	};
}

function message(body: BroadcastQueueMessage, attempts = 1) {
	return { id: `${body.eventId}#${body.attempt}`, timestamp: new Date(), attempts, body, ack: vi.fn(), retry: vi.fn() };
}

async function deliver(run: Run, destinationId: string, attempt = 1) {
	const messages = run.events.map((event) => message({ v: 1, eventId: event.eventId, workspaceId: "smoke-workspace", destinationIds: [destinationId], attempt, telemetry: event.telemetry } as BroadcastQueueMessage, attempt));
	const summary = await processBroadcastQueueBatch({ queue: "phaseo-broadcast", messages } as unknown as MessageBatch<unknown>);
	return { summary, messages };
}

// ---- Readback -------------------------------------------------------------

function parseJson(value: unknown): unknown {
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function normaliseRow(raw: Record<string, unknown>): Row {
	const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key.toLowerCase(), value]));
	row.attributes = parseJson(row.attributes) ?? {};
	row.resource_attributes = parseJson(row.resource_attributes) ?? {};
	return row as Row;
}

async function waitFor<T>(read: () => Promise<T[]>, enough: (rows: T[]) => boolean, timeoutMs = 30_000): Promise<T[]> {
	const deadline = Date.now() + timeoutMs;
	let rows = await read();
	while (!enough(rows) && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 1_500));
		rows = await read();
	}
	return rows;
}

async function s3Request(spec: DestinationSpec, config: Record<string, unknown>, method: "GET" | "DELETE", url: URL): Promise<Response> {
	const region = spec.type === "s3" ? String(config.region || "us-east-1") : "auto";
	const signed = await signAwsRequest({
		method,
		url,
		headers: {},
		payloadHash: EMPTY_SHA256,
		region,
		service: "s3",
		accessKeyId: String(config.access_key_id),
		secretAccessKey: String(config.secret_access_key),
		sessionToken: config.session_token ? String(config.session_token) : undefined,
		now: new Date(),
	});
	delete signed.host;
	return fetch(url, { method, headers: signed });
}

async function objectKeys(spec: DestinationSpec, config: Record<string, unknown>, prefix: string): Promise<string[]> {
	const url = new URL(broadcastRowsEndpoint(spec.type, config));
	url.searchParams.set("list-type", "2");
	url.searchParams.set("prefix", prefix);
	const response = await s3Request(spec, config, "GET", url);
	const text = await response.text();
	if (!response.ok) throw new Error(`Listing ${spec.name} failed: ${response.status} ${text.slice(0, 300)}`);
	return [...text.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1].replace(/&amp;/g, "&"));
}

function objectUrl(spec: DestinationSpec, config: Record<string, unknown>, key: string): URL {
	return new URL(key.split("/").map((part) => encodeURIComponent(part)).join("/"), broadcastRowsEndpoint(spec.type, config));
}

async function readObjectRows(spec: DestinationSpec, config: Record<string, unknown>, prefix: string): Promise<{ rows: Row[]; keys: string[]; headers: Array<Record<string, string>> }> {
	const keys = await objectKeys(spec, config, prefix);
	const rows: Row[] = [];
	const headers: Array<Record<string, string>> = [];
	for (const key of keys) {
		const response = await s3Request(spec, config, "GET", objectUrl(spec, config, key));
		if (!response.ok) throw new Error(`Reading ${key} failed: ${response.status}`);
		headers.push({ "content-type": response.headers.get("content-type") ?? "", "content-encoding": response.headers.get("content-encoding") ?? "" });
		const bytes = Buffer.from(await response.arrayBuffer());
		// Stored compressed with no Content-Encoding, so fetch does not unzip it.
		const text = gunzipSync(bytes).toString("utf8");
		for (const line of text.split("\n")) if (line.trim()) rows.push(normaliseRow(JSON.parse(line)));
	}
	return { rows, keys, headers };
}

function clickHouseQuery(config: Record<string, unknown>, query: string) {
	const url = new URL(`${String(config.endpoint).replace(/\/+$/, "")}/`);
	url.searchParams.set("query", query);
	return fetch(url, { method: "POST", headers: { "x-clickhouse-user": String(config.username || "default"), "x-clickhouse-key": String(config.password) } });
}

const sqlList = (ids: string[]) => ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
const chTable = (config: Record<string, unknown>) => `\`${String(config.database || "default")}\`.\`${String(config.table)}\``;

async function readClickHouse(config: Record<string, unknown>, eventIds: string[]): Promise<Row[]> {
	const response = await clickHouseQuery(config, `SELECT * FROM ${chTable(config)} WHERE event_id IN (${sqlList(eventIds)}) FORMAT JSONEachRow`);
	const text = await response.text();
	if (!response.ok) throw new Error(`ClickHouse query failed: ${response.status} ${text.slice(0, 300)}`);
	return text.split("\n").filter((line) => line.trim()).map((line) => normaliseRow(JSON.parse(line)));
}

async function googleToken(config: Record<string, unknown>): Promise<{ token: string; project: string }> {
	const account = JSON.parse(String(config.service_account_json)) as { client_email: string; private_key: string; project_id?: string };
	const der = Buffer.from(account.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, ""), "base64");
	const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
	const now = Math.floor(Date.now() / 1000);
	const assertion = await signRs256Jwt({ iss: account.client_email, aud: "https://oauth2.googleapis.com/token", scope: "https://www.googleapis.com/auth/bigquery", iat: now, exp: now + 3600 }, key);
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
	});
	const json = await response.json() as { access_token?: string; error_description?: string };
	if (!json.access_token) throw new Error(`Google sign-in for readback failed: ${json.error_description ?? response.status}`);
	return { token: json.access_token, project: String(config.project_id || account.project_id) };
}

async function bigQuery(config: Record<string, unknown>, query: string, eventIds: string[]) {
	const { token, project } = await googleToken(config);
	const response = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/queries`, {
		method: "POST",
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
		body: JSON.stringify({
			query,
			useLegacySql: false,
			parameterMode: "NAMED",
			queryParameters: [{ name: "ids", parameterType: { type: "ARRAY", arrayType: { type: "STRING" } }, parameterValue: { arrayValues: eventIds.map((value) => ({ value })) } }],
		}),
	});
	const json = await response.json() as { schema?: { fields: Array<{ name: string }> }; rows?: Array<{ f: Array<{ v: unknown }> }>; error?: { message: string } };
	if (!response.ok) throw new Error(`BigQuery query failed: ${json.error?.message ?? response.status}`);
	const fields = json.schema?.fields.map((field) => field.name) ?? [];
	return (json.rows ?? []).map((row) => Object.fromEntries(row.f.map((cell, index) => [fields[index], cell.v])));
}

const bqTable = (config: Record<string, unknown>) => `\`${String(config.dataset)}.${String(config.table)}\``;

async function readBigQuery(config: Record<string, unknown>, eventIds: string[]): Promise<Row[]> {
	return (await bigQuery(config, `SELECT * FROM ${bqTable(config)} WHERE event_id IN UNNEST(@ids)`, eventIds)).map(normaliseRow);
}

async function snowflakeStatement(config: Record<string, unknown>, statement: string, bindings: string[]) {
	const account = String(config.account).replace(/\.snowflakecomputing\.com$/i, "");
	const privateKey = await crypto.subtle.importKey("pkcs8", Buffer.from(String(config.private_key).replace(/\\n/g, "\n").replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, ""), "base64"), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, true, ["sign"]);
	const jwk = await crypto.subtle.exportKey("jwk", privateKey);
	const publicKey = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, true, ["verify"]);
	const fingerprint = Buffer.from(await crypto.subtle.digest("SHA-256", await crypto.subtle.exportKey("spki", publicKey))).toString("base64");
	const name = account.split(".")[0].toUpperCase();
	const user = String(config.user).toUpperCase();
	const now = Math.floor(Date.now() / 1000);
	const token = await signRs256Jwt({ iss: `${name}.${user}.SHA256:${fingerprint}`, sub: `${name}.${user}`, iat: now, exp: now + 600 }, privateKey);
	const response = await fetch(`https://${account.toLowerCase().replace(/_/g, "-")}.snowflakecomputing.com/api/v2/statements`, {
		method: "POST",
		headers: { authorization: `Bearer ${token}`, "x-snowflake-authorization-token-type": "KEYPAIR_JWT", "content-type": "application/json", accept: "application/json" },
		body: JSON.stringify({
			statement,
			timeout: 60,
			warehouse: config.warehouse,
			database: config.database,
			schema: config.schema,
			...(config.role ? { role: config.role } : {}),
			bindings: Object.fromEntries(bindings.map((value, index) => [String(index + 1), { type: "TEXT", value }])),
		}),
	});
	const json = await response.json() as { data?: unknown[][]; resultSetMetaData?: { rowType: Array<{ name: string }> }; message?: string };
	if (response.status !== 200) throw new Error(`Snowflake statement failed: ${response.status} ${json.message ?? ""}`);
	const names = json.resultSetMetaData?.rowType.map((column) => column.name) ?? [];
	return (json.data ?? []).map((row) => Object.fromEntries(row.map((value, index) => [names[index], value])));
}

const sfTable = (config: Record<string, unknown>) => `${String(config.database)}.${String(config.schema)}.${String(config.table)}`;
const placeholders = (count: number) => Array.from({ length: count }, () => "?").join(", ");

async function readSnowflake(config: Record<string, unknown>, eventIds: string[]): Promise<Row[]> {
	return (await snowflakeStatement(config, `SELECT * FROM ${sfTable(config)} WHERE EVENT_ID IN (${placeholders(eventIds.length)})`, eventIds)).map(normaliseRow);
}

// OTLP spans as rows, so the same checks apply. The event ID is not in the
// trace, so it's looked up from the request ID attribute when present.
function otlpRows(payloads: unknown[], run: Run): Row[] {
	const rows: Row[] = [];
	for (const payload of payloads) {
		for (const row of broadcastRows(payload, "")) {
			const requestId = row.attributes["phaseo.request.id"];
			const event = run.events.find((candidate) => candidate.eventId === `gateway:${requestId}`);
			rows.push(normaliseRow({ ...row, event_id: event?.eventId ?? "" }) );
		}
	}
	return rows.filter((row) => row.trace_id === run.traceId || row.attributes["phaseo.metadata.run_id"] === run.tag);
}

// The longest string attribute in raw OTLP, before any row conversion caps it.
function longestOtlpString(payloads: unknown[]): number {
	let longest = 0;
	const visit = (value: unknown) => {
		if (Array.isArray(value)) value.forEach(visit);
		else if (value && typeof value === "object") {
			for (const [key, child] of Object.entries(value)) {
				if (key === "stringValue" && typeof child === "string") longest = Math.max(longest, child.length);
				else visit(child);
			}
		}
	};
	visit(payloads);
	return longest;
}

function collectorPayloads(file: string, run: Run): unknown[] {
	if (!fs.existsSync(file)) return [];
	return fs.readFileSync(file, "utf8").split("\n").filter((line) => line.includes(run.tag)).map((line) => JSON.parse(line));
}

// ---- Local servers ----------------------------------------------------------

type Captured = { headers: IncomingMessage["headers"]; body: string; signatureValid: boolean | null };

function readBody(request: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		request.on("error", reject);
	});
}

// The verification code from the docs (workspace-notifications.mdx), as a
// customer would run it.
function verifyPhaseoSignature(rawBody: string, headers: IncomingMessage["headers"], secret: string, toleranceSeconds = 300): boolean {
	const timestamp = headers["x-phaseo-timestamp"] as string | undefined;
	const signature = headers["x-phaseo-signature"] as string | undefined;
	if (!timestamp || !signature) return false;
	if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
	const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
	const a = Buffer.from(expected, "hex");
	const b = Buffer.from(signature, "hex");
	return a.length === b.length && timingSafeEqual(a, b);
}

async function listen(server: Server): Promise<number> {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	return (server.address() as AddressInfo).port;
}

// ---- Checks -----------------------------------------------------------------

function rowBytes(row: Row): number {
	return Buffer.byteLength(JSON.stringify(row));
}

// What every destination should hold for a run, whatever its format.
// OTLP attribute values are capped at this many characters.
const MAX_OTLP_ATTRIBUTE_CHARS = 64_000;

function checkRun(rows: Row[], run: Run, options: { perEvent: boolean; columns: boolean; rows: boolean; longestOtlpString?: number }) {
	const problems: string[] = [];
	const text = JSON.stringify(rows);
	if (!rows.length) return ["no rows or spans found"];
	if (options.columns) {
		for (const row of rows) {
			const missing = ROW_COLUMNS.filter((column) => !(column in row));
			if (missing.length) problems.push(`row ${row.span_id} is missing ${missing.join(", ")}`);
		}
	}
	const keys = new Set(rows.flatMap((row) => Object.keys(row.attributes)));
	if (!keys.has("gen_ai.request.model")) problems.push("no gen_ai.request.model attribute");
	if (!keys.has("gen_ai.usage.input_tokens")) problems.push("no gen_ai.usage.input_tokens attribute");
	if (!keys.has("phaseo.metadata.customer_tier")) problems.push("request metadata (phaseo.metadata.customer_tier) missing");
	const costKeys = [...keys].filter((key) => key.startsWith("phaseo.cost."));
	const identityKeys = [...keys].filter((key) => key.startsWith("phaseo.api_key.") || key === "user.id");
	if (run.variant === "full") {
		if (!text.includes(run.marker)) problems.push("prompt/response content missing");
		if (!costKeys.length) problems.push("cost attributes missing");
		if (!identityKeys.length) problems.push("identity attributes missing");
	} else {
		if (text.includes(run.marker)) problems.push("prompt/response content present with privacy mode on");
		if (costKeys.length) problems.push(`cost attributes present with cost off: ${costKeys.join(", ")}`);
		if (identityKeys.length) problems.push(`identity attributes present with identity off: ${identityKeys.join(", ")}`);
	}
	const traced = rows.filter((row) => row.trace_id === run.traceId);
	if (!traced.length) problems.push(`no spans in the metadata trace ${run.traceId}`);
	const root = traced.find((row) => row.parent_span_id === run.parentSpanId);
	if (!root) problems.push(`no span whose parent is metadata.parent_span_id ${run.parentSpanId}`);
	if (!rows.some((row) => row.name === run.traceName)) problems.push(`no span named by metadata.trace_name ("${run.traceName}")`);
	if (!rows.some((row) => row.status_code === "error")) problems.push("the rate-limited request has no error span");
	if (options.perEvent) {
		for (const [label, eventId] of Object.entries(run.eventIds)) {
			if (!rows.some((row) => row.event_id === eventId)) problems.push(`no rows for the ${label} event`);
		}
		const pairs = rows.map((row) => `${row.event_id}/${row.span_id}`);
		const duplicates = pairs.length - new Set(pairs).size;
		if (duplicates) problems.push(`${duplicates} duplicate rows after one delivery`);
	}
	if (!options.rows) {
		const longest = options.longestOtlpString ?? 0;
		if (longest > MAX_OTLP_ATTRIBUTE_CHARS) problems.push(`an attribute is ${longest} characters, over the ${MAX_OTLP_ATTRIBUTE_CHARS} cap`);
		if (run.variant === "full" && longest < MAX_OTLP_ATTRIBUTE_CHARS - 1_000) problems.push(`the large prompt was not cut near the attribute cap (longest ${longest})`);
	} else {
		const largeRows = rows.filter((row) => row.event_id === run.eventIds.large);
		if (!largeRows.length) problems.push("no rows for the large event");
		const oversized = largeRows.filter((row) => rowBytes(row) > MAX_BROADCAST_ROW_BYTES + 4_096);
		if (oversized.length) problems.push(`large event has rows over 512 KB (${oversized.map(rowBytes).join(", ")} bytes)`);
		if (run.variant === "full" && largeRows.length && !largeRows.some((row) => row.attributes["phaseo.truncated_attributes"] !== undefined)) {
			problems.push("large event's rows were not truncated (no phaseo.truncated_attributes)");
		}
	}
	return problems;
}

const report: string[] = [];
const note = (line: string) => {
	report.push(line);
	console.log(line);
};

describe.skipIf(!live)("Broadcast destinations (live)", () => {
	const runId = `${Date.now().toString(36)}${hex(2)}`;
	const webhookCaptures = new Map<string, Captured[]>();
	const servers: Server[] = [];
	let webhookBase = "";
	let faultBase = "";
	let faultStatus = 500;

	beforeAll(async () => {
		state.allowLocal = live?.allowLocal === true;
		const hooks = createHttpServer(async (request: IncomingMessage, response: ServerResponse) => {
			const name = (request.url ?? "/").split("/")[1] ?? "";
			const body = await readBody(request);
			const spec = live!.destinations.find((candidate) => candidate.name === name);
			const secret = spec?.config.signing_secret ? String(spec.config.signing_secret) : null;
			const list = webhookCaptures.get(name) ?? [];
			list.push({ headers: request.headers, body, signatureValid: secret ? verifyPhaseoSignature(body, request.headers, secret) : null });
			webhookCaptures.set(name, list);
			response.writeHead(200, { "content-type": "application/json" }).end("{}");
		});
		servers.push(hooks);
		webhookBase = `http://127.0.0.1:${await listen(hooks)}`;
		const fault = (request: IncomingMessage, response: ServerResponse) => {
			void readBody(request).then(() => {
				const headers: Record<string, string> = { "content-type": "text/plain" };
				if (faultStatus === 429) headers["retry-after"] = "7";
				response.writeHead(faultStatus, headers).end(`fault ${faultStatus}`);
			});
		};
		const faultServer = live?.tls
			? createHttpsServer({ cert: fs.readFileSync(live.tls.cert), key: fs.readFileSync(live.tls.key) }, fault) as unknown as Server
			: createHttpServer(fault);
		servers.push(faultServer);
		faultBase = `${live?.tls ? "https" : "http"}://${"localtest.me"}:${await listen(faultServer)}`;
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterAll(async () => {
		await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
		if (report.length) {
			const file = process.env.BROADCAST_LIVE_REPORT;
			if (file) fs.writeFileSync(file, `${report.join("\n")}\n`);
		}
	});

	for (const spec of live?.destinations ?? []) {
		describe(`${spec.name} (${spec.type})`, () => {
			for (const variant of ["full", "private"] as const) {
				it(`stores the ${variant} variant as documented`, async () => {
					const run = buildRun(runId, variant, spec.name);
					const config = spec.localWebhook ? { ...spec.config, url: `${webhookBase}/${spec.name}` } : spec.config;
					const destination = destinationRow(spec, variant, runId, config);
					state.destinations = [destination];
					state.health = [];
					state.requeued = [];
					const startedAt = Date.now();
					const { summary } = await deliver(run, destination.id);
					const health = state.health.find((entry) => entry.p_destination_id === destination.id || entry.destination_id === destination.id) ?? state.health[0];
					note(`${spec.name}/${variant}: ${summary.requests} request(s), delivered ${summary.delivered}/${run.events.length}, retried ${summary.retried}, failed ${summary.failed} in ${Date.now() - startedAt} ms; health ${JSON.stringify(health ?? null)}`);
					expect(summary, `delivery summary (health: ${JSON.stringify(health)})`).toMatchObject({ delivered: run.events.length, failed: 0, retried: 0 });

					const eventIds = run.events.map((event) => event.eventId);
					let rows: Row[] | null = null;
					let perEvent = true;
					let columns = true;
					let longest: number | undefined;
					if (spec.type === "webhook" && spec.localWebhook) {
						const captures = webhookCaptures.get(spec.name) ?? [];
						const ours = captures.filter((capture) => capture.body.includes(run.tag));
						expect(ours.length, "one webhook request per event").toBe(run.events.length);
						if (spec.config.signing_secret) expect(ours.every((capture) => capture.signatureValid), "every signature verifies with the documented code").toBe(true);
						expect(ours.every((capture) => String(capture.headers["content-type"]).startsWith("application/json"))).toBe(true);
						const payloads = ours.map((capture) => JSON.parse(capture.body));
						longest = longestOtlpString(payloads);
						rows = otlpRows(payloads, run);
						perEvent = variant === "full";
						columns = false;
					} else if (spec.type === "otel_collector" && spec.otlpFile) {
						const file = spec.otlpFile;
						const payloads = await waitFor(async () => collectorPayloads(file, run), (found) => otlpRows(found, run).length >= run.events.length * 2, 15_000);
						longest = longestOtlpString(payloads);
						rows = otlpRows(payloads, run);
						perEvent = variant === "full";
						columns = false;
					} else if (["s3", "r2", "gcs"].includes(spec.type)) {
						const prefix = `phaseo-smoke/${runId}/${variant}/`;
						const read = await readObjectRows(spec, destination.destination_config, prefix);
						rows = read.rows;
						note(`${spec.name}/${variant}: ${read.keys.length} object(s): ${read.keys.join(", ")}; headers ${JSON.stringify(read.headers[0] ?? {})}`);
						expect(read.keys.every((key) => key.endsWith(".jsonl.gz"))).toBe(true);
						expect(read.headers.every((headers) => headers["content-encoding"] === ""), "objects have no Content-Encoding").toBe(true);
					} else if (spec.type === "clickhouse") {
						rows = await waitFor(() => readClickHouse(config, eventIds), (found) => found.length > 0);
					} else if (spec.type === "bigquery") {
						rows = await waitFor(() => readBigQuery(config, eventIds), (found) => found.length > 0);
					} else if (spec.type === "snowflake") {
						rows = await waitFor(() => readSnowflake(config, eventIds), (found) => found.length > 0);
					}
					if (!rows) {
						note(`${spec.name}/${variant}: delivered; no readback for ${spec.type}. Look for trace ${run.traceId} ("${run.traceName}") in the vendor's UI.`);
						return;
					}
					const problems = checkRun(rows, run, { perEvent, columns, rows: columns, longestOtlpString: longest });
					note(`${spec.name}/${variant}: read back ${rows.length} row(s)/span(s); ${problems.length ? `PROBLEMS: ${problems.join("; ")}` : "all checks pass"}`);
					expect(problems).toEqual([]);

					if (isBroadcastRowsDestination(spec.type) && variant === "full") {
						// A retry of a batch the destination already took, as after a lost response.
						const before = rows.length;
						const retried = await deliver(run, destination.id, 2);
						expect(retried.summary.delivered).toBe(run.events.length);
						let after = before;
						if (spec.type === "clickhouse") after = (await readClickHouse(config, eventIds)).length;
						if (spec.type === "bigquery") after = (await readBigQuery(config, eventIds)).length;
						if (spec.type === "snowflake") after = (await readSnowflake(config, eventIds)).length;
						if (["s3", "r2", "gcs"].includes(spec.type)) after = (await readObjectRows(spec, destination.destination_config, `phaseo-smoke/${runId}/${variant}/`)).rows.length;
						note(`${spec.name}/${variant}: after a resend of the same batch, ${after} rows (was ${before}; ${after === before ? "deduplicated" : `${after - before} duplicates, as the docs allow`})`);
					}
				});
			}

			afterAll(async () => {
				if (spec.cleanup === false) return;
				const ids = (["full", "private"] as const).flatMap((variant) => buildRunIds(runId, variant, spec.name));
				try {
					if (["s3", "r2", "gcs"].includes(spec.type)) {
						const config = destinationRow(spec, "full", runId, spec.config).destination_config;
						for (const key of await objectKeys(spec, config, `phaseo-smoke/${runId}/`)) await s3Request(spec, config, "DELETE", objectUrl(spec, config, key));
					} else if (spec.type === "clickhouse") {
						await clickHouseQuery(spec.config, `DELETE FROM ${chTable(spec.config)} WHERE event_id IN (${sqlList(ids)})`);
					} else if (spec.type === "snowflake") {
						await snowflakeStatement(spec.config, `DELETE FROM ${sfTable(spec.config)} WHERE EVENT_ID IN (${placeholders(ids.length)})`, ids);
					} else if (spec.type === "bigquery") {
						note(`${spec.name}: BigQuery can't delete streamed rows for up to 90 minutes; delete event_id LIKE 'gateway:${runId}-%' later if you keep the table.`);
					}
				} catch (error) {
					note(`${spec.name}: cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
				}
			});
		});
	}

	// The same failures from a real HTTP server, for the senders that can reach
	// it: what is retried, with what delay, and what fails for good.
	describe("failure handling", () => {
		const targets = [
			{ type: "otel_collector", config: () => ({ endpoint: faultBase }) },
			{ type: "webhook", config: () => ({ url: `${faultBase}/hook` }) },
			...(live?.tls ? [
				{ type: "s3", config: () => ({ endpoint: faultBase, bucket: "smoke", region: "us-east-1", access_key_id: "smoke", secret_access_key: "smoke" }) },
				{ type: "clickhouse", config: () => ({ endpoint: faultBase, table: "smoke", password: "smoke" }) },
			] : []),
		];
		const cases = [
			{ status: 500, retried: true },
			{ status: 429, retried: true, delaySeconds: 7 },
			{ status: 400, retried: false },
			{ status: 401, retried: false },
		];
		for (const target of targets) {
			for (const testCase of cases) {
				it.skipIf(!live?.allowLocal)(`${target.type}: ${testCase.status} is ${testCase.retried ? "retried" : "not retried"}`, async () => {
					faultStatus = testCase.status;
					const run = buildRun(runId, "full", `fault-${target.type}-${testCase.status}`);
					run.events = run.events.slice(0, 1);
					const destination = { id: `fault-${target.type}`, destination_id: target.type, destination_config: target.config(), enabled: true };
					state.destinations = [destination];
					state.health = [];
					state.requeued = [];
					const { summary, messages } = await deliver(run, destination.id);
					if (testCase.retried) {
						expect(summary).toMatchObject({ delivered: 0, retried: 1, failed: 0 });
						expect(state.requeued).toHaveLength(1);
						expect(state.requeued[0].body.attempt).toBe(2);
						if (testCase.delaySeconds) expect(state.requeued[0].delaySeconds).toBe(testCase.delaySeconds);
					} else {
						expect(summary).toMatchObject({ delivered: 0, retried: 0, failed: 1 });
						expect(state.requeued).toHaveLength(0);
					}
					expect(messages[0].ack).toHaveBeenCalled();
					note(`fault ${target.type} ${testCase.status}: ${testCase.retried ? `requeued (delay ${state.requeued[0]?.delaySeconds ?? 0}s)` : "failed, not retried"}; health ${JSON.stringify(state.health[0] ?? null)}`);
				});
			}
		}
	});
});

function buildRunIds(runId: string, variant: Variant, scope: string): string[] {
	return ["chat", "tools", "large", "failed"].map((name) => `gateway:${runId}-${scope}-${variant}-${name}`);
}
