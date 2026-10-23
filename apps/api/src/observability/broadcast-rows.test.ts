import { describe, expect, it } from "vitest";
import {
	MAX_BROADCAST_ROW_BYTES,
	broadcastObjectKey,
	broadcastRowBytes,
	broadcastRows,
	broadcastRowsEndpoint,
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
		expect(response.status).toBe(200);
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
