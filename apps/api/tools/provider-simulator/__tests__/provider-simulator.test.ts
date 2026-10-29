import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSchemaDocument, validateAgainstSchema } from "../src/schema";
import { comparePrefix, inventedFields, traceSentinels } from "../src/trace";
import { setupSimulatorRuntime, simulatorBindings, teardownSimulatorRuntime } from "../src/env";
import { withCapturedFetch } from "../src/fetch-capture";
import { buildClientMatrix } from "../src/client-requests";
import { listSimProviders } from "../src/providers";
import { runRequest } from "../src/request-pipeline";
import { deliverToClient } from "../src/response-pipeline";
import { detectDialect } from "../src/dialects";
import { maxVariant } from "../src/response-variants";
import { resolveSpec } from "../src/spec-registry";

// Serve the sampled routes and price cards from a small fixture instead of the catalogue files.
vi.mock("../src/catalogue", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/catalogue")>();
	const { SIM_CATALOGUE_PRICE_CARDS, SIM_CATALOGUE_ROUTES } = await import("./catalogue-fixture");
	return {
		...actual,
		loadCatalogueRoutes: () => new Map(Object.entries(SIM_CATALOGUE_ROUTES)),
		loadCataloguePriceCard: (providerId: string, apiModelId: string) =>
			SIM_CATALOGUE_PRICE_CARDS[`${providerId}:${apiModelId}`] ?? null,
	};
});

describe("schema validator", () => {
	const doc = createSchemaDocument({
		components: {
			schemas: {
				Part: {
					oneOf: [
						{ type: "object", properties: { type: { const: "text" }, text: { type: "string" } }, required: ["type", "text"] },
						{ type: "object", properties: { type: { const: "image" }, url: { type: "string" } }, required: ["type", "url"] },
					],
				},
				Request: {
					type: "object",
					properties: {
						model: { type: "string" },
						effort: { type: "string", enum: ["low", "high"] },
						choice: { anyOf: [{ type: "string" }, { type: "object", properties: { name: { type: "string" } } }], nullable: true },
						parts: { type: "array", items: { $ref: "#/components/schemas/Part" } },
						extra: { type: "object", additionalProperties: true },
					},
					required: ["model"],
				},
			},
		},
	});
	const schema = { $ref: "#/components/schemas/Request" };

	it("reports undeclared fields, enum values and missing required fields", () => {
		const issues = validateAgainstSchema(doc, schema, { effort: "max", stray: 1 });
		expect(issues.map((issue) => `${issue.path}:${issue.kind}`).sort()).toEqual([
			"$.effort:enum_mismatch",
			"$.model:missing_required",
			"$.stray:unknown_field",
		]);
	});

	it("allows null on a nullable anyOf and open objects", () => {
		expect(validateAgainstSchema(doc, schema, { model: "m", choice: null, extra: { anything: true } })).toEqual([]);
		expect(validateAgainstSchema(doc, schema, { model: "m", choice: "auto" })).toEqual([]);
	});

	it("selects oneOf branches by the type discriminator", () => {
		expect(validateAgainstSchema(doc, schema, { model: "m", parts: [{ type: "image", url: "u" }] })).toEqual([]);
		const issues = validateAgainstSchema(doc, schema, { model: "m", parts: [{ type: "audio", data: "x" }] });
		expect(issues).toEqual([{ path: "$.parts[0].type", kind: "enum_mismatch", detail: "\"audio\" not in [\"text\", \"image\"]" }]);
	});
});

