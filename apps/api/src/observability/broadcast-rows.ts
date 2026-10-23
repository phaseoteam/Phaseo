// Generated from packages/shared/broadcast-destinations/broadcast-rows.ts by scripts/sync-broadcast-destinations.mjs. Do not edit.
// Delivery for Broadcast destinations that store rows rather than receive
// traces: object storage and databases. Each span in an event's OTLP
// payload becomes one flat row, and a batch of rows is written in one request.
// Dependency-free so the gateway and the dashboard API share it; only Web
// Crypto and CompressionStream are used.

type Json = Record<string, unknown>;

// One span. Attribute values keep their OTLP types: strings, numbers, booleans,
// and arrays or objects for array and key-value attributes.
export type BroadcastRow = {
	event_id: string;
	trace_id: string;
	span_id: string;
	parent_span_id: string | null;
	name: string;
	kind: string;
	start_time: string;
	end_time: string;
	duration_ms: number;
	status_code: string;
	status_message: string | null;
	service_name: string | null;
	attributes: Json;
	resource_attributes: Json;
};

export const BROADCAST_ROWS_DESTINATION_IDS = ["bigquery", "clickhouse", "gcs", "r2", "s3"] as const;
export type BroadcastRowsDestinationId = (typeof BROADCAST_ROWS_DESTINATION_IDS)[number];

// The most one request carries, as uncompressed JSON. Bodies are gzipped, so
// what is sent is several times smaller.
export const BROADCAST_ROWS_REQUEST_LIMITS: Record<BroadcastRowsDestinationId, { bytes: number; rows: number }> = {
	// insertAll takes up to 10 MB and recommends at most 500 rows per request;
	// larger batches are accepted but slower.
	bigquery: { bytes: 5 * 1024 * 1024, rows: 5_000 },
	clickhouse: { bytes: 8 * 1024 * 1024, rows: 50_000 },
	gcs: { bytes: 8 * 1024 * 1024, rows: 50_000 },
	r2: { bytes: 8 * 1024 * 1024, rows: 50_000 },
	s3: { bytes: 8 * 1024 * 1024, rows: 50_000 },
};

const SPAN_KINDS = ["unspecified", "internal", "server", "client", "producer", "consumer"];
const STATUS_CODES = ["unset", "ok", "error"];

