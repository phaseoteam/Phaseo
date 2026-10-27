// Checks what each Broadcast destination is sent against that destination's own
// documentation and against our Broadcast guide, without any accounts. Each
// expectation is written from the vendor's docs, which are linked next to it,
// rather than from our code, so a misreading of a vendor's API fails here.
// What this cannot show is whether the vendor behaves as documented; the live
// spec in tests/integration covers that for destinations with an account.
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGatewayGenAiOtlpPayload, type GatewayGenAiTelemetry } from "./otel-genai";
import { deliverGatewayOtlpPayload, deliverGatewayWebhookPayload } from "./otlp-export";
import { applyOtlpTarget, OTLP_PRESETS, resolveOtlpTarget } from "./broadcast-destinations";
import {
	BROADCAST_ROWS_REQUEST_LIMITS,
	broadcastRows,
	clearBroadcastRowsTokenCache,
	sendBroadcastRows,
	type BroadcastRow,
} from "./broadcast-rows";

vi.mock("@core/webhook-endpoints", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@core/webhook-endpoints")>();
	return { ...actual, validateWebhookEndpointUrlForDelivery: vi.fn(async (value: unknown) => actual.validateWebhookEndpointUrl(value)) };
});

vi.mock("@/runtime/env", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/runtime/env")>();
	return { ...actual, getBindings: () => ({}) };
});

const GUIDE = readFileSync(fileURLToPath(new URL("../../../docs/v1/guides/broadcast.mdx", import.meta.url)), "utf8");
const NOTIFICATIONS_GUIDE = readFileSync(fileURLToPath(new URL("../../../docs/v1/guides/workspace-notifications.mdx", import.meta.url)), "utf8");

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const STARTED_AT_MS = Date.UTC(2026, 9, 27, 10, 0, 0, 123);

// A chat completion with tools, metadata, a session, a user and a failed first
// attempt: every kind of attribute Broadcast sends.
export const SAMPLE_TELEMETRY: GatewayGenAiTelemetry = {
	requestId: "req_contract_1",
	workspaceId: "ws_contract",
	keyId: "key_1",
	keyName: "Production",
	userId: "user-48213",
	endpoint: "chat.completions",
	requestedModel: "openai/gpt-5-nano",
	provider: "openai",
	providerModel: "gpt-5-nano",
	responseModel: "gpt-5-nano-2026-08-07",
	responseId: "chatcmpl-1",
	requestPayload: {
		model: "openai/gpt-5-nano",
		system: "You summarise support tickets.",
		messages: [{ role: "user", content: "Summarise ticket 48213" }],
		tools: [{ type: "function", function: { name: "lookup_ticket", description: "Find a ticket", parameters: { type: "object" } } }],
		temperature: 0.2,
		max_tokens: 400,
	},
	responsePayload: { choices: [{ message: { role: "assistant", content: "The customer cannot sign in." }, finish_reason: "stop" }] },
	usage: { prompt_tokens: 52, completion_tokens: 9, prompt_tokens_details: { cached_tokens: 12 } },
	providerAttempts: [
		{ attempt_number: 1, started_at_unix_ms: STARTED_AT_MS + 5, provider: "azure", endpoint: "chat.completions", model: "openai/gpt-5-nano", provider_model_slug: "gpt-5-nano", outcome: "error", retryable: true, duration_ms: 40, status: 503, upstream_url: "https://example.openai.azure.com/openai", upstream_error_message: "Service unavailable" },
		{ attempt_number: 2, started_at_unix_ms: STARTED_AT_MS + 50, provider: "openai", endpoint: "chat.completions", model: "openai/gpt-5-nano", provider_model_slug: "gpt-5-nano", outcome: "success", duration_ms: 900, status: 200, upstream_url: "https://api.openai.com/v1/chat/completions" },
	] as GatewayGenAiTelemetry["providerAttempts"],
	stream: false,
	finishReason: "stop",
	statusCode: 200,
	success: true,
	totalNanos: 31_500,
	currency: "USD",
	startedAtMs: STARTED_AT_MS,
	completedAtMs: STARTED_AT_MS + 1_000,
	traceContext: { traceId: TRACE_ID, parentSpanId: "00f067aa0ba902b7", traceFlags: 1 },
	sessionId: "session-7",
	metadata: { trace_name: "support-summary", generation_name: "summarise", customer_tier: "enterprise" },
};

export function samplePayload(includeSensitiveContent = true) {
	return buildGatewayGenAiOtlpPayload(SAMPLE_TELEMETRY, { includeSensitiveContent, serviceName: "phaseo-gateway" });
}

// Span IDs are random, so the rows are built once.
const SAMPLE_ROWS = broadcastRows(samplePayload(), "gateway:contract-1");
const sampleRows = () => SAMPLE_ROWS;

type Sent = { url: URL; init: RequestInit };

function recorder(respond: (url: URL) => Response = () => new Response("", { status: 200 })) {
	const sent: Sent[] = [];
	const send = async (url: URL, init: RequestInit) => {
		sent.push({ url, init });
		return respond(url);
	};
	return { sent, send };
}

function bodyBytes(init: RequestInit): Buffer {
	return Buffer.from(init.body as Uint8Array);
}

function decodeJwt(token: string) {
	const [header, claims, signature] = token.split(".");
	const json = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
	return { header: json(header), claims: json(claims), signed: `${header}.${claims}`, signature: Buffer.from(signature, "base64url") };
}

const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_KEY_PEM = rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

