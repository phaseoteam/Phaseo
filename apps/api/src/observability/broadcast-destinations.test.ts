import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	AVAILABLE_BROADCAST_DESTINATION_IDS,
	applyOtlpTarget,
	broadcastDestinationEndpoint,
	isBroadcastDestinationLimitError,
	normalizeBroadcastDestinationId,
	OTLP_PRESETS,
	otlpTracesEndpoint,
	resolveOtlpTarget,
	type OtlpPreset,
} from "./broadcast-destinations";

describe("Broadcast destination registry", () => {
	it("lists only destinations with an exporter as available", () => {
		expect(AVAILABLE_BROADCAST_DESTINATION_IDS).toEqual(["otel_collector", "webhook"]);
	});

	it("resolves the OTLP traces endpoint the way the exporter calls it", () => {
		expect(otlpTracesEndpoint({ otlp_traces_endpoint: " https://a.example.com/custom ", otlp_endpoint: "https://b.example.com" }))
			.toBe("https://a.example.com/custom");
		expect(otlpTracesEndpoint({ otlp_endpoint: "", collector_endpoint: "https://b.example.com/otlp/" }))
			.toBe("https://b.example.com/otlp/v1/traces");
		expect(otlpTracesEndpoint({ endpoint: "https://c.example.com/v1/traces" })).toBe("https://c.example.com/v1/traces");
		expect(otlpTracesEndpoint({ url: "https://d.example.com" })).toBe("");
	});

	it("resolves endpoints by destination type", () => {
		expect(broadcastDestinationEndpoint("webhook", { url: " https://hooks.example.com ", endpoint: "https://x.example.com" }))
			.toBe("https://hooks.example.com");
		expect(broadcastDestinationEndpoint("otel_collector", { endpoint: "https://c.example.com" })).toBe("https://c.example.com/v1/traces");
		expect(broadcastDestinationEndpoint("langfuse", { endpoint: "https://c.example.com" })).toBe("");
	});

	describe("OTLP presets", () => {
		// A fixture shaped like a real vendor, registered only for these tests.
		const preset: OtlpPreset = {
			endpoint: "{base_url}/projects/{project}/v1/traces",
			defaults: { base_url: "https://intake.example.com" },
			headers: { Authorization: "{basic:public_key:secret_key}", "X-Project": "{project}" },
			protocol: "http/protobuf",
			compression: "gzip",
			resourceAttributes: { "vendor.project": "{project}" },
			attributeAliases: { "vendor.input": "gen_ai.input.messages" },
			maxAttributeLength: 5,
		};
		const config = { public_key: "pk", secret_key: "sk", project: "a b/c" };
		beforeEach(() => {
			OTLP_PRESETS.langfuse = preset;
		});
		afterEach(() => {
			delete OTLP_PRESETS.langfuse;
		});

		it("builds the endpoint, headers and settings from the vendor's fields", () => {
			expect(resolveOtlpTarget("langfuse", config)).toEqual({
				endpoint: "https://intake.example.com/projects/a%20b%2Fc/v1/traces",
				headers: { authorization: `Basic ${btoa("pk:sk")}`, "x-project": "a b/c" },
				protocol: "http/protobuf",
				compression: "gzip",
				resourceAttributes: { "vendor.project": "a b/c" },
				attributeAliases: { "vendor.input": "gen_ai.input.messages" },
				maxAttributeLength: 5,
			});
		});

		it("lets the config override the base URL, protocol, compression and headers", () => {
			const target = resolveOtlpTarget("langfuse", {
				...config,
				base_url: "https://eu.example.com/",
				otlp_protocol: "http/json",
				otlp_compression: "none",
				headers_json: JSON.stringify({ "X-Project": "override" }),
			});
			expect(target).toMatchObject({
				endpoint: "https://eu.example.com/projects/a%20b%2Fc/v1/traces",
				protocol: "http/json",
				compression: "none",
				headers: { "x-project": "override" },
			});
		});

		it("names a missing field and rejects header injection", () => {
			expect(() => resolveOtlpTarget("langfuse", { public_key: "pk", secret_key: "sk" })).toThrow("project is required");
			expect(() => resolveOtlpTarget("langfuse", { ...config, project: "a\r\nX-Evil: 1" })).toThrow("must not contain line breaks");
			expect(() => resolveOtlpTarget("langfuse", { ...config, otlp_compression: "zstd" })).toThrow("Compression must be none or gzip");
		});

		it("sets resource attributes, copies aliased attributes and truncates long values", () => {
			const payload = {
				resourceSpans: [{
					resource: { attributes: [{ key: "vendor.project", value: { stringValue: "stale" } }] },
					scopeSpans: [{ spans: [{ name: "chat", attributes: [{ key: "gen_ai.input.messages", value: { stringValue: "hello world" } }] }] }],
				}],
			};
			const applied = applyOtlpTarget(payload, resolveOtlpTarget("langfuse", config)) as typeof payload;
			expect(applied.resourceSpans[0].resource.attributes).toEqual([{ key: "vendor.project", value: { stringValue: "a b/c" } }]);
			expect(applied.resourceSpans[0].scopeSpans[0].spans[0].attributes).toEqual([
				{ key: "gen_ai.input.messages", value: { stringValue: "hello" } },
				{ key: "vendor.input", value: { stringValue: "hello" } },
			]);
			expect(payload.resourceSpans[0].scopeSpans[0].spans[0].attributes[0].value.stringValue).toBe("hello world");
		});

		it("leaves a generic collector's payload untouched", () => {
			const payload = { resourceSpans: [] };
			const target = resolveOtlpTarget("otel_collector", { endpoint: "https://c.example.com", auth_header: "Bearer x" });
			expect(target).toMatchObject({ endpoint: "https://c.example.com/v1/traces", headers: { authorization: "Bearer x" }, protocol: "http/json", compression: "none" });
			expect(applyOtlpTarget(payload, target)).toBe(payload);
		});
	});

	it("maps legacy ids and recognises the cap error", () => {
		expect(normalizeBroadcastDestinationId(" arize_ai ")).toBe("arize");
		expect(normalizeBroadcastDestinationId("webhook")).toBe("webhook");
		expect(isBroadcastDestinationLimitError({ code: "23514", message: "broadcast_destination_limit_reached" })).toBe(true);
		expect(isBroadcastDestinationLimitError(new Error("violates check constraint"))).toBe(false);
	});
});