function object(value: unknown): Json {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function anyValue(value: unknown): unknown {
	const item = object(value);
	if ("stringValue" in item) return String(item.stringValue);
	if ("boolValue" in item) return Boolean(item.boolValue);
	if ("doubleValue" in item) return Number(item.doubleValue);
	if ("intValue" in item) {
		// int64 arrives as a string; past 2^53 it stays one.
		const number = Number(item.intValue);
		return Number.isSafeInteger(number) ? number : String(item.intValue);
	}
	if ("arrayValue" in item) return (Array.isArray(object(item.arrayValue).values) ? object(item.arrayValue).values as unknown[] : []).map(anyValue);
	if ("kvlistValue" in item) return attributeObject(object(item.kvlistValue).values);
	if ("bytesValue" in item) return String(item.bytesValue);
	return null;
}

function attributeObject(attributes: unknown): Json {
	const output: Json = {};
	for (const attribute of Array.isArray(attributes) ? attributes : []) {
		const key = String(object(attribute).key ?? "");
		if (key) output[key] = anyValue(object(attribute).value);
	}
	return output;
}

function nanos(value: unknown): bigint {
	try {
		return BigInt(String(value ?? "0"));
	} catch {
		return 0n;
	}
}

// RFC 3339 in UTC with microseconds, which every supported store parses.
function timestamp(value: bigint): string {
	const millis = value / 1_000_000n;
	const micros = (value / 1_000n) % 1_000n;
	const iso = new Date(Number(millis)).toISOString();
	return `${iso.slice(0, -1)}${micros.toString().padStart(3, "0")}Z`;
}

// The largest row sent, as JSON. A request inlining an image or a long
// document can carry megabytes in one attribute; cutting rows to this keeps an
// event's few spans well inside every destination's request and row limits.
export const MAX_BROADCAST_ROW_BYTES = 512 * 1024;
const TRUNCATED_SUFFIX = "…[truncated]";

// Cuts the row's largest attribute values until it fits, and lists their keys
// in phaseo.truncated_attributes. The space left is shared evenly between the
// large values, so each keeps its start; non-string values are replaced by a
// marker.
function capRow(row: BroadcastRow): BroadcastRow {
	if (broadcastRowBytes(row) <= MAX_BROADCAST_ROW_BYTES) return row;
	const entries = Object.entries(row.attributes).map(([key, value]) => ({ key, value, bytes: utf8.encode(JSON.stringify(value)).byteLength }));
	const attributeBytes = entries.reduce((total, entry) => total + entry.bytes, 0);
	// Room for the list of cut keys and the markers.
	let budget = MAX_BROADCAST_ROW_BYTES - (broadcastRowBytes(row) - attributeBytes) - 4096;
	// The largest size each value may keep: values under it stay whole.
	let cap = 0;
	const ascending = [...entries].sort((a, b) => a.bytes - b.bytes);
	for (let index = 0; index < ascending.length; index++) {
		const share = Math.floor(budget / (ascending.length - index));
		if (ascending[index].bytes > share) {
			cap = Math.max(0, share);
			break;
		}
		budget -= ascending[index].bytes;
	}
	const attributes: Json = {};
	const truncated: string[] = [];
	for (const entry of entries) {
		if (entry.bytes <= cap || entry.bytes <= 64) {
			attributes[entry.key] = entry.value;
			continue;
		}
		truncated.push(entry.key);
		attributes[entry.key] = typeof entry.value === "string" ? cutString(entry.value, cap) : "[truncated]";
	}
	attributes["phaseo.truncated_attributes"] = truncated;
	return { ...row, attributes };
}

// The longest start of the value whose JSON, with the marker, fits in maxBytes.
function cutString(value: string, maxBytes: number): string {
	const fits = (length: number) => utf8.encode(JSON.stringify(value.slice(0, length) + TRUNCATED_SUFFIX)).byteLength <= maxBytes;
	let low = 0;
	let high = Math.min(value.length, maxBytes);
	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		if (fits(middle)) low = middle;
		else high = middle - 1;
	}
	return low > 0 ? value.slice(0, low) + TRUNCATED_SUFFIX : "[truncated]";
}

// Flattens an OTLP/JSON export request into rows, one per span, each at most
// MAX_BROADCAST_ROW_BYTES.
export function broadcastRows(payload: unknown, eventId: string): BroadcastRow[] {
	const rows: BroadcastRow[] = [];
	for (const resourceSpans of Array.isArray(object(payload).resourceSpans) ? object(payload).resourceSpans as unknown[] : []) {
		const resource = attributeObject(object(object(resourceSpans).resource).attributes);
		for (const scopeSpans of Array.isArray(object(resourceSpans).scopeSpans) ? object(resourceSpans).scopeSpans as unknown[] : []) {
			for (const value of Array.isArray(object(scopeSpans).spans) ? object(scopeSpans).spans as unknown[] : []) {
				const span = object(value);
				const start = nanos(span.startTimeUnixNano);
				const end = nanos(span.endTimeUnixNano);
				const status = object(span.status);
				rows.push(capRow({
					event_id: eventId,
					trace_id: String(span.traceId ?? ""),
					span_id: String(span.spanId ?? ""),
					parent_span_id: span.parentSpanId ? String(span.parentSpanId) : null,
					name: String(span.name ?? ""),
					kind: SPAN_KINDS[Number(span.kind ?? 0)] ?? "unspecified",
					start_time: timestamp(start),
					end_time: timestamp(end),
					duration_ms: Number(end > start ? end - start : 0n) / 1_000_000,
					status_code: STATUS_CODES[Number(status.code ?? 0)] ?? "unset",
					status_message: status.message ? String(status.message) : null,
					service_name: typeof resource["service.name"] === "string" ? resource["service.name"] : null,
					attributes: attributeObject(span.attributes),
					resource_attributes: resource,
				}));
			}
		}
	}
	return rows;
}