// The column names and types of the guide's CREATE TABLE for a destination.
function guideTable(heading: string): Array<{ name: string; type: string }> {
	const section = GUIDE.split(/^### /m).find((part) => part.startsWith(`${heading}\n`));
	const statement = section?.match(/CREATE TABLE [^(]+\(([\s\S]*?)\n\)/)?.[1];
	if (!statement) throw new Error(`No CREATE TABLE under ### ${heading}`);
	const columns: string[] = [];
	let depth = 0;
	let current = "";
	for (const char of statement) {
		if (char === "(") depth++;
		if (char === ")") depth--;
		if (char === "," && depth === 0) {
			columns.push(current);
			current = "";
		} else current += char;
	}
	columns.push(current);
	return columns.map((column) => column.trim()).filter(Boolean).map((column) => {
		const [name, ...type] = column.split(/\s+/);
		return { name, type: type.join(" ") };
	});
}

// https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/data-types#timestamp_type
// "YYYY-[M]M-[D]D[( |T)[H]H:[M]M:[S]S[.F]][time_zone]", F up to six digits,
// and Z for UTC. ClickHouse DateTime64(6) and Snowflake TIMESTAMP_TZ read
// the same RFC 3339 form.
const RFC3339_MICROS_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

describe("rows match the tables in the Broadcast guide", () => {
	const rowKeys = Object.keys(sampleRows()[0]).sort();

	it.each(["ClickHouse", "BigQuery", "Snowflake"])("%s table has exactly the row's columns", (heading) => {
		expect(guideTable(heading).map((column) => column.name.toLowerCase()).sort()).toEqual(rowKeys);
	});

	it("the guide's column table lists every row field", () => {
		const section = GUIDE.split(/^## /m).find((part) => part.startsWith("Object storage and warehouse rows\n"))!;
		const documented = [...section.matchAll(/^\| `([a-z_]+)`(?:, `([a-z_]+)`)? \|/gm)].flatMap((match) => [match[1], match[2]]).filter(Boolean);
		expect(documented.sort()).toEqual(rowKeys);
	});

	it("only ClickHouse's Nullable columns are ever null", () => {
		const nullable = guideTable("ClickHouse").filter((column) => column.type.startsWith("Nullable(")).map((column) => column.name);
		for (const row of sampleRows()) {
			for (const [key, value] of Object.entries(row)) {
				if (value === null) expect(nullable).toContain(key);
			}
		}
		// The request's span is the root unless the caller names a parent.
		const root = broadcastRows(buildGatewayGenAiOtlpPayload({ ...SAMPLE_TELEMETRY, traceContext: null }, { includeSensitiveContent: true }), "e")[0];
		expect(root.parent_span_id).toBeNull();
	});

	it("timestamps are RFC 3339 UTC with microseconds, which every table's timestamp type reads", () => {
		const [row] = sampleRows();
		expect(row.start_time).toMatch(RFC3339_MICROS_UTC);
		expect(row.start_time).toBe("2026-10-27T10:00:00.123000Z");
		expect(guideTable("ClickHouse").find((column) => column.name === "start_time")?.type).toBe("DateTime64(6, 'UTC')");
		expect(guideTable("BigQuery").find((column) => column.name === "start_time")?.type).toBe("TIMESTAMP");
		expect(guideTable("Snowflake").find((column) => column.name === "START_TIME")?.type).toBe("TIMESTAMP_TZ");
	});

	it("kind and status_code use the values the guide lists", () => {
		const rows = sampleRows();
		expect(rows.map((row) => row.kind)).toEqual(["server", "client", "client"]);
		expect(new Set(rows.map((row) => row.status_code))).toEqual(new Set(["unset", "error"]));
		expect(rows.every((row) => row.service_name === "phaseo-gateway")).toBe(true);
	});
});

describe("ClickHouse HTTP interface", () => {
	const config = { endpoint: "https://abc123.eu-west-1.aws.clickhouse.cloud:8443", database: "default", table: "phaseo_traces", username: "phaseo", password: "secret-password" };

	it("posts gzipped JSONEachRow with the documented headers and settings", async () => {
		const { sent, send } = recorder();
		await sendBroadcastRows("clickhouse", config, sampleRows(), send);
		const [{ url, init }] = sent;
		const headers = new Headers(init.headers);
		// https://clickhouse.com/docs/interfaces/http
		// "Using ClickHouse user name and password in X-ClickHouse-User and X-ClickHouse-Key headers"
		expect(headers.get("x-clickhouse-user")).toBe("phaseo");
		expect(headers.get("x-clickhouse-key")).toBe("secret-password");
		// INSERT must be a POST; the query can be the `query` parameter with
		// the data in the body.
		expect(init.method).toBe("POST");
		expect(url.searchParams.get("query")).toBe("INSERT INTO `default`.`phaseo_traces` FORMAT JSONEachRow");
		// A gzip body is decompressed when sent with Content-Encoding: gzip; no
		// setting is needed (enable_http_compression is for responses).
		expect(headers.get("content-encoding")).toBe("gzip");
		// https://clickhouse.com/docs/operations/settings/settings: any setting
		// can be a URL parameter. Defaults changed between versions
		// (date_time_input_format became best_effort in 26.5), so each one this
		// format depends on is sent.
		expect(Object.fromEntries(url.searchParams)).toMatchObject({
			input_format_skip_unknown_fields: "1",
			date_time_input_format: "best_effort",
			input_format_json_read_objects_as_strings: "1",
			async_insert: "1",
			wait_for_async_insert: "1",
		});
		// https://clickhouse.com/docs/interfaces/formats/JSONEachRow: one object per line.
		const lines = gunzipSync(bodyBytes(init)).toString("utf8").trimEnd().split("\n");
		expect(lines).toHaveLength(3);
		const row = JSON.parse(lines[0]);
		expect(typeof row.attributes).toBe("object");
		expect(row.attributes["phaseo.requested_model"]).toBe("openai/gpt-5-nano");
	});

	it("goes to the endpoint as entered, such as ClickHouse Cloud on 8443", async () => {
		const { sent, send } = recorder();
		await sendBroadcastRows("clickhouse", config, sampleRows(), send);
		expect(sent[0].url.origin).toBe("https://abc123.eu-west-1.aws.clickhouse.cloud:8443");
	});
});

describe("BigQuery insertAll", () => {
	const account = { type: "service_account", client_email: "phaseo@contract-project.iam.gserviceaccount.com", private_key: PRIVATE_KEY_PEM, project_id: "contract-project" };
	const config = { service_account_json: JSON.stringify(account), dataset: "observability", table: "phaseo_traces" };

	beforeEach(() => clearBroadcastRowsTokenCache());

	async function capture() {
		const { sent, send } = recorder((url) => url.hostname === "oauth2.googleapis.com"
			? Response.json({ access_token: "ya29.token", expires_in: 3599, token_type: "Bearer" })
			: Response.json({ kind: "bigquery#tableDataInsertAllResponse" }));
		const result = await sendBroadcastRows("bigquery", config, sampleRows(), send);
		return { sent, result };
	}

	it("signs in with the service account's JWT as Google documents", async () => {
		const { sent } = await capture();
		const { url, init } = sent[0];
		// https://developers.google.com/identity/protocols/oauth2/service-account#httprest
		expect(url.toString()).toBe("https://oauth2.googleapis.com/token");
		expect(init.method).toBe("POST");
		expect(new Headers(init.headers).get("content-type")).toBe("application/x-www-form-urlencoded");
		const form = new URLSearchParams(String(init.body));
		expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
		const jwt = decodeJwt(form.get("assertion")!);
		expect(jwt.header).toEqual({ alg: "RS256", typ: "JWT" });
		expect(jwt.claims).toMatchObject({ iss: account.client_email, aud: "https://oauth2.googleapis.com/token" });
		// "The maximum value of exp is 1 hour after iat."
		expect(jwt.claims.exp - jwt.claims.iat).toBeLessThanOrEqual(3600);
		// https://cloud.google.com/bigquery/docs/reference/rest/v2/tabledata/insertAll#authorization-scopes
		expect(["https://www.googleapis.com/auth/bigquery.insertdata", "https://www.googleapis.com/auth/bigquery", "https://www.googleapis.com/auth/cloud-platform"]).toContain(jwt.claims.scope);
		expect(crypto.verify("sha256", Buffer.from(jwt.signed), rsa.publicKey, jwt.signature)).toBe(true);
	});

	it("streams rows with the documented URL, body and insert IDs", async () => {
		const { sent, result } = await capture();
		expect(result.ok).toBe(true);
		const { url, init } = sent[1];
		// https://cloud.google.com/bigquery/docs/reference/rest/v2/tabledata/insertAll
		expect(url.toString()).toBe("https://bigquery.googleapis.com/bigquery/v2/projects/contract-project/datasets/observability/tables/phaseo_traces/insertAll");
		expect(init.method).toBe("POST");
		expect(new Headers(init.headers).get("authorization")).toBe("Bearer ya29.token");
		const body = JSON.parse(String(init.body));
		expect(Object.keys(body).sort()).toEqual(["ignoreUnknownValues", "kind", "rows", "skipInvalidRows"]);
		expect(body.kind).toBe("bigquery#tableDataInsertAllRequest");
		for (const row of body.rows) {
			expect(Object.keys(row).sort()).toEqual(["insertId", "json"]);
			// insertId: up to 128 characters.
			expect(row.insertId.length).toBeLessThanOrEqual(128);
			// A JSON column takes an object value as is.
			expect(typeof row.json.attributes).toBe("object");
			expect(row.json.start_time).toMatch(RFC3339_MICROS_UTC);
		}
		expect(new Set(body.rows.map((row: { insertId: string }) => row.insertId)).size).toBe(body.rows.length);
	});

	it("keeps batches inside insertAll's limits", () => {
		// https://cloud.google.com/bigquery/quotas#streaming_inserts
		// 10 MB per request, 50,000 rows per request.
		expect(BROADCAST_ROWS_REQUEST_LIMITS.bigquery.bytes).toBeLessThanOrEqual(10 * 1024 * 1024);
		expect(BROADCAST_ROWS_REQUEST_LIMITS.bigquery.rows).toBeLessThanOrEqual(50_000);
	});

	it("reads row errors in the documented response shape", async () => {
		const { send } = recorder((url) => url.hostname === "oauth2.googleapis.com"
			? Response.json({ access_token: "ya29.token", expires_in: 3599 })
			: Response.json({ insertErrors: [{ index: 0, errors: [{ reason: "invalid", location: "attributes", message: "not JSON" }] }, { index: 1, errors: [{ reason: "stopped" }] }] }));
		const result = await sendBroadcastRows("bigquery", config, sampleRows(), send);
		expect(result).toMatchObject({ ok: false, retryable: false });
		expect(result.error).toContain("invalid: attributes: not JSON");
	});
});

describe("Snowflake SQL API", () => {
	const config = { account: "myorg-myaccount", user: "phaseo_broadcast", private_key: PRIVATE_KEY_PEM, database: "PHASEO", schema: "OBSERVABILITY", table: "PHASEO_TRACES", warehouse: "COMPUTE_WH", role: "PHASEO_WRITER" };

	async function capture(overrides: Record<string, unknown> = {}) {
		const { sent, send } = recorder(() => Response.json({ statementHandle: "01b2c3d4-0000-1111-2222-333344445555", message: "Statement executed successfully." }));
		const result = await sendBroadcastRows("snowflake", { ...config, ...overrides }, sampleRows(), send);
		return { sent, result };
	}

	it("authenticates with a key-pair JWT as Snowflake documents", async () => {
		const { sent } = await capture();
		const headers = new Headers(sent[0].init.headers);
		// https://docs.snowflake.com/en/developer-guide/sql-api/authenticating#using-key-pair-authentication
		expect(headers.get("x-snowflake-authorization-token-type")).toBe("KEYPAIR_JWT");
		const jwt = decodeJwt(headers.get("authorization")!.replace(/^Bearer /, ""));
		// The fingerprint is "SHA256:" and the base64 SHA-256 of the public key's DER.
		const fingerprint = crypto.createHash("sha256").update(rsa.publicKey.export({ type: "spki", format: "der" })).digest("base64");
		expect(jwt.claims.iss).toBe(`MYORG-MYACCOUNT.PHASEO_BROADCAST.SHA256:${fingerprint}`);
		expect(jwt.claims.sub).toBe("MYORG-MYACCOUNT.PHASEO_BROADCAST");
		expect(jwt.claims.exp - jwt.claims.iat).toBeLessThanOrEqual(3600);
		expect(jwt.header.alg).toBe("RS256");
		expect(crypto.verify("sha256", Buffer.from(jwt.signed), rsa.publicKey, jwt.signature)).toBe(true);
	});

	it("names an account locator without its region in the JWT", async () => {
		const { sent } = await capture({ account: "xy12345.us-east-1" });
		expect(sent[0].url.hostname).toBe("xy12345.us-east-1.snowflakecomputing.com");
		const jwt = decodeJwt(new Headers(sent[0].init.headers).get("authorization")!.replace(/^Bearer /, ""));
		expect(jwt.claims.sub).toBe("XY12345.PHASEO_BROADCAST");
	});

	it("submits one statement with the documented body and request ID", async () => {
		const { sent, result } = await capture();
		expect(result.ok).toBe(true);
		const { url, init } = sent[0];
		// https://docs.snowflake.com/en/developer-guide/sql-api/submitting-requests
		expect(`${url.origin}${url.pathname}`).toBe("https://myorg-myaccount.snowflakecomputing.com/api/v2/statements");
		expect(url.searchParams.get("requestId")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		// retry=true only on a resubmission.
		expect(url.searchParams.has("retry")).toBe(false);
		const headers = new Headers(init.headers);
		expect(headers.get("content-type")).toBe("application/json");
		expect(headers.get("accept")).toBe("application/json");
		const body = JSON.parse(String(init.body));
		expect(body).toMatchObject({ database: "PHASEO", schema: "OBSERVABILITY", warehouse: "COMPUTE_WH", role: "PHASEO_WRITER" });
		// Binding values must be strings.
		expect(Object.keys(body.bindings)).toEqual(["1"]);
		expect(body.bindings["1"].type).toBe("TEXT");
		expect(typeof body.bindings["1"].value).toBe("string");
		expect(JSON.parse(body.bindings["1"].value)).toHaveLength(3);
		// One statement: bindings are not allowed in multi-statement requests.
		expect(body.statement.split(";").filter((part: string) => part.trim())).toHaveLength(1);
	});

	it("inserts into exactly the guide table's columns", async () => {
		const { sent } = await capture();
		const statement: string = JSON.parse(String(sent[0].init.body)).statement;
		const columns = statement.match(/INSERT INTO PHASEO\.OBSERVABILITY\.PHASEO_TRACES \(([^)]+)\)/)?.[1].split(", ");
		expect(columns).toEqual(guideTable("Snowflake").map((column) => column.name));
		// Each value is cast to the guide's column type.
		const types = Object.fromEntries(guideTable("Snowflake").map((column) => [column.name, column.type]));
		expect(types.START_TIME).toBe("TIMESTAMP_TZ");
		expect(statement).toContain("value:start_time::timestamp_tz");
		expect(types.ATTRIBUTES).toBe("VARIANT");
		expect(statement).toMatch(/value:attributes[,\s]/);
	});

	it("resubmits with retry=true and the same request ID", async () => {
		const first = await capture();
		const { sent, send } = recorder(() => Response.json({}));
		await sendBroadcastRows("snowflake", config, sampleRows(), send, { attempt: 2 });
		expect(sent[0].url.searchParams.get("retry")).toBe("true");
		expect(sent[0].url.searchParams.get("requestId")).toBe(first.sent[0].url.searchParams.get("requestId"));
	});
});

describe("object storage", () => {
	const keys = { access_key_id: "AKIDEXAMPLE", secret_access_key: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" };
	const now = new Date("2026-10-27T10:05:00Z");
	const uuid = "0b9e2c1d-4f1a-4c55-9d1e-6a7b8c9d0e1f";

	async function put(id: string, config: Record<string, unknown>) {
		const { sent, send } = recorder();
		await sendBroadcastRows(id, { ...keys, ...config }, sampleRows(), send, { now, uuid });
		const [{ url, init }] = sent;
		const headers = new Headers(init.headers);
		const authorization = headers.get("authorization")!;
		const scope = authorization.match(/Credential=AKIDEXAMPLE\/(\d{8})\/([^/]+)\/([^/]+)\/aws4_request/);
		return { url, init, headers, authorization, region: scope?.[2], service: scope?.[3], day: scope?.[1] };
	}

	it.each([
		// https://docs.aws.amazon.com/AmazonS3/latest/userguide/VirtualHosting.html
		["s3", { bucket: "phaseo-traces", region: "eu-west-2" }, "https://phaseo-traces.s3.eu-west-2.amazonaws.com/", "eu-west-2"],
		// Dotted names do not match the virtual-hosted wildcard certificate, so path-style.
		["s3", { bucket: "phaseo.traces", region: "eu-west-2" }, "https://s3.eu-west-2.amazonaws.com/phaseo.traces/", "eu-west-2"],
		// https://developers.cloudflare.com/r2/api/s3/api/: region "auto".
		["r2", { bucket: "phaseo-traces", account_id: "0123456789abcdef0123456789abcdef" }, "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/phaseo-traces/", "auto"],
		// https://developers.cloudflare.com/r2/reference/data-location/#jurisdictional-restrictions
		["r2", { bucket: "phaseo-traces", account_id: "0123456789abcdef0123456789abcdef", jurisdiction: "eu" }, "https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com/phaseo-traces/", "auto"],
		// https://cloud.google.com/storage/docs/interoperability: any region is
		// accepted, Google's samples use "auto"; dotted names need path-style.
		["gcs", { bucket: "phaseo_traces.example.com" }, "https://storage.googleapis.com/phaseo_traces.example.com/", "auto"],
	])("%s puts to the documented endpoint (%j)", async (id, config, base, region) => {
		const sent = await put(id, config);
		expect(sent.url.toString()).toBe(`${base}phaseo/2026/10/27/10/${uuid}.jsonl.gz`);
		expect(sent.init.method).toBe("PUT");
		expect(sent.region).toBe(region);
		// GCS takes AWS4-HMAC-SHA256 signatures with service s3 for x-amz-* requests.
		expect(sent.service).toBe("s3");
		expect(sent.day).toBe("20261027");
	});

	it("signs the way SigV4 requires: content hash, date and signed headers", async () => {
		const { headers, authorization, init } = await put("s3", { bucket: "phaseo-traces", region: "us-east-1" });
		// https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
		expect(authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261027\/us-east-1\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/);
		expect(headers.get("x-amz-date")).toBe("20261027T100500Z");
		expect(headers.get("x-amz-content-sha256")).toBe(crypto.createHash("sha256").update(bodyBytes(init)).digest("hex"));
		const signedHeaders = authorization.match(/SignedHeaders=([^,]+)/)![1].split(";");
		expect(signedHeaders).toEqual([...signedHeaders].sort());
		expect(signedHeaders).toEqual(expect.arrayContaining(["host", "x-amz-content-sha256", "x-amz-date", "content-type"]));
		// Host is signed but set by fetch from the URL.
		expect(headers.has("host")).toBe(false);
	});

	it("stores gzipped JSON lines without Content-Encoding, named .jsonl.gz", async () => {
		const { url, init, headers } = await put("gcs", { bucket: "phaseo-traces" });
		// https://cloud.google.com/storage/docs/transcoding: Content-Encoding: gzip
		// makes GCS decompress on download; application/gzip without it is
		// served as stored. Athena detects gzip by the lower-case .gz extension.
		expect(headers.get("content-type")).toBe("application/gzip");
		expect(headers.has("content-encoding")).toBe(false);
		expect(url.pathname.endsWith(".jsonl.gz")).toBe(true);
		const lines = gunzipSync(bodyBytes(init)).toString("utf8").trimEnd().split("\n").map((line) => JSON.parse(line) as BroadcastRow);
		expect(lines.map((row) => row.span_id)).toEqual(sampleRows().map((row) => row.span_id));
	});

	it("sends no header R2 rejects", async () => {
		// https://developers.cloudflare.com/r2/api/s3/api/: ACL, server-side
		// encryption, tagging and object lock headers are not implemented.
		const { headers } = await put("r2", { bucket: "phaseo-traces", account_id: "0123456789abcdef0123456789abcdef" });
		for (const name of headers.keys()) expect(name).not.toMatch(/^x-amz-(acl|grant-|server-side-encryption|tagging|object-lock|expected-bucket-owner)/);
	});
});

describe("webhook", () => {
	afterEach(() => vi.unstubAllGlobals());

	// The Node.js verification code from workspace-notifications.mdx, run as published.
	async function docsVerifier(): Promise<(rawBody: string, headers: Record<string, string>, secret: string) => boolean> {
		const code = NOTIFICATIONS_GUIDE.match(/```js Node\.js\n([\s\S]*?)```/)?.[1];
		if (!code) throw new Error("No Node.js verification code in workspace-notifications.mdx");
		const body = code.replace(/^import crypto from "node:crypto";\n/m, "").replace(/^export /m, "");
		return new Function("crypto", "Buffer", `${body}\nreturn verifyPhaseoSignature;`)(crypto, Buffer);
	}

	it("posts an OTLP/JSON export that the guide's verification code accepts", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);
		const secret = "whsec_contract_0123456789";
		const payload = samplePayload();
		await deliverGatewayWebhookPayload(payload, { url: "https://hooks.example.com/phaseo", signing_secret: secret });
		const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
		expect(url.toString()).toBe("https://hooks.example.com/phaseo");
		expect(init.method).toBe("POST");
		const body = String(init.body);
		expect(Object.keys(JSON.parse(body))).toEqual(["resourceSpans"]);
		const headers = Object.fromEntries(new Headers(init.headers));
		const verify = await docsVerifier();
		expect(verify(body, headers, secret)).toBe(true);
		expect(verify(body.replace("support-summary", "support-summarx"), headers, secret)).toBe(false);
		expect(verify(body, headers, "whsec_wrong_secret_0000")).toBe(false);
	});
});

// What each OpenTelemetry tool's docs say it takes, for one sample config.
// headers are the documented header names and values; gzip is true only where
// the docs say compressed bodies are accepted. reads lists, for each field the
// tool shows, the attribute keys its docs say it reads it from (a trailing *
// matches a prefix); fields the docs do not mention are left out. required
// lists attributes the docs say every LLM span needs.
type Field = "model" | "input" | "output" | "tokens" | "session" | "user" | "cost";
type VendorDocs = {
	docs: string;
	config: Record<string, string>;
	url: string;
	headers: Record<string, string>;
	protocols: Array<"http/protobuf" | "http/json">;
	gzip: boolean | null;
	resource?: Record<string, string>;
	reads: Partial<Record<Field, string[]>>;
	required?: string[];
	maxStringLength?: number;
};

const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
const GEN_AI_MESSAGES = { input: ["gen_ai.input.messages"], output: ["gen_ai.output.messages"] };
const GEN_AI_TOKENS = ["gen_ai.usage.input_tokens", "gen_ai.usage.output_tokens"];
const GEN_AI_MODEL = ["gen_ai.request.model", "gen_ai.response.model"];

const VENDOR_DOCS: Record<string, VendorDocs> = {
	arize: {
		docs: "https://arize.com/docs/ax/instrument/manual-instrumentation",
		config: { space_id: "U3BhY2U6MQ==", api_key: "ak-1", project_name: "support" },
		url: "https://otlp.arize.com/v1/traces",
		// "The HTTP/OTLP endpoint ... expects the hyphenated headers arize-space-id and arize-api-key."
		headers: { "arize-space-id": "U3BhY2U6MQ==", "arize-api-key": "ak-1" },
		protocols: ["http/protobuf", "http/json"],
		// "the HTTP ingest endpoint doesn't decompress bodies; compressed exports return 400"
		gzip: false,
		resource: { "openinference.project.name": "support" },
		reads: { model: ["gen_ai.request.model"], ...GEN_AI_MESSAGES, tokens: GEN_AI_TOKENS, session: ["gen_ai.conversation.id", "session.id"], user: ["user.id"] },
	},
	axiom: {
		docs: "https://axiom.co/docs/send-data/opentelemetry",
		config: { api_token: "xaat-1", dataset: "traces", region: "EU" },
		url: "https://eu-central-1.aws.edge.axiom.co/v1/traces",
		headers: { authorization: "Bearer xaat-1", "x-axiom-dataset": "traces" },
		protocols: ["http/protobuf"],
		gzip: null,
		reads: { model: GEN_AI_MODEL, ...GEN_AI_MESSAGES, tokens: GEN_AI_TOKENS, session: ["gen_ai.conversation.id"] },
		// https://axiom.co/docs/ai-engineering/otel-conventions
		required: ["gen_ai.operation.name", "gen_ai.provider.name", "gen_ai.capability.name", "gen_ai.step.name"],
	},
	braintrust: {
		docs: "https://www.braintrust.dev/docs/integrations/sdk-integrations/opentelemetry",
		config: { api_key: "sk-1", project_id: "proj-1" },
		url: "https://api.braintrust.dev/otel/v1/traces",
		headers: { authorization: "Bearer sk-1", "x-bt-parent": "project_id:proj-1" },
		protocols: ["http/protobuf"],
		gzip: null,
		reads: { model: ["gen_ai.request.model"], input: ["gen_ai.input.messages", "gen_ai.prompt"], output: ["gen_ai.output.messages", "gen_ai.completion"], tokens: GEN_AI_TOKENS },
	},
	comet_opik: {
		docs: "https://www.comet.com/docs/opik/integrations/opentelemetry",
		config: { api_key: "opik-1", workspace: "team", project_name: "support" },
		url: "https://www.comet.com/opik/api/v1/private/otel/v1/traces",
		// "Authorization: <Opik API key>", with no Bearer prefix.
		headers: { authorization: "opik-1", "comet-workspace": "team", projectname: "support" },
		protocols: ["http/protobuf"],
		gzip: null,
		reads: { model: GEN_AI_MODEL, input: ["gen_ai.input.*", "gen_ai.prompt"], output: ["gen_ai.output.*", "gen_ai.completion"], tokens: ["gen_ai.usage.*"], session: ["gen_ai.conversation.id"], cost: ["gen_ai.usage.cost"] },
	},
	datadog: {
		docs: "https://docs.datadoghq.com/llm_observability/instrumentation/otel_instrumentation/",
		config: { api_key: "dd-1", site: "datadoghq.eu", ml_app: "support" },
		url: "https://otlp.datadoghq.eu/v1/traces",
		// "dd-api-key=<YOUR_API_KEY>,dd-otlp-source=llmobs"
		headers: { "dd-api-key": "dd-1", "dd-otlp-source": "llmobs", "dd-ml-app": "support" },
		protocols: ["http/protobuf", "http/json"],
		gzip: null,
		reads: { model: GEN_AI_MODEL, ...GEN_AI_MESSAGES, tokens: GEN_AI_TOKENS, session: ["gen_ai.conversation.id", "session.id"], user: ["user.id"], cost: ["gen_ai.cost.*"] },
	},
	dynatrace: {
		docs: "https://docs.dynatrace.com/docs/ingest-from/opentelemetry/otlp-api",
		config: { environment_url: "https://abc12345.live.dynatrace.com", api_token: "dt0c01.1" },
		url: "https://abc12345.live.dynatrace.com/api/v2/otlp/v1/traces",
		headers: { authorization: "Api-Token dt0c01.1" },
		// "JSON not supported"
		protocols: ["http/protobuf"],
		gzip: true,
		reads: { model: GEN_AI_MODEL, ...GEN_AI_MESSAGES, tokens: GEN_AI_TOKENS, session: ["gen_ai.conversation.id"] },
		required: ["gen_ai.provider.name", "gen_ai.operation.name", "gen_ai.request.model", "gen_ai.response.model", "gen_ai.usage.input_tokens", "gen_ai.usage.output_tokens", "gen_ai.input.messages", "gen_ai.output.messages"],
	},
	elastic: {
		docs: "https://www.elastic.co/docs/reference/opentelemetry/motlp",
		config: { otlp_endpoint: "https://phaseo.ingest.us-east-1.aws.elastic.cloud", api_key: "ZWxhc3RpYw==" },
		url: "https://phaseo.ingest.us-east-1.aws.elastic.cloud/v1/traces",
		headers: { authorization: "ApiKey ZWxhc3RpYw==" },
		protocols: ["http/protobuf"],
		gzip: null,
		reads: { model: ["gen_ai.request.model"], ...GEN_AI_MESSAGES, tokens: GEN_AI_TOKENS },
	},
	grafana_cloud: {
		docs: "https://grafana.com/docs/grafana-cloud/send-data/otlp/send-data-otlp/",
		config: { otlp_endpoint: "https://otlp-gateway-prod-eu-west-2.grafana.net/otlp", instance_id: "123456", api_key: "glc_1" },
		url: "https://otlp-gateway-prod-eu-west-2.grafana.net/otlp/v1/traces",
		headers: { authorization: basic("123456", "glc_1") },
		// JSON "ideally only for low-traffic testing cases"; "either no compression or gzip compression".
		protocols: ["http/protobuf"],
		gzip: true,
		// https://grafana.com/docs/grafana-cloud/observe-and-act/agent-observability/get-started/opentelemetry/
		resource: { "agento11y.record": "true" },
		reads: { model: ["gen_ai.request.model"], ...GEN_AI_MESSAGES, session: ["gen_ai.conversation.id"] },
		required: ["gen_ai.operation.name", "gen_ai.provider.name", "gen_ai.request.model"],
	},
	honeycomb: {
		docs: "https://docs.honeycomb.io/send-data/opentelemetry/",
		config: { api_key: "hc-1", region: "EU" },
		url: "https://api.eu1.honeycomb.io/v1/traces",
		headers: { "x-honeycomb-team": "hc-1" },
		protocols: ["http/protobuf", "http/json"],
		gzip: null,
		reads: { model: GEN_AI_MODEL, ...GEN_AI_MESSAGES, tokens: GEN_AI_TOKENS, session: ["gen_ai.conversation.id"] },
		// https://docs.honeycomb.io/send-data/use-cases/agents
		required: ["gen_ai.operation.name", "gen_ai.conversation.id", "gen_ai.agent.name"],
	},
	langfuse: {
		docs: "https://langfuse.com/integrations/native/opentelemetry",
		config: { public_key: "pk-lf-1", secret_key: "sk-lf-1", base_url: "https://us.cloud.langfuse.com" },
		url: "https://us.cloud.langfuse.com/api/public/otel/v1/traces",
		headers: { authorization: basic("pk-lf-1", "sk-lf-1"), "x-langfuse-ingestion-version": "4" },
		protocols: ["http/protobuf", "http/json"],
		gzip: null,
		reads: {
			model: ["langfuse.observation.model.name", ...GEN_AI_MODEL],
			input: ["langfuse.observation.input", "gen_ai.prompt", "input.value"],
			output: ["langfuse.observation.output", "gen_ai.completion", "output.value"],
			tokens: ["langfuse.observation.usage_details", "gen_ai.usage.*"],
			session: ["langfuse.session.id", "session.id"],
			user: ["langfuse.user.id", "user.id"],
			cost: ["langfuse.observation.cost_details", "gen_ai.usage.cost"],
		},
	},
	langsmith: {
		docs: "https://docs.langchain.com/langsmith/trace-with-opentelemetry",
		config: { api_key: "lsv2-1", project: "support" },
		url: "https://api.smith.langchain.com/otel/v1/traces",
		headers: { "x-api-key": "lsv2-1", "langsmith-project": "support" },
		protocols: ["http/protobuf"],
		gzip: null,
		reads: { model: GEN_AI_MODEL, input: ["gen_ai.input.messages", "gen_ai.prompt"], output: ["gen_ai.output.messages", "gen_ai.completion"], tokens: GEN_AI_TOKENS, session: ["langsmith.trace.session_id"], user: ["langsmith.metadata.user_id"] },
	},
	new_relic: {
		docs: "https://docs.newrelic.com/docs/opentelemetry/best-practices/opentelemetry-otlp/",
		config: { license_key: "nr-1", region: "EU" },
		// Port 443 is listed for every endpoint alongside 4317 and 4318.
		url: "https://otlp.eu01.nr-data.net/v1/traces",
		headers: { "api-key": "nr-1" },
		protocols: ["http/protobuf"],
		gzip: true,
		reads: { model: ["gen_ai.request.model"], ...GEN_AI_MESSAGES },
		required: ["gen_ai.provider.name"],
		// "Attribute values of type string have a max length of 4095 characters."
		maxStringLength: 4095,
	},
	posthog: {
		docs: "https://posthog.com/docs/llm-analytics/installation/opentelemetry",
		config: { api_key: "phc_1", base_url: "https://eu.i.posthog.com" },
		// The full traces URL: the generic /v1/traces suffix 404s.
		url: "https://eu.i.posthog.com/i/v0/ai/otel",
		headers: { authorization: "Bearer phc_1" },
		protocols: ["http/protobuf", "http/json"],
		gzip: null,
		reads: { model: GEN_AI_MODEL, ...GEN_AI_MESSAGES, tokens: GEN_AI_TOKENS, session: ["gen_ai.conversation.id"], user: ["posthog.distinct_id"] },
	},
	respan: {
		docs: "https://www.respan.ai/docs/apis/traces/ingest-traces-otlp",
		config: { api_key: "rsp-1" },
		url: "https://api.respan.ai/api/v2/traces",
		headers: { authorization: "Bearer rsp-1" },
		protocols: ["http/protobuf", "http/json"],
		gzip: null,
		reads: {
			model: GEN_AI_MODEL,
			input: ["gen_ai.prompt.*", "traceloop.entity.input", "input.value"],
			output: ["gen_ai.completion.*", "traceloop.entity.output", "output.value"],
			tokens: ["gen_ai.usage.prompt_tokens", "gen_ai.usage.completion_tokens"],
			session: ["respan.threads.thread_identifier"],
			user: ["respan.customer_params.customer_identifier"],
		},
		// "include llm.request.type (chat or completion) so model, messages, and token fields are promoted"
		required: ["llm.request.type"],
	},
	sentry: {
		docs: "https://docs.sentry.io/concepts/otlp/direct/traces/",
		config: { otlp_endpoint: "https://o123.ingest.us.sentry.io/api/456/integration/otlp/v1/traces", public_key: "abc123" },
		url: "https://o123.ingest.us.sentry.io/api/456/integration/otlp/v1/traces",
		headers: { "x-sentry-auth": "sentry sentry_key=abc123" },
		protocols: ["http/protobuf"],
		gzip: null,
		reads: { model: GEN_AI_MODEL, ...GEN_AI_MESSAGES, tokens: GEN_AI_TOKENS, session: ["gen_ai.conversation.id"] },
		required: ["gen_ai.operation.name", "gen_ai.provider.name", "gen_ai.request.model", "gen_ai.response.model"],
	},
	wandb_weave: {
		docs: "https://docs.coreweave.com/products/wandb/weave/guides/tracking/trace-agents-otel",
		config: { api_key: "wb-1", entity: "team", project: "support" },
		url: "https://trace.wandb.ai/agents/otel/v1/traces",
		headers: { "wandb-api-key": "wb-1" },
		// Protobuf only; "accepts gzip and deflate content encoding".
		protocols: ["http/protobuf"],
		gzip: true,
		resource: { "wandb.entity": "team", "wandb.project": "support" },
		reads: { model: ["gen_ai.request.model"], ...GEN_AI_MESSAGES, tokens: GEN_AI_TOKENS, session: ["gen_ai.conversation.id"] },
	},
};

// Where what we send differs from a vendor's docs. The test fails once an
// entry no longer applies, so the list stays a true record of the gaps.
const KNOWN_GAPS: Record<string, string> = {
	"arize:headers": "Arize's manual-instrumentation page asks for arize-space-id and arize-api-key over HTTP and says the wrong form drops spans silently; we send space_id and api_key, which its exporter page shows.",
	"axiom:required": "Axiom's AI view also asks for its own gen_ai.capability.name and gen_ai.step.name.",
	"comet_opik:cost": "Opik reads cost from gen_ai.usage.cost; we send phaseo.cost.nanos.",
	"datadog:cost": "Datadog reads cost from gen_ai.cost.*; we send phaseo.cost.nanos.",
	"grafana_cloud:resource": "Grafana's Agent Observability only records traces with agento11y.record=true; traces still reach Tempo without it.",
	"honeycomb:required": "Honeycomb's agent view groups by gen_ai.agent.name and shows Unknown without it.",
	"langfuse:input": "Langfuse's mapping table reads input from gen_ai.prompt or langfuse.observation.input, not gen_ai.input.messages.",
	"langfuse:output": "Langfuse's mapping table reads output from gen_ai.completion or langfuse.observation.output, not gen_ai.output.messages.",
	"langfuse:cost": "Langfuse reads cost from gen_ai.usage.cost or langfuse.observation.cost_details; we send phaseo.cost.nanos.",
	"langsmith:session": "LangSmith reads threads from langsmith.trace.session_id, not gen_ai.conversation.id.",
	"langsmith:user": "LangSmith has no user attribute beyond custom langsmith.metadata.* keys.",
	"posthog:user": "PostHog reads the user from the posthog.distinct_id resource attribute, not user.id.",
	"respan:input": "Respan reads indexed gen_ai.prompt.N.* messages, not gen_ai.input.messages.",
	"respan:output": "Respan reads indexed gen_ai.completion.N.* messages, not gen_ai.output.messages.",
	"respan:tokens": "Respan reads gen_ai.usage.prompt_tokens and completion_tokens, not input_tokens and output_tokens.",
	"respan:session": "Respan reads threads from respan.threads.thread_identifier.",
	"respan:user": "Respan reads customers from respan.customer_params.customer_identifier.",
	"respan:required": "Respan only promotes model, messages and tokens on spans with llm.request.type.",
};

type Attribute = { key: string; value: Record<string, unknown> };
type ExportRequest = { resourceSpans: Array<{ resource: { attributes: Attribute[] }; scopeSpans: Array<{ spans: Array<{ kind: number; attributes: Attribute[] }> }> }> };

function covers(documented: string[], keys: Set<string>): boolean {
	return documented.some((pattern) => pattern.endsWith("*")
		? [...keys].some((key) => key.startsWith(pattern.slice(0, -1)))
		: keys.has(pattern));
}

// Each check for a vendor, by name, and whether it passes.
async function vendorChecks(id: string, docs: VendorDocs): Promise<Record<string, boolean>> {
	const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
	vi.stubGlobal("fetch", fetchMock);
	const result = await deliverGatewayOtlpPayload(samplePayload(), docs.config, 1, id);
	expect(result.error).toBeNull();
	const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
	const headers = Object.fromEntries(new Headers(init.headers));
	const target = resolveOtlpTarget(id, docs.config);
	const request = applyOtlpTarget(samplePayload(), target) as ExportRequest;
	const resource = Object.fromEntries(request.resourceSpans[0].resource.attributes.map((attribute) => [attribute.key, attribute.value.stringValue]));
	// The provider attempt that succeeded: the span vendors show as the LLM call.
	const llmSpan = request.resourceSpans[0].scopeSpans[0].spans.filter((span) => span.kind === 3).at(-1)!;
	const keys = new Set([...llmSpan.attributes.map((attribute) => attribute.key), ...Object.keys(resource)]);
	const protocol = headers["content-type"] === "application/x-protobuf" ? "http/protobuf" : "http/json";
	const checks: Record<string, boolean> = {
		url: String(url) === docs.url,
		headers: Object.entries(docs.headers).every(([name, value]) => headers[name] === value),
		protocol: docs.protocols.includes(protocol),
		gzip: headers["content-encoding"] !== "gzip" || docs.gzip === true,
		resource: Object.entries(docs.resource ?? {}).every(([key, value]) => resource[key] === value),
		required: (docs.required ?? []).every((key) => keys.has(key)),
		maxStringLength: docs.maxStringLength === undefined || (target.maxAttributeLength !== null && target.maxAttributeLength <= docs.maxStringLength),
	};
	for (const [field, documented] of Object.entries(docs.reads)) checks[field] = covers(documented, keys);
	return checks;
}

describe("OpenTelemetry tools", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("every vendor preset has documented expectations", () => {
		expect(Object.keys(VENDOR_DOCS).sort()).toEqual(Object.keys(OTLP_PRESETS).sort());
	});

	it.each(Object.entries(VENDOR_DOCS))("%s receives what its docs describe", async (id, docs) => {
		const checks = await vendorChecks(id, docs);
		const failing = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => `${id}:${name}`);
		// Every failing check is a recorded gap...
		expect(failing.filter((name) => !(name in KNOWN_GAPS))).toEqual([]);
		// ...and every recorded gap still fails.
		expect(Object.keys(KNOWN_GAPS).filter((name) => name.startsWith(`${id}:`) && !failing.includes(name))).toEqual([]);
	});

	it("New Relic's spans stay within its attribute count limits", () => {
		// https://docs.newrelic.com/docs/opentelemetry/best-practices/opentelemetry-otlp/
		// "Max record attributes (span, metric datapoint, log): 128", "Max resource attributes: 64"
		const request = applyOtlpTarget(samplePayload(), resolveOtlpTarget("new_relic", VENDOR_DOCS.new_relic.config)) as ExportRequest;
		for (const span of request.resourceSpans[0].scopeSpans[0].spans) expect(span.attributes.length).toBeLessThanOrEqual(128);
		expect(request.resourceSpans[0].resource.attributes.length).toBeLessThanOrEqual(64);
	});
});
