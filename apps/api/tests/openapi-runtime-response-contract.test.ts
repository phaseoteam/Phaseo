import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as yamlLoad } from "js-yaml";
import { describe, expect, it } from "vitest";

import worker from "@/index";

type SchemaDoc = Record<string, any>;

const SPEC_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../docs/openapi/v1/openapi.yaml",
);

const TEST_ENV = {
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
	GATEWAY_CACHE: {
		get: async () => null,
		put: async () => undefined,
		delete: async () => undefined,
		list: async () => ({ keys: [], list_complete: true, cursor: "" }),
	},
} as any;

const TEST_EXECUTION_CONTEXT = {
	waitUntil: (_promise: Promise<unknown>) => undefined,
	passThroughOnException: () => undefined,
} as any;

const SPEC_DOC = yamlLoad(fs.readFileSync(SPEC_PATH, "utf8")) as SchemaDoc;

function resolveRef(doc: SchemaDoc, ref: string): any {
	if (!ref.startsWith("#/")) {
		throw new Error(`Unsupported $ref: ${ref}`);
	}
	const segments = ref
		.slice(2)
		.split("/")
		.map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
	let current: any = doc;
	for (const segment of segments) {
		current = current?.[segment];
	}
	if (current === undefined) {
		throw new Error(`Could not resolve $ref: ${ref}`);
	}
	return current;
}

function schemaForResponse(pathName: string, method: string, status: string): any {
	const operation = SPEC_DOC.paths?.[pathName]?.[method.toLowerCase()];
	if (!operation) {
		throw new Error(`Missing OpenAPI operation for ${method.toUpperCase()} ${pathName}`);
	}
	const response = operation.responses?.[status];
	if (!response) {
		throw new Error(`Missing OpenAPI response ${status} for ${method.toUpperCase()} ${pathName}`);
	}
	const content = response.content ?? {};
	const mediaType = content["application/json"] ?? content["application/problem+json"];
	if (!mediaType?.schema) {
		throw new Error(`Missing JSON schema for ${method.toUpperCase()} ${pathName} ${status}`);
	}
	return mediaType.schema;
}

function validateSchema(doc: SchemaDoc, schema: any, value: any, pointer = "$"): string[] {
	if (!schema || typeof schema !== "object") return [];

	if (schema.$ref) {
		return validateSchema(doc, resolveRef(doc, schema.$ref), value, pointer);
	}

	if (schema.nullable && value === null) {
		return [];
	}

	if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
		const branches = schema.oneOf.map((candidate: any) =>
			validateSchema(doc, candidate, value, pointer),
		);
		if (branches.some((errors: string[]) => errors.length === 0)) {
			return [];
		}
		return [`${pointer}: value does not match any oneOf schema`];
	}

	if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
		return [`${pointer}: expected enum ${JSON.stringify(schema.enum)}, received ${JSON.stringify(value)}`];
	}

	const expectedType = schema.type;
	if (expectedType === "object" || (!expectedType && schema.properties)) {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return [`${pointer}: expected object`];
		}
		const errors: string[] = [];
		const required = Array.isArray(schema.required) ? schema.required : [];
		for (const key of required) {
			if (!(key in value)) {
				errors.push(`${pointer}.${key}: missing required property`);
			}
		}
		const properties = schema.properties ?? {};
		for (const [key, childSchema] of Object.entries(properties)) {
			if (key in value) {
				errors.push(...validateSchema(doc, childSchema, value[key], `${pointer}.${key}`));
			}
		}
		if (schema.additionalProperties === false) {
			for (const key of Object.keys(value)) {
				if (!(key in properties)) {
					errors.push(`${pointer}.${key}: additional property not allowed`);
				}
			}
		}
		return errors;
	}

	if (expectedType === "array") {
		if (!Array.isArray(value)) {
			return [`${pointer}: expected array`];
		}
		if (!schema.items) return [];
		return value.flatMap((entry, index) =>
			validateSchema(doc, schema.items, entry, `${pointer}[${index}]`),
		);
	}

	if (expectedType === "string" && typeof value !== "string") {
		return [`${pointer}: expected string`];
	}
	if (expectedType === "boolean" && typeof value !== "boolean") {
		return [`${pointer}: expected boolean`];
	}
	if (expectedType === "integer" && !(typeof value === "number" && Number.isInteger(value))) {
		return [`${pointer}: expected integer`];
	}
	if (expectedType === "number" && typeof value !== "number") {
		return [`${pointer}: expected number`];
	}

	return [];
}

async function requestJson(pathName: string, init?: RequestInit): Promise<{
	status: number;
	body: any;
}> {
	const req = new Request(`https://gateway.local${pathName}`, init);
	const response = await worker.fetch(req, TEST_ENV, TEST_EXECUTION_CONTEXT);
	const body = await response.json().catch(() => null);
	return {
		status: response.status,
		body,
	};
}

describe("OpenAPI Runtime Response Contract", () => {
	it("matches /health 200 response schema", async () => {
		const result = await requestJson("/v1/health");
		expect(result.status).toBe(200);
		const schema = schemaForResponse("/health", "get", "200");
		expect(validateSchema(SPEC_DOC, schema, result.body)).toEqual([]);
	});

	it("matches /analytics 400 response schema when access_token is missing", async () => {
		const result = await requestJson("/v1/analytics", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(result.status).toBe(400);
		const schema = schemaForResponse("/analytics", "post", "400");
		expect(validateSchema(SPEC_DOC, schema, result.body)).toEqual([]);
	});

	it("matches /analytics 200 response schema when access_token is provided", async () => {
		const result = await requestJson("/v1/analytics", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ access_token: "demo-token" }),
		});
		expect(result.status).toBe(200);
		const schema = schemaForResponse("/analytics", "post", "200");
		expect(validateSchema(SPEC_DOC, schema, result.body)).toEqual([]);
	});

	it("matches /realtime 501 response schema", async () => {
		const result = await requestJson("/v1/realtime", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(result.status).toBe(501);
		const schema = schemaForResponse("/realtime", "post", "501");
		expect(validateSchema(SPEC_DOC, schema, result.body)).toEqual([]);
	});

	it("matches /realtime/calls/{call_id} 501 response schema", async () => {
		const result = await requestJson("/v1/realtime/calls/call_test_123", {
			method: "GET",
		});
		expect(result.status).toBe(501);
		const schema = schemaForResponse("/realtime/calls/{call_id}", "get", "501");
		expect(validateSchema(SPEC_DOC, schema, result.body)).toEqual([]);
	});
});