const utf8 = new TextEncoder();

// Rows as newline-delimited JSON, one row per line.
export function jsonLines(rows: BroadcastRow[]): string {
	return rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
}

export function broadcastRowBytes(row: BroadcastRow): number {
	return utf8.encode(JSON.stringify(row)).byteLength + 1;
}

async function gzip(text: string): Promise<Uint8Array> {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
	return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string | Uint8Array): Promise<string> {
	return hex(await crypto.subtle.digest("SHA-256", (typeof value === "string" ? utf8.encode(value) : value) as Uint8Array<ArrayBuffer>));
}

async function hmac(key: string | Uint8Array, value: string): Promise<Uint8Array> {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		(typeof key === "string" ? utf8.encode(key) : key) as Uint8Array<ArrayBuffer>,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, utf8.encode(value)));
}

function encodeRfc3986(value: string): string {
	return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export type AwsSigningArgs = {
	method: string;
	url: URL;
	// Lower-case names; host, x-amz-date and x-amz-content-sha256 are added.
	headers: Record<string, string>;
	payloadHash: string;
	region: string;
	service: string;
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
	now: Date;
};

// AWS Signature Version 4 for a request whose path is already URI-encoded, as
// S3 signs it: path segments are not encoded a second time. Returns every
// signed header plus Authorization.
export async function signAwsRequest(args: AwsSigningArgs): Promise<Record<string, string>> {
	const amzDate = args.now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
	const day = amzDate.slice(0, 8);
	const headers: Record<string, string> = {
		...Object.fromEntries(Object.entries(args.headers).map(([key, value]) => [key.toLowerCase(), value.trim().replace(/\s+/g, " ")])),
		host: args.url.host,
		"x-amz-content-sha256": args.payloadHash,
		"x-amz-date": amzDate,
	};
	if (args.sessionToken) headers["x-amz-security-token"] = args.sessionToken;
	const names = Object.keys(headers).sort();
	const query = [...args.url.searchParams.entries()]
		.map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)])
		.sort(([a, x], [b, y]) => a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1)
		.map(([key, value]) => `${key}=${value}`)
		.join("&");
	const canonical = [
		args.method,
		args.url.pathname || "/",
		query,
		names.map((name) => `${name}:${headers[name]}\n`).join(""),
		names.join(";"),
		args.payloadHash,
	].join("\n");
	const scope = `${day}/${args.region}/${args.service}/aws4_request`;
	const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonical)].join("\n");
	let key = await hmac(`AWS4${args.secretAccessKey}`, day);
	for (const part of [args.region, args.service, "aws4_request"]) key = await hmac(key, part);
	const signature = hex(await hmac(key, stringToSign));
	return {
		...headers,
		authorization: `AWS4-HMAC-SHA256 Credential=${args.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
	};
}

function field(config: Record<string, unknown>, name: string): string {
	return String(config[name] ?? "").trim();
}

function required(config: Record<string, unknown>, name: string): string {
	const value = field(config, name);
	if (!value) throw new Error(`${name} is required`);
	return value;
}

// S3 and R2 bucket names: 3-63 lower-case letters, digits, dots and hyphens,
// starting and ending with a letter or digit.
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
// https://cloud.google.com/storage/docs/buckets#naming
// GCS also allows underscores, and dotted names up to 222 characters made of
// parts of at most 63.
const GCS_BUCKET = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;

function bucketError(id: string, bucket: string): string | null {
	if (id === "gcs") {
		const parts = bucket.split(".");
		const valid = GCS_BUCKET.test(bucket) && (parts.length > 1 || bucket.length <= 63) && parts.every((part) => part.length > 0 && part.length <= 63) && !bucket.startsWith("goog");
		return valid ? null : "bucket must be a Google Cloud Storage bucket name: lower-case letters, digits, dots, hyphens or underscores";
	}
	return BUCKET.test(bucket) && !bucket.includes("..") ? null : "bucket must be 3-63 lower-case letters, digits, dots or hyphens";
}
const AWS_REGION = /^[a-z]{2}(-[a-z]+)+-\d+$/;
const R2_ACCOUNT = /^[a-f0-9]{32}$/;
export const R2_JURISDICTIONS = { default: "", eu: ".eu", fedramp: ".fedramp" } as const;

export const DEFAULT_OBJECT_PATH_TEMPLATE = "phaseo/{year}/{month}/{day}/{hour}/{uuid}";
const PATH_PLACEHOLDERS = new Set(["year", "month", "day", "hour", "date", "uuid"]);

type ObjectStore = { base: URL; bucket: string; region: string; service: string };

function objectStore(id: string, config: Record<string, unknown>): ObjectStore {
	const bucket = required(config, "bucket");
	const bucketProblem = bucketError(id, bucket);
	if (bucketProblem) throw new Error(bucketProblem);
	if (id === "r2") {
		const account = required(config, "account_id").toLowerCase();
		if (!R2_ACCOUNT.test(account)) throw new Error("account_id must be the 32-character Cloudflare account ID");
		const jurisdiction = (field(config, "jurisdiction") || "default").toLowerCase();
		if (!(jurisdiction in R2_JURISDICTIONS)) throw new Error(`jurisdiction must be one of: ${Object.keys(R2_JURISDICTIONS).join(", ")}`);
		const suffix = R2_JURISDICTIONS[jurisdiction as keyof typeof R2_JURISDICTIONS];
		return { base: new URL(`https://${account}${suffix}.r2.cloudflarestorage.com/${bucket}/`), bucket, region: "auto", service: "s3" };
	}
	if (id === "gcs") {
		return { base: new URL(`https://storage.googleapis.com/${bucket}/`), bucket, region: "auto", service: "s3" };
	}
	const region = field(config, "region") || "us-east-1";
	const endpoint = field(config, "endpoint");
	if (endpoint) {
		// An S3-compatible service, addressed path-style.
		let url: URL;
		try {
			url = new URL(endpoint);
		} catch {
			throw new Error("endpoint must be a valid absolute URL");
		}
		if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
			throw new Error("endpoint must be an HTTPS URL without credentials, query or fragment");
		}
		if (!/^[a-z0-9-]{1,64}$/.test(region)) throw new Error("region must be letters, digits or hyphens");
		return { base: new URL(`${url.origin}${url.pathname.replace(/\/+$/, "")}/${bucket}/`), bucket, region, service: "s3" };
	}
	if (!AWS_REGION.test(region)) throw new Error("region must be an AWS region such as us-east-1");
	// Dotted bucket names do not match the virtual-hosted TLS certificate.
	return {
		base: bucket.includes(".")
			? new URL(`https://s3.${region}.amazonaws.com/${bucket}/`)
			: new URL(`https://${bucket}.s3.${region}.amazonaws.com/`),
		bucket,
		region,
		service: "s3",
	};
}