describe("sentinel tracing", () => {
	it("classifies forwarded, renamed, stringified, changed and dropped values", () => {
		const client = { temperature: 0.37, max_tokens: 777, top_k: 41, user: "sim-user-4c1", messages: [{ content: "SIM-A" }, { content: "SIM-B" }] };
		const upstream = { temperature: 0.37, max_output_tokens: 777, top_k: 40, input: [{ text: "SIM-A" }, { text: JSON.stringify([{ text: "SIM-B" }]) }] };
		const fates = Object.fromEntries(traceSentinels(client, upstream, JSON.stringify(upstream)).map((fate) => [fate.clientPath, fate.fate]));
		expect(fates).toEqual({
			"$.temperature": "forwarded",
			"$.max_tokens": "renamed",
			"$.top_k": "changed",
			"$.user": "dropped",
			"$.messages[0].content": "forwarded",
			"$.messages[1].content": "stringified",
		});
	});

	it("lists upstream fields the client never sent", () => {
		expect(inventedFields({ model: "m", messages: [] }, { model: "m", messages: [], store: false, stream_options: { include_usage: true } })).toEqual([
			{ path: "$.store", value: false },
			{ path: "$.stream_options.include_usage", value: true },
		]);
	});

	it("flags a cacheable prefix that changes between agent steps, ignoring moved cache markers", () => {
		const step1 = { tools: [{ name: "a" }], messages: [{ role: "user", content: "hi", cache_control: { type: "ephemeral" } }] };
		const step2 = { tools: [{ name: "a" }], messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }] };
		expect(comparePrefix(step1, step2).stable).toBe(true);
		expect(comparePrefix(step1, { ...step2, tools: [{ name: "b" }] }).stable).toBe(false);
	});
});

describe("offline guarantees", () => {
	it("never carries a real credential", () => {
		const bindings = simulatorBindings() as unknown as Record<string, unknown>;
		for (const [key, value] of Object.entries(bindings)) {
			if (/KEY|TOKEN|SECRET|_PAT$/.test(key) && typeof value === "string" && value) expect(value.startsWith("sim-"), key).toBe(true);
		}
	});

	it("routes every fetch to the responder and restores the global fetch", async () => {
		const original = globalThis.fetch;
		const { calls } = await withCapturedFetch(() => new Response("ok"), async () => {
			await fetch("https://api.example.invalid/v1/chat/completions", { method: "POST", body: "{}" });
		});
		expect(calls).toHaveLength(1);
		expect(globalThis.fetch).toBe(original);
	});
});

describe("gateway path", () => {
	beforeAll(() => setupSimulatorRuntime());
	afterAll(() => teardownSimulatorRuntime());

	const matrix = buildClientMatrix();
	const scenario = (id: string) => matrix.scenarios.find((entry) => entry.id === id)!;

	it("covers every documented top-level request parameter of the three text surfaces", () => {
		for (const surface of ["chat", "responses", "messages"] as const) {
			for (const param of matrix.coverage[surface].documented) {
				expect(matrix.scenarios.some((entry) => entry.surface === surface && entry.param === param), `${surface}.${param}`).toBe(true);
			}
		}
	});

	it("captures the Anthropic Messages request a Chat Completions client produces", async () => {
		const provider = listSimProviders((id) => id === "anthropic")[0];
		const run = await runRequest({ scenario: scenario("chat.tools.probe"), route: provider.sampled[0], requestId: "req_test_1" });
		expect(run.providerCall?.url).toBe("https://api.anthropic.com/v1/messages");
		expect(detectDialect(run.providerCall!.url)).toBe("anthropic-messages");
		expect(run.providerCall?.bodyJson.tools.map((tool: any) => tool.name)).toEqual(["sim_tool_weather", "sim_tool_search"]);
		expect(run.providerCall?.headers["x-api-key"]).toMatch(/^sim-/);
		expect(resolveSpec("anthropic", "anthropic-messages")?.entry.kind).toBe("own");
	});

	it("delivers a synthesised streamed response back to a buffered client with tool calls intact", async () => {
		const provider = listSimProviders((id) => id === "groq")[0];
		const route = provider.sampled[0];
		const run = await runRequest({ scenario: scenario("chat.tools.probe"), route, requestId: "req_test_2", variant: maxVariant(), clientStream: false });
		expect(run.result?.kind).toBe("stream");
		const outcome = await deliverToClient({ result: run.result!, mode: "buffered", surface: "chat", body: run.parsedBody, requestId: "req_test_2", route });
		expect(outcome.clientJson?.choices?.[0]?.message?.tool_calls?.map((call: any) => call.id)).toEqual(["call_SIM_UP_0001", "call_SIM_UP_0002"]);
		expect(outcome.shapedUsage?.input_tokens).toBe(100_003);
	});
});
