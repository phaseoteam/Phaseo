import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	MAX_BROADCAST_ROW_BYTES,
	broadcastObjectKey,
	broadcastRowBytes,
	broadcastRows,
	broadcastRowsEndpoint,
	clearBroadcastRowsTokenCache,
	jsonLines,
	sendBroadcastRows,
	signAwsRequest,
} from "./broadcast-rows";

const AWS_EXAMPLE_KEYS = {
	accessKeyId: "AKIAIOSFODNN7EXAMPLE",
	secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
	region: "us-east-1",
	service: "s3",
	now: new Date("2013-05-24T00:00:00Z"),
};

const otlp = {
	resourceSpans: [{
		resource: { attributes: [{ key: "service.name", value: { stringValue: "phaseo-gateway" } }] },
		scopeSpans: [{
			spans: [
				{
					traceId: "0af7651916cd43dd8448eb211c80319c",
					spanId: "b7ad6b7169203331",
					name: "chat openai/gpt-5",
					kind: 2,
					startTimeUnixNano: "1761213600123456789",
					endTimeUnixNano: "1761213601623456789",
					status: { code: 2, message: "upstream 500" },
					attributes: [
						{ key: "gen_ai.request.model", value: { stringValue: "openai/gpt-5" } },
						{ key: "gen_ai.usage.input_tokens", value: { intValue: "50" } },
						{ key: "phaseo.cost.total_usd", value: { doubleValue: 0.0125 } },
						{ key: "phaseo.streamed", value: { boolValue: true } },
						{ key: "big", value: { intValue: "9007199254740993" } },
						{ key: "tags", value: { arrayValue: { values: [{ stringValue: "a" }, { intValue: "2" }] } } },
					],
				},
				{
					traceId: "0af7651916cd43dd8448eb211c80319c",
					spanId: "00f067aa0ba902b7",
					parentSpanId: "b7ad6b7169203331",
					name: "provider attempt",
					kind: 3,
					startTimeUnixNano: "1761213600200000000",
					endTimeUnixNano: "1761213600200000000",
					attributes: [],
				},
			],
		}],
	}],
};