function pathTemplate(config: Record<string, unknown>): string {
	const template = field(config, "path_template") || DEFAULT_OBJECT_PATH_TEMPLATE;
	if (template.length > 512 || template.startsWith("/") || template.includes("//") || template.split("/").some((part) => part === "." || part === "..")) {
		throw new Error("path_template must be a relative path of at most 512 characters");
	}
	if (/[^A-Za-z0-9!_.*'()/{}=-]/.test(template)) throw new Error("path_template may use letters, digits, / and !-_.*'()= only");
	const placeholders = [...template.matchAll(/\{([^}]*)\}/g)].map((match) => match[1]);
	const unknown = placeholders.find((name) => !PATH_PLACEHOLDERS.has(name));
	if (unknown !== undefined) throw new Error(`path_template has an unknown placeholder {${unknown}}`);
	if (template.replace(/\{[^}]*\}/g, "").includes("{") || template.replace(/\{[^}]*\}/g, "").includes("}")) throw new Error("path_template has an unclosed placeholder");
	if (!placeholders.includes("uuid")) throw new Error("path_template must include {uuid} so objects never overwrite each other");
	return template;
}

// The object key for a batch written at `now`. ".jsonl.gz" is appended: the
// object is gzipped JSON lines, stored compressed so loaders that go by the
// extension (Athena, BigQuery, Snowflake) decompress it.
export function broadcastObjectKey(config: Record<string, unknown>, now: Date, uuid: string): string {
	const iso = now.toISOString();
	const values: Record<string, string> = {
		year: iso.slice(0, 4),
		month: iso.slice(5, 7),
		day: iso.slice(8, 10),
		hour: iso.slice(11, 13),
		date: iso.slice(0, 10),
		uuid,
	};
	return `${pathTemplate(config).replace(/\{([a-z]+)\}/g, (_, name: string) => values[name])}.jsonl.gz`;
}

export function isBroadcastRowsDestination(id: unknown): id is BroadcastRowsDestinationId {
	return BROADCAST_ROWS_DESTINATION_IDS.includes(id as BroadcastRowsDestinationId);
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

function identifier(config: Record<string, unknown>, name: string, fallback?: string): string {
	const value = field(config, name) || fallback || "";
	if (!value) throw new Error(`${name} is required`);
	if (!IDENTIFIER.test(value)) throw new Error(`${name} must start with a letter or underscore and use only letters, digits and underscores`);
	return value;
}

type ClickHouseTarget = { url: URL; user: string; password: string };

// https://clickhouse.com/docs/interfaces/http
// Rows are inserted as JSONEachRow. Columns the table lacks are skipped, ISO
// timestamps are read into DateTime64 columns, and attribute objects into
// String columns as JSON text (or into JSON columns as is). Async inserts let
// the server merge the many small batches Broadcast sends.
function clickHouseTarget(config: Record<string, unknown>): ClickHouseTarget {
	const endpoint = required(config, "endpoint");
	let base: URL;
	try {
		base = new URL(endpoint);
	} catch {
		throw new Error("endpoint must be a valid absolute URL");
	}
	if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
		throw new Error("endpoint must be an HTTPS URL without credentials, query or fragment");
	}
	const database = identifier(config, "database", "default");
	const table = identifier(config, "table");
	const url = new URL(base.origin + base.pathname.replace(/\/+$/, "") + "/");
	url.searchParams.set("query", `INSERT INTO \`${database}\`.\`${table}\` FORMAT JSONEachRow`);
	url.searchParams.set("input_format_skip_unknown_fields", "1");
	url.searchParams.set("date_time_input_format", "best_effort");
	url.searchParams.set("input_format_json_read_objects_as_strings", "1");
	url.searchParams.set("async_insert", "1");
	url.searchParams.set("wait_for_async_insert", "1");
	return { url, user: field(config, "username") || "default", password: required(config, "password") };
}