describe("signAwsRequest", () => {
	// https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
	it("matches AWS's PUT object example", async () => {
		const headers = await signAwsRequest({
			...AWS_EXAMPLE_KEYS,
			method: "PUT",
			url: new URL("https://examplebucket.s3.amazonaws.com/test%24file.text"),
			headers: { date: "Fri, 24 May 2013 00:00:00 GMT", "x-amz-storage-class": "REDUCED_REDUNDANCY" },
			payloadHash: "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072",
		});
		expect(headers.authorization).toBe(
			"AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class, Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd",
		);
	});

	it("matches AWS's GET object example", async () => {
		const headers = await signAwsRequest({
			...AWS_EXAMPLE_KEYS,
			method: "GET",
			url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
			headers: { range: "bytes=0-9" },
			payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		});
		expect(headers.authorization).toContain("Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
	});

	it("matches AWS's GET bucket lifecycle and list objects examples", async () => {
		const empty = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
		const lifecycle = await signAwsRequest({ ...AWS_EXAMPLE_KEYS, method: "GET", url: new URL("https://examplebucket.s3.amazonaws.com/?lifecycle"), headers: {}, payloadHash: empty });
		expect(lifecycle.authorization).toContain("Signature=fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543");
		const list = await signAwsRequest({ ...AWS_EXAMPLE_KEYS, method: "GET", url: new URL("https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J"), headers: {}, payloadHash: empty });
		expect(list.authorization).toContain("Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7");
	});
});

describe("broadcastRows", () => {
	it("turns each span into a row with typed attributes", () => {
		const rows = broadcastRows(otlp, "gateway:req_1");
		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual({
			event_id: "gateway:req_1",
			trace_id: "0af7651916cd43dd8448eb211c80319c",
			span_id: "b7ad6b7169203331",
			parent_span_id: null,
			name: "chat openai/gpt-5",
			kind: "server",
			start_time: "2025-10-23T10:00:00.123456Z",
			end_time: "2025-10-23T10:00:01.623456Z",
			duration_ms: 1500,
			status_code: "error",
			status_message: "upstream 500",
			service_name: "phaseo-gateway",
			attributes: {
				"gen_ai.request.model": "openai/gpt-5",
				"gen_ai.usage.input_tokens": 50,
				"phaseo.cost.total_usd": 0.0125,
				"phaseo.streamed": true,
				big: "9007199254740993",
				tags: ["a", 2],
			},
			resource_attributes: { "service.name": "phaseo-gateway" },
		});
		expect(rows[1]).toMatchObject({ parent_span_id: "b7ad6b7169203331", kind: "client", duration_ms: 0, status_code: "unset", status_message: null });
	});

	it("cuts oversized attributes so each row fits", () => {
		const image = `data:image/png;base64,${"A".repeat(3 * 1024 * 1024)}`;
		const payload = structuredClone(otlp);
		payload.resourceSpans[0].scopeSpans[0].spans[0].attributes.push(
			{ key: "trace.input", value: { stringValue: image } },
			{ key: "trace.output", value: { stringValue: "é".repeat(400_000) } },
		);
		const [row] = broadcastRows(payload, "gateway:req_1");
		expect(broadcastRowBytes(row)).toBeLessThanOrEqual(MAX_BROADCAST_ROW_BYTES);
		expect(row.attributes["phaseo.truncated_attributes"]).toContain("trace.input");
		expect(String(row.attributes["trace.input"])).toMatch(/^data:image\/png;base64,A+…\[truncated\]$/);
		expect(row.attributes["gen_ai.request.model"]).toBe("openai/gpt-5");
		expect(row.attributes["phaseo.truncated_attributes"]).toEqual(["trace.input", "trace.output"]);
		// Both large values keep a start of about the same size.
		const kept = ["trace.input", "trace.output"].map((key) => new TextEncoder().encode(String(row.attributes[key])).byteLength);
		expect(Math.min(...kept)).toBeGreaterThan(200_000);
		expect(String(row.attributes["trace.output"])).toMatch(/^é+…\[truncated\]$/);
		expect(broadcastRows(otlp, "e")[0].attributes).not.toHaveProperty("phaseo.truncated_attributes");
	});

	it("returns no rows for an empty or malformed payload", () => {
		expect(broadcastRows({ resourceSpans: [] }, "e")).toEqual([]);
		expect(broadcastRows(null, "e")).toEqual([]);
		expect(jsonLines([])).toBe("");
	});
});

describe("object storage config", () => {
	const keys = { access_key_id: "AKIA", secret_access_key: "secret" };

	it("addresses each store", () => {
		expect(broadcastRowsEndpoint("s3", { ...keys, bucket: "traces" })).toBe("https://traces.s3.us-east-1.amazonaws.com/");
		expect(broadcastRowsEndpoint("s3", { ...keys, bucket: "my.traces", region: "eu-west-2" })).toBe("https://s3.eu-west-2.amazonaws.com/my.traces/");
		expect(broadcastRowsEndpoint("s3", { ...keys, bucket: "traces", endpoint: "https://minio.example.com/base/" })).toBe("https://minio.example.com/base/traces/");
		expect(broadcastRowsEndpoint("r2", { ...keys, bucket: "traces", account_id: "0123456789abcdef0123456789ABCDEF" })).toBe("https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/traces/");
		expect(broadcastRowsEndpoint("r2", { ...keys, bucket: "traces", account_id: "0123456789abcdef0123456789abcdef", jurisdiction: "EU" })).toBe("https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com/traces/");
		expect(broadcastRowsEndpoint("gcs", { ...keys, bucket: "traces" })).toBe("https://storage.googleapis.com/traces/");
		expect(broadcastRowsEndpoint("gcs", { ...keys, bucket: "project_logs" })).toBe("https://storage.googleapis.com/project_logs/");
		expect(broadcastRowsEndpoint("gcs", { ...keys, bucket: `logs.${"a".repeat(63)}.example.com` })).toContain("/logs.");
	});

	it("names the field at fault", () => {
		expect(() => broadcastRowsEndpoint("s3", { ...keys })).toThrow("bucket is required");
		expect(() => broadcastRowsEndpoint("s3", { ...keys, bucket: "Bad_Bucket" })).toThrow("bucket must be");
		expect(() => broadcastRowsEndpoint("s3", { ...keys, bucket: "project_logs" })).toThrow("bucket must be 3-63");
		expect(() => broadcastRowsEndpoint("gcs", { ...keys, bucket: "a".repeat(64) })).toThrow("Google Cloud Storage bucket name");
		expect(() => broadcastRowsEndpoint("gcs", { ...keys, bucket: `${"a".repeat(64)}.example` })).toThrow("Google Cloud Storage bucket name");
		expect(() => broadcastRowsEndpoint("gcs", { ...keys, bucket: "googtraces" })).toThrow("Google Cloud Storage bucket name");
		expect(() => broadcastRowsEndpoint("s3", { ...keys, bucket: "traces", region: "nowhere" })).toThrow("region must be");
		expect(() => broadcastRowsEndpoint("s3", { ...keys, bucket: "traces", endpoint: "http://minio.example.com" })).toThrow("endpoint must be an HTTPS URL");
		expect(() => broadcastRowsEndpoint("r2", { ...keys, bucket: "traces", account_id: "abc" })).toThrow("account_id must be");
		expect(() => broadcastRowsEndpoint("r2", { ...keys, bucket: "traces", account_id: "0123456789abcdef0123456789abcdef", jurisdiction: "mars" })).toThrow("jurisdiction must be one of");
		expect(() => broadcastRowsEndpoint("gcs", { bucket: "traces", access_key_id: "GOOG1" })).toThrow("secret_access_key is required");
		expect(() => broadcastRowsEndpoint("webhook", keys)).toThrow("Not a row destination");
	});

	it("builds object keys from the path template", () => {
		const now = new Date("2026-10-23T09:05:00Z");
		expect(broadcastObjectKey({}, now, "u1")).toBe("phaseo/2026/10/23/09/u1.jsonl.gz");
		expect(broadcastObjectKey({ path_template: "logs/date={date}/hour={hour}/{uuid}" }, now, "u1")).toBe("logs/date=2026-10-23/hour=09/u1.jsonl.gz");
		for (const [template, message] of [
			["{date}/batch", "must include {uuid}"],
			["/abs/{uuid}", "relative path"],
			["a/../{uuid}", "relative path"],
			["{uuid}/{minute}", "unknown placeholder {minute}"],
			["a b/{uuid}", "may use letters"],
			["{uuid}/{date", "unclosed placeholder"],
		]) {
			expect(() => broadcastObjectKey({ path_template: template }, now, "u1")).toThrow(message);
		}
	});
});

describe("sendBroadcastRows", () => {
	it("puts one gzipped JSON lines object, signed for the store", async () => {
		const requests: Array<{ url: URL; init: RequestInit }> = [];
		const response = await sendBroadcastRows(
			"r2",
			{ bucket: "traces", account_id: "0123456789abcdef0123456789abcdef", access_key_id: "AKIA", secret_access_key: "secret" },
			broadcastRows(otlp, "gateway:req_1"),
			async (url, init) => {
				requests.push({ url, init });
				return new Response(null, { status: 200 });
			},
			{ now: new Date("2026-10-23T09:05:00Z"), uuid: "batch-1" },
		);
		expect(response).toEqual({ ok: true, status: 200, error: null, retryAfter: null });
		expect(requests).toHaveLength(1);
		const [{ url, init }] = requests;
		expect(url.toString()).toBe("https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/traces/phaseo/2026/10/23/09/batch-1.jsonl.gz");
		expect(init.method).toBe("PUT");
		const headers = init.headers as Record<string, string>;
		expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA\/20261023\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
		expect(headers.host).toBeUndefined();
		expect(headers["content-type"]).toBe("application/gzip");
		const body = init.body as Uint8Array;
		const text = await new Response(new Blob([body as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
		const lines = text.trim().split("\n").map((line) => JSON.parse(line));
		expect(lines.map((line) => line.span_id)).toEqual(["b7ad6b7169203331", "00f067aa0ba902b7"]);
		const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", body as Uint8Array<ArrayBuffer>)), (byte) => byte.toString(16).padStart(2, "0")).join("");
		expect(headers["x-amz-content-sha256"]).toBe(digest);
	});

	it("reads at most 64 KB of an error body and shows its code", async () => {
		const pulled: number[] = [];
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled.push(1);
				controller.enqueue(new TextEncoder().encode(pulled.length === 1 ? "<Error><Code>SlowDown</Code>" : "x".repeat(48 * 1024)));
			},
		});
		const result = await sendBroadcastRows("s3", { bucket: "traces", access_key_id: "AKIA", secret_access_key: "secret" }, [], async () => new Response(body, { status: 503, headers: { "retry-after": "3" } }));
		expect(result).toEqual({ ok: false, status: 503, error: "Destination returned 503: SlowDown", retryAfter: "3" });
		// Two chunks reach the cap; the endless body is then cancelled.
		expect(pulled.length).toBeLessThanOrEqual(4);
	});

	it("shows the message of a JSON or HTML error", async () => {
		const send = (response: Response) => sendBroadcastRows("s3", { bucket: "traces", access_key_id: "AKIA", secret_access_key: "secret" }, [], async () => response);
		expect((await send(Response.json({ message: "Bucket\nnot found" }, { status: 404 }))).error).toBe("Destination returned 404: Bucket not found");
		expect((await send(new Response("<!DOCTYPE html><html><head><title>Bad Gateway</title></head></html>", { status: 502 }))).error).toBe("Destination returned 502: Bad Gateway");
	});

	it("sends the session token when one is set", async () => {
		let headers: Record<string, string> = {};
		await sendBroadcastRows(
			"s3",
			{ bucket: "traces", access_key_id: "ASIA", secret_access_key: "secret", session_token: "token" },
			[],
			async (_url, init) => {
				headers = init.headers as Record<string, string>;
				return new Response(null, { status: 200 });
			},
		);
		expect(headers["x-amz-security-token"]).toBe("token");
		expect(headers.authorization).toContain("x-amz-security-token");
	});
});

describe("ClickHouse", () => {
	const config = { endpoint: "https://abc123.eu-west-1.aws.clickhouse.cloud:8443/", username: "phaseo", password: "secret", database: "observability", table: "traces" };

	it("inserts gzipped JSONEachRow through the HTTP interface", async () => {
		const requests: Array<{ url: URL; init: RequestInit }> = [];
		await sendBroadcastRows("clickhouse", config, broadcastRows(otlp, "gateway:req_1"), async (url, init) => {
			requests.push({ url, init });
			return new Response(null, { status: 200 });
		});
		const [{ url, init }] = requests;
		expect(`${url.origin}${url.pathname}`).toBe("https://abc123.eu-west-1.aws.clickhouse.cloud:8443/");
		expect(url.searchParams.get("query")).toBe("INSERT INTO `observability`.`traces` FORMAT JSONEachRow");
		expect(Object.fromEntries([...url.searchParams].filter(([key]) => key !== "query"))).toEqual({
			input_format_skip_unknown_fields: "1",
			date_time_input_format: "best_effort",
			input_format_json_read_objects_as_strings: "1",
			async_insert: "1",
			wait_for_async_insert: "1",
		});
		expect(init.method).toBe("POST");
		expect(init.headers).toEqual({
			"content-type": "application/x-ndjson",
			"content-encoding": "gzip",
			"x-clickhouse-user": "phaseo",
			"x-clickhouse-key": "secret",
		});
		const text = await new Response(new Blob([init.body as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
		expect(text.trim().split("\n").map((line) => JSON.parse(line).span_id)).toEqual(["b7ad6b7169203331", "00f067aa0ba902b7"]);
	});

	it("defaults the user and database and checks identifiers", () => {
		expect(broadcastRowsEndpoint("clickhouse", { endpoint: "https://ch.example.com:8443", password: "p", table: "traces" })).toBe("https://ch.example.com:8443/");
		expect(() => broadcastRowsEndpoint("clickhouse", { ...config, table: "traces; DROP TABLE x" })).toThrow("table must start with a letter");
		expect(() => broadcastRowsEndpoint("clickhouse", { ...config, database: "a`b" })).toThrow("database must start with a letter");
		expect(() => broadcastRowsEndpoint("clickhouse", { ...config, table: "" })).toThrow("table is required");
		expect(() => broadcastRowsEndpoint("clickhouse", { ...config, password: "" })).toThrow("password is required");
		expect(() => broadcastRowsEndpoint("clickhouse", { ...config, endpoint: "http://ch.example.com:8123" })).toThrow("endpoint must be an HTTPS URL");
		expect(() => broadcastRowsEndpoint("clickhouse", { ...config, endpoint: "https://ch.example.com/?user=x" })).toThrow("endpoint must be an HTTPS URL");
	});
});

describe("BigQuery", () => {
	let publicKey: CryptoKey;
	let account: Record<string, string>;

	beforeAll(async () => {
		const pair = await crypto.subtle.generateKey(
			{ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
			true,
			["sign", "verify"],
		);
		publicKey = pair.publicKey;
		const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
		const base64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, "$1\n");
		account = {
			type: "service_account",
			project_id: "phaseo-analytics",
			client_email: "broadcast@phaseo-analytics.iam.gserviceaccount.com",
			private_key: `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----\n`,
		};
	});

	beforeEach(() => clearBroadcastRowsTokenCache());

	const decode = (part: string) => JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
	const config = () => ({ service_account_json: JSON.stringify(account), dataset: "observability", table: "phaseo_traces" });

	function google(insertResponse: () => Response) {
		const calls: Array<{ url: URL; init: RequestInit }> = [];
		const send = async (url: URL, init: RequestInit) => {
			calls.push({ url, init });
			if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "ya29.token", expires_in: 3599, token_type: "Bearer" });
			return insertResponse();
		};
		return { calls, send };
	}

	it("signs in as the service account and streams rows with insert IDs", async () => {
		const { calls, send } = google(() => Response.json({ kind: "bigquery#tableDataInsertAllResponse" }));
		const result = await sendBroadcastRows("bigquery", config(), broadcastRows(otlp, "gateway:req_1"), send);
		expect(result).toEqual({ ok: true, status: 200, error: null, retryAfter: null });

		const [token, insert] = calls;
		expect(token.url.toString()).toBe("https://oauth2.googleapis.com/token");
		const form = new URLSearchParams(String(token.init.body));
		expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
		const [header, claims, signature] = form.get("assertion")!.split(".");
		expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
		expect(decode(claims)).not.toHaveProperty("sub");
		expect(decode(claims)).toMatchObject({
			iss: account.client_email,
			aud: "https://oauth2.googleapis.com/token",
			scope: "https://www.googleapis.com/auth/bigquery.insertdata",
		});
		expect(decode(claims).exp - decode(claims).iat).toBe(3600);
		const signatureBytes = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
		expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signatureBytes, new TextEncoder().encode(`${header}.${claims}`))).toBe(true);

		expect(insert.url.toString()).toBe("https://bigquery.googleapis.com/bigquery/v2/projects/phaseo-analytics/datasets/observability/tables/phaseo_traces/insertAll");
		expect(insert.init.headers).toMatchObject({ authorization: "Bearer ya29.token" });
		const body = JSON.parse(String(insert.init.body));
		expect(body).toMatchObject({ skipInvalidRows: false, ignoreUnknownValues: true });
		expect(body.rows[0].insertId).toBe("gateway:req_1/b7ad6b7169203331");
		expect(body.rows[0].json).toMatchObject({ span_id: "b7ad6b7169203331", start_time: "2025-10-23T10:00:00.123456Z", resource_attributes: { "service.name": "phaseo-gateway" } });
		expect(body.rows[0].json.attributes["gen_ai.usage.input_tokens"]).toBe(50);
	});

	it("reuses the access token until shortly before it expires", async () => {
		const { calls, send } = google(() => Response.json({}));
		await sendBroadcastRows("bigquery", config(), [], send);
		await sendBroadcastRows("bigquery", config(), [], send);
		expect(calls.map((call) => call.url.hostname)).toEqual(["oauth2.googleapis.com", "bigquery.googleapis.com", "bigquery.googleapis.com"]);
	});

	it("reports the row error that rejected the batch", async () => {
		const { send } = google(() => Response.json({
			insertErrors: [
				{ index: 0, errors: [{ reason: "stopped", message: "" }] },
				{ index: 1, errors: [{ reason: "invalid", location: "duration_ms", message: "Cannot convert value to integer." }] },
			],
		}));
		expect(await sendBroadcastRows("bigquery", config(), broadcastRows(otlp, "e"), send)).toEqual({
			ok: false,
			status: 200,
			error: "BigQuery rejected the rows: invalid: duration_ms: Cannot convert value to integer.",
			retryAfter: null,
			retryable: false,
		});
	});

	it("retries rate limits and backend errors", async () => {
		const limited = google(() => Response.json({ error: { code: 403, message: "Exceeded rate limits: too many table update operations", errors: [{ reason: "rateLimitExceeded" }] } }, { status: 403 }));
		expect(await sendBroadcastRows("bigquery", config(), [], limited.send)).toMatchObject({ ok: false, status: 403, retryable: true });
		clearBroadcastRowsTokenCache();
		const denied = google(() => Response.json({ error: { code: 403, message: "Access Denied: Table", errors: [{ reason: "accessDenied" }] } }, { status: 403 }));
		expect(await sendBroadcastRows("bigquery", config(), [], denied.send)).toMatchObject({ ok: false, status: 403, retryable: false, error: "Destination returned 403: Access Denied: Table" });
		clearBroadcastRowsTokenCache();
		const backend = google(() => Response.json({ insertErrors: [{ index: 0, errors: [{ reason: "backendError", message: "" }] }] }));
		expect(await sendBroadcastRows("bigquery", config(), broadcastRows(otlp, "e"), backend.send)).toMatchObject({ ok: false, retryable: true });
	});

	it("does not count a row-error list too long to read as delivered", async () => {
		const stopped = Array.from({ length: 5_000 }, (_, index) => ({ index, errors: [{ reason: index === 4_000 ? "invalid" : "stopped", location: "", message: "" }] }));
		const { send } = google(() => Response.json({ insertErrors: stopped }));
		const result = await sendBroadcastRows("bigquery", config(), broadcastRows(otlp, "e"), send);
		expect(result).toMatchObject({ ok: false, status: 200, retryable: false });
		expect(result.error).toContain("too long to read in full");
	});

	it("reports API and sign-in errors", async () => {
		const notFound = google(() => Response.json({ error: { code: 404, message: "Not found: Table phaseo-analytics:observability.phaseo_traces" } }, { status: 404 }));
		expect(await sendBroadcastRows("bigquery", config(), [], notFound.send)).toMatchObject({
			ok: false,
			status: 404,
			error: "Destination returned 404: Not found: Table phaseo-analytics:observability.phaseo_traces",
		});
		clearBroadcastRowsTokenCache();
		const denied = async () => Response.json({ error: "invalid_grant", error_description: "Invalid JWT Signature." }, { status: 400 });
		expect(await sendBroadcastRows("bigquery", config(), [], denied)).toMatchObject({
			ok: false,
			status: 400,
			error: "Google sign-in for the service account failed: invalid_grant: Invalid JWT Signature.",
		});
	});

	it("checks the key file and table names", () => {
		expect(broadcastRowsEndpoint("bigquery", { ...config(), project_id: "other-project" })).toBe("https://bigquery.googleapis.com/bigquery/v2/projects/other-project/datasets/observability/tables/phaseo_traces/insertAll");
		expect(() => broadcastRowsEndpoint("bigquery", { ...config(), service_account_json: "{\"type\":\"authorized_user\"}" })).toThrow("must be the service account's JSON key file");
		expect(() => broadcastRowsEndpoint("bigquery", { ...config(), service_account_json: "not json" })).toThrow("must be the service account's JSON key file");
		expect(() => broadcastRowsEndpoint("bigquery", { ...config(), dataset: "a.b" })).toThrow("dataset must use only");
		expect(() => broadcastRowsEndpoint("bigquery", { ...config(), table: "x/../y" })).toThrow("table must use only");
		expect(() => broadcastRowsEndpoint("bigquery", { ...config(), project_id: "Bad Project" })).toThrow("project_id must be");
	});

	it("rejects a key that is not an RSA PKCS #8 key", async () => {
		const broken = { ...account, private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n" };
		await expect(sendBroadcastRows("bigquery", { ...config(), service_account_json: JSON.stringify(broken) }, [], async () => new Response())).rejects.toThrow("unencrypted RSA key in PKCS #8 PEM");
	});
});