const BIGQUERY_PROJECT = /^([a-z][a-z0-9.-]*:)?[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const BIGQUERY_DATASET = /^[A-Za-z0-9_]{1,1024}$/;
const BIGQUERY_TABLE = /^[A-Za-z0-9_-]{1,1024}$/;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const BIGQUERY_SCOPE = "https://www.googleapis.com/auth/bigquery.insertdata";

type ServiceAccount = { client_email: string; private_key: string; project_id?: string };
type BigQueryTarget = { url: URL; account: ServiceAccount };

function serviceAccount(config: Record<string, unknown>): ServiceAccount {
	const raw = required(config, "service_account_json");
	let parsed: Json;
	try {
		parsed = object(JSON.parse(raw));
	} catch {
		throw new Error("service_account_json must be the service account's JSON key file");
	}
	if (parsed.type !== "service_account" || typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string" || !parsed.private_key.includes("BEGIN PRIVATE KEY")) {
		throw new Error("service_account_json must be the service account's JSON key file");
	}
	return {
		client_email: parsed.client_email,
		private_key: parsed.private_key,
		project_id: typeof parsed.project_id === "string" ? parsed.project_id : undefined,
	};
}

// https://cloud.google.com/bigquery/docs/reference/rest/v2/tabledata/insertAll
function bigQueryTarget(config: Record<string, unknown>): BigQueryTarget {
	const account = serviceAccount(config);
	const project = field(config, "project_id") || account.project_id || "";
	if (!project) throw new Error("project_id is required");
	if (!BIGQUERY_PROJECT.test(project)) throw new Error("project_id must be a Google Cloud project ID");
	const dataset = required(config, "dataset");
	if (!BIGQUERY_DATASET.test(dataset)) throw new Error("dataset must use only letters, digits and underscores");
	const table = required(config, "table");
	if (!BIGQUERY_TABLE.test(table)) throw new Error("table must use only letters, digits, underscores and hyphens");
	const path = ["projects", project, "datasets", dataset, "tables", table].map(encodeURIComponent).join("/");
	return { url: new URL(`https://bigquery.googleapis.com/bigquery/v2/${path}/insertAll`), account };
}

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemBytes(pem: string, label: string): Uint8Array<ArrayBuffer> {
	const body = pem.replace(/\\n/g, "\n").replace(new RegExp(`-----(BEGIN|END) ${label}-----`, "g"), "").replace(/\s+/g, "");
	let binary: string;
	try {
		binary = atob(body);
	} catch {
		throw new Error(`The ${label.toLowerCase()} is not valid PEM`);
	}
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function rsaKey(pem: string, extractable = false): Promise<CryptoKey> {
	try {
		return await crypto.subtle.importKey("pkcs8", pemBytes(pem, "PRIVATE KEY"), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, extractable, ["sign"]);
	} catch (error) {
		if (error instanceof Error && error.message.includes("not valid PEM")) throw error;
		throw new Error("The private key must be an unencrypted RSA key in PKCS #8 PEM (BEGIN PRIVATE KEY)");
	}
}

// An RS256 JSON Web Token for the claims.
export async function signRs256Jwt(claims: Json, key: CryptoKey): Promise<string> {
	const unsigned = `${base64Url(utf8.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })))}.${base64Url(utf8.encode(JSON.stringify(claims)))}`;
	const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, utf8.encode(unsigned)));
	return `${unsigned}.${base64Url(signature)}`;
}

// Access tokens last an hour; each isolate reuses one per service account until
// five minutes before it expires.
const GOOGLE_TOKEN_CACHE = new Map<string, { token: string; refreshAtMs: number }>();
const GOOGLE_TOKEN_CACHE_LIMIT = 64;

export function clearBroadcastRowsTokenCache(): void {
	GOOGLE_TOKEN_CACHE.clear();
}

async function googleAccessToken(account: ServiceAccount, send: BroadcastRowsFetch): Promise<string | BroadcastRowsResult> {
	const cacheKey = await sha256Hex(`${account.client_email}\n${account.private_key}`);
	const cached = GOOGLE_TOKEN_CACHE.get(cacheKey);
	if (cached && Date.now() < cached.refreshAtMs) return cached.token;
	const requestedAtMs = Date.now();
	const now = Math.floor(requestedAtMs / 1000);
	const assertion = await signRs256Jwt(
		{ iss: account.client_email, sub: account.client_email, aud: GOOGLE_TOKEN_URL, scope: BIGQUERY_SCOPE, iat: now, exp: now + 3600 },
		await rsaKey(account.private_key),
	);
	const response = await send(new URL(GOOGLE_TOKEN_URL), {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
	});
	const text = await boundedText(response);
	let json: Json = {};
	try {
		json = object(JSON.parse(text));
	} catch {}
	if (!response.ok || typeof json.access_token !== "string") {
		const reason = [json.error, json.error_description].filter((part) => typeof part === "string" && part).join(": ");
		return {
			ok: false,
			status: response.status,
			error: `Google sign-in for the service account failed${reason ? `: ${reason}` : ` (${response.status})`}`,
			retryAfter: response.headers.get("retry-after"),
		};
	}
	const expiresIn = Number(json.expires_in);
	if (Number.isFinite(expiresIn) && expiresIn > 600) {
		GOOGLE_TOKEN_CACHE.delete(cacheKey);
		GOOGLE_TOKEN_CACHE.set(cacheKey, { token: json.access_token, refreshAtMs: requestedAtMs + (expiresIn - 300) * 1000 });
		while (GOOGLE_TOKEN_CACHE.size > GOOGLE_TOKEN_CACHE_LIMIT) GOOGLE_TOKEN_CACHE.delete(GOOGLE_TOKEN_CACHE.keys().next().value!);
	}
	return json.access_token;
}

// insertId lets BigQuery drop a row it already received in the last minute or
// so, which covers a batch retried after a lost response. JSON values are sent
// as JSON text, which both JSON and STRING columns accept.
function bigQueryRows(rows: BroadcastRow[]) {
	return rows.map((row) => ({
		insertId: `${row.event_id}/${row.span_id}`.slice(0, 128),
		json: { ...row, attributes: JSON.stringify(row.attributes), resource_attributes: JSON.stringify(row.resource_attributes) },
	}));
}

async function sendBigQuery(config: Record<string, unknown>, rows: BroadcastRow[], send: BroadcastRowsFetch): Promise<BroadcastRowsResult> {
	const target = bigQueryTarget(config);
	const token = await googleAccessToken(target.account, send);
	if (typeof token !== "string") return token;
	const response = await send(target.url, {
		method: "POST",
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
		body: JSON.stringify({ kind: "bigquery#tableDataInsertAllRequest", skipInvalidRows: false, ignoreUnknownValues: true, rows: bigQueryRows(rows) }),
	});
	if (!response.ok) return failed(response);
	let json: Json = {};
	try {
		json = object(JSON.parse(await boundedText(response)));
	} catch {}
	const insertErrors = Array.isArray(json.insertErrors) ? json.insertErrors : [];
	// With skipInvalidRows off, one invalid row rejects the batch; the other rows
	// report "stopped". The first real error explains it.
	const errors = insertErrors.flatMap((entry) => Array.isArray(object(entry).errors) ? object(entry).errors as unknown[] : []).map(object);
	const cause = errors.find((error) => error.reason !== "stopped") ?? errors[0];
	if (cause) {
		const detail = [cause.reason, cause.location, cause.message].filter((part) => typeof part === "string" && part).join(": ");
		return { ok: false, status: response.status, error: `BigQuery rejected the rows${detail ? `: ${detail}` : ""}`.slice(0, 500), retryAfter: null };
	}
	return { ok: true, status: response.status, error: null, retryAfter: null };
}

// The base URL requests go to, after checking the config. Throws a message
// naming the field at fault.
export function broadcastRowsEndpoint(id: string, config: Record<string, unknown>): string {
	if (!isBroadcastRowsDestination(id)) throw new Error("Not a row destination");
	if (id === "clickhouse") {
		const target = clickHouseTarget(config);
		return `${target.url.origin}${target.url.pathname}`;
	}
	if (id === "bigquery") return bigQueryTarget(config).url.toString();
	const store = objectStore(id, config);
	pathTemplate(config);
	required(config, "access_key_id");
	required(config, "secret_access_key");
	return store.base.toString();
}

export type BroadcastRowsFetch = (url: URL, init: RequestInit) => Promise<Response>;

// What a write came to. status is the HTTP status of the request that decided
// it, and error a short reason taken from the destination's response.
// retryable overrides the status-based retry decision when the destination's
// error says more, such as a rate limit reported as 403.
export type BroadcastRowsResult = { ok: boolean; status: number; error: string | null; retryAfter: string | null; retryable?: boolean };

// Error bodies are read up to this many bytes, so a misbehaving endpoint cannot
// make the Worker buffer an unbounded response.
const MAX_ERROR_BODY_BYTES = 64 * 1024;

async function boundedText(response: Response): Promise<string> {
	if (!response.body) return "";
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (total < MAX_ERROR_BODY_BYTES) {
			const { done, value } = await reader.read();
			if (done) break;
			const chunk = value.subarray(0, MAX_ERROR_BODY_BYTES - total);
			chunks.push(chunk);
			total += chunk.byteLength;
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

// The useful part of an error body: an object store's XML error code, the
// message of a JSON error, an HTML page's title, or the start of the text.
function errorDetail(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	const code = /<Code>([^<]{1,100})<\/Code>/.exec(flat)?.[1];
	if (code) return code;
	if (/^<!doctype html|^<html/i.test(flat)) return /<title>([^<]{1,200})<\/title>/i.exec(flat)?.[1].trim() ?? "";
	try {
		const json = object(JSON.parse(flat));
		const message = object(json.error).message ?? json.message ?? json.error_description ?? json.error;
		if (typeof message === "string" && message.trim()) return message.replace(/\s+/g, " ").trim().slice(0, 300);
	} catch {}
	return flat.slice(0, 300);
}

async function failed(response: Response, text?: string): Promise<BroadcastRowsResult> {
	const detail = errorDetail(text ?? await boundedText(response));
	return {
		ok: false,
		status: response.status,
		error: `Destination returned ${response.status}${detail ? `: ${detail}` : ""}`,
		retryAfter: response.headers.get("retry-after"),
	};
}

async function settled(response: Response): Promise<BroadcastRowsResult> {
	if (!response.ok) return failed(response);
	await response.body?.cancel().catch(() => undefined);
	return { ok: true, status: response.status, error: null, retryAfter: null };
}

// Writes rows to the destination with `send`, which the caller uses to check
// each URL against private networks. Throws for a config that cannot be sent.
export async function sendBroadcastRows(
	id: string,
	config: Record<string, unknown>,
	rows: BroadcastRow[],
	send: BroadcastRowsFetch,
	options: { now?: Date; uuid?: string } = {},
): Promise<BroadcastRowsResult> {
	if (!isBroadcastRowsDestination(id)) throw new Error("Not a row destination");
	if (id === "bigquery") return sendBigQuery(config, rows, send);
	if (id === "clickhouse") {
		const target = clickHouseTarget(config);
		return settled(await send(target.url, {
			method: "POST",
			headers: {
				"content-type": "application/x-ndjson",
				"content-encoding": "gzip",
				"x-clickhouse-user": target.user,
				"x-clickhouse-key": target.password,
			},
			body: await gzip(jsonLines(rows)) as Uint8Array<ArrayBuffer>,
		}));
	}
	const now = options.now ?? new Date();
	const store = objectStore(id, config);
	const key = broadcastObjectKey(config, now, options.uuid ?? crypto.randomUUID());
	const url = new URL(key.split("/").map(encodeRfc3986).join("/"), store.base);
	const body = await gzip(jsonLines(rows));
	const signed = await signAwsRequest({
		method: "PUT",
		url,
		headers: { "content-type": "application/gzip" },
		payloadHash: await sha256Hex(body),
		region: store.region,
		service: store.service,
		accessKeyId: required(config, "access_key_id"),
		secretAccessKey: required(config, "secret_access_key"),
		sessionToken: field(config, "session_token") || undefined,
		now,
	});
	// Host is set by fetch from the URL.
	delete signed.host;
	return settled(await send(url, { method: "PUT", headers: signed, body: body as Uint8Array<ArrayBuffer> }));
}
