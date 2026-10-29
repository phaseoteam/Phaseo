import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	AVAILABLE_BROADCAST_DESTINATION_IDS,
	applyOtlpTarget,
	broadcastDestinationEndpoint,
	broadcastWebhookSignatureHeaders,
	broadcastWebhookSigningSecretError,
	isBroadcastDestinationLimitError,
	normalizeBroadcastDestinationId,
	OTLP_PRESETS,
	otlpTracesEndpoint,
	resolveOtlpTarget,
	type OtlpPreset,
} from "./broadcast-destinations";

describe("Broadcast destination registry", () => {
	it("lists only destinations with an exporter as available", () => {
		expect(AVAILABLE_BROADCAST_DESTINATION_IDS).toEqual([
			"arize", "axiom", "bigquery", "braintrust", "clickhouse", "comet_opik", "datadog", "dynatrace", "elastic", "gcs", "grafana_cloud", "honeycomb", "langfuse",
			"langsmith", "new_relic", "otel_collector", "posthog", "r2", "respan", "s3", "sentry", "snowflake", "wandb_weave", "webhook",
		]);
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
		expect(broadcastDestinationEndpoint("s3", { endpoint: "https://c.example.com" })).toBe("");
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
			OTLP_PRESETS.s3 = preset;
		});
		afterEach(() => {
			delete OTLP_PRESETS.s3;
		});

		it("builds the endpoint, headers and settings from the vendor's fields", () => {
			expect(resolveOtlpTarget("s3", config)).toEqual({
				endpoint: "https://intake.example.com/projects/a%20b%2Fc/v1/traces",
				headers: { authorization: `Basic ${btoa("pk:sk")}`, "x-project": "a b/c" },
				protocol: "http/protobuf",
				compression: "gzip",
				resourceAttributes: { "vendor.project": "a b/c" },
				attributeAliases: { "vendor.input": "gen_ai.input.messages" },
				attributeRenames: {},
				resourceAliases: {},
				indexedMessages: false,
				maxAttributeLength: 5,
				maxAttributeBytes: null,
				maxRequestBytes: null,
			});
		});

		it("lets the config override the base URL, protocol, compression and headers", () => {
			const target = resolveOtlpTarget("s3", {
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
			expect(() => resolveOtlpTarget("s3", { public_key: "pk", secret_key: "sk" })).toThrow("project is required");
			expect(() => resolveOtlpTarget("s3", { ...config, project: "a\r\nX-Evil: 1" })).toThrow("must not contain line breaks");
			expect(() => resolveOtlpTarget("s3", { ...config, otlp_compression: "zstd" })).toThrow("Compression must be none or gzip");
		});

		it("sets resource attributes, copies aliased attributes and truncates long values", () => {
			const payload = {
				resourceSpans: [{
					resource: { attributes: [{ key: "vendor.project", value: { stringValue: "stale" } }] },
					scopeSpans: [{ spans: [{ name: "chat", attributes: [{ key: "gen_ai.input.messages", value: { stringValue: "hello world" } }] }] }],
				}],
			};
			const applied = applyOtlpTarget(payload, resolveOtlpTarget("s3", config)) as typeof payload;
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

	describe("vendor presets", () => {
		const basic = (user: string, password: string) => `Basic ${btoa(`${user}:${password}`)}`;

		it("sends Langfuse traces with Basic credentials and the current ingestion version", () => {
			expect(resolveOtlpTarget("langfuse", { public_key: "pk-lf-1", secret_key: "sk-lf-1" })).toMatchObject({
				endpoint: "https://cloud.langfuse.com/api/public/otel/v1/traces",
				headers: { authorization: basic("pk-lf-1", "sk-lf-1"), "x-langfuse-ingestion-version": "4" },
				protocol: "http/protobuf",
				attributeAliases: { "langfuse.session.id": "gen_ai.conversation.id" },
			});
			expect(resolveOtlpTarget("langfuse", { public_key: "pk", secret_key: "sk", base_url: "https://us.cloud.langfuse.com/" }).endpoint)
				.toBe("https://us.cloud.langfuse.com/api/public/otel/v1/traces");
			expect(() => resolveOtlpTarget("langfuse", { public_key: "pk" })).toThrow("secret_key is required");
		});

		it("sends Datadog traces to the site's OTLP intake as LLM Observability spans", () => {
			expect(resolveOtlpTarget("datadog", { api_key: "dd" })).toMatchObject({
				endpoint: "https://otlp.datadoghq.com/v1/traces",
				headers: { "dd-api-key": "dd", "dd-otlp-source": "llmobs" },
				protocol: "http/protobuf",
				resourceAttributes: { dd_llmobs_enabled: "true" },
			});
			expect(resolveOtlpTarget("datadog", { api_key: "dd", site: "datadoghq.eu", ml_app: "support-bot" })).toMatchObject({
				endpoint: "https://otlp.datadoghq.eu/v1/traces",
				headers: { "dd-api-key": "dd", "dd-otlp-source": "llmobs", "dd-ml-app": "support-bot" },
			});
			// The API key must not be sent to a host that is not a Datadog site.
			expect(() => resolveOtlpTarget("datadog", { api_key: "dd", site: "attacker.example.com" })).toThrow("site must be one of");
		});

		it("sends LangSmith traces to the project when one is set", () => {
			expect(resolveOtlpTarget("langsmith", { api_key: "lsv2" })).toMatchObject({
				endpoint: "https://api.smith.langchain.com/otel/v1/traces",
				headers: { "x-api-key": "lsv2" },
				protocol: "http/protobuf",
			});
			expect(resolveOtlpTarget("langsmith", { api_key: "lsv2", project: "support", base_url: "https://ls.example.com/api/v1" })).toMatchObject({
				endpoint: "https://ls.example.com/api/v1/otel/v1/traces",
				headers: { "x-api-key": "lsv2", "langsmith-project": "support" },
			});
		});

		it("sends Braintrust traces to the project with a Bearer key", () => {
			expect(resolveOtlpTarget("braintrust", { api_key: "bt", project_id: "p1" })).toMatchObject({
				endpoint: "https://api.braintrust.dev/otel/v1/traces",
				headers: { authorization: "Bearer bt", "x-bt-parent": "project_id:p1" },
				protocol: "http/protobuf",
			});
			expect(() => resolveOtlpTarget("braintrust", { api_key: "bt" })).toThrow("project_id is required");
		});

		it("sends Grafana Cloud traces to the stack's OTLP gateway with Basic credentials", () => {
			expect(resolveOtlpTarget("grafana_cloud", {
				otlp_endpoint: "https://otlp-gateway-prod-us-east-0.grafana.net/otlp/",
				instance_id: "123456",
				api_key: "glc_1",
			})).toMatchObject({
				endpoint: "https://otlp-gateway-prod-us-east-0.grafana.net/otlp/v1/traces",
				headers: { authorization: basic("123456", "glc_1") },
				protocol: "http/protobuf",
				compression: "gzip",
			});
			expect(() => resolveOtlpTarget("grafana_cloud", { instance_id: "123456", api_key: "glc_1" })).toThrow("otlp_endpoint is required");
		});

		it("sends New Relic traces to the region's OTLP endpoint", () => {
			expect(resolveOtlpTarget("new_relic", { license_key: "abcNRAL" })).toMatchObject({
				endpoint: "https://otlp.nr-data.net/v1/traces",
				headers: { "api-key": "abcNRAL" },
				protocol: "http/protobuf",
				compression: "gzip",
				maxAttributeLength: 4095,
			});
			expect(resolveOtlpTarget("new_relic", { license_key: "abcNRAL", region: "eu" }).endpoint).toBe("https://otlp.eu01.nr-data.net/v1/traces");
			expect(resolveOtlpTarget("new_relic", { license_key: "abcNRAL", region: "JP" }).endpoint).toBe("https://otlp.jp.nr-data.net/v1/traces");
			expect(() => resolveOtlpTarget("new_relic", { license_key: "abcNRAL", region: "attacker.example.com" })).toThrow("region must be one of: US, EU, JP");
		});

		it("sends PostHog traces to the LLM analytics intake with the project token", () => {
			expect(resolveOtlpTarget("posthog", { api_key: "phc_1" })).toMatchObject({
				endpoint: "https://us.i.posthog.com/i/v0/ai/otel",
				headers: { authorization: "Bearer phc_1" },
				protocol: "http/protobuf",
			});
			expect(resolveOtlpTarget("posthog", { api_key: "phc_1", base_url: "https://eu.i.posthog.com/" }).endpoint)
				.toBe("https://eu.i.posthog.com/i/v0/ai/otel");
		});

		it("sends Sentry traces to the project's OTLP endpoint with its public key", () => {
			expect(resolveOtlpTarget("sentry", {
				otlp_endpoint: "https://o1.ingest.us.sentry.io/api/2/integration/otlp/v1/traces",
				public_key: "abc123",
			})).toMatchObject({
				endpoint: "https://o1.ingest.us.sentry.io/api/2/integration/otlp/v1/traces",
				headers: { "x-sentry-auth": "sentry sentry_key=abc123" },
				protocol: "http/protobuf",
			});
			expect(() => resolveOtlpTarget("sentry", { otlp_endpoint: "https://o1.ingest.sentry.io/api/2/integration/otlp/v1/traces" }))
				.toThrow("public_key is required");
		});

		it("sends Arize traces to the space and names the project on the resource", () => {
			expect(resolveOtlpTarget("arize", { api_key: "ak", space_id: "sp", project_name: "gateway" })).toMatchObject({
				endpoint: "https://otlp.arize.com/v1/traces",
				headers: { space_id: "sp", api_key: "ak" },
				protocol: "http/protobuf",
				compression: "none",
				resourceAttributes: { "openinference.project.name": "gateway" },
			});
			expect(resolveOtlpTarget("arize", { api_key: "ak", space_id: "sp", project_name: "g", base_url: "https://otlp.eu-west-1a.arize.com" }).endpoint)
				.toBe("https://otlp.eu-west-1a.arize.com/v1/traces");
			expect(() => resolveOtlpTarget("arize", { api_key: "ak", project_name: "g" })).toThrow("space_id is required");
		});

		it("sends Opik traces to the workspace's project", () => {
			expect(resolveOtlpTarget("comet_opik", { api_key: "ok", workspace: "team", project_name: "gateway" })).toMatchObject({
				endpoint: "https://www.comet.com/opik/api/v1/private/otel/v1/traces",
				headers: { authorization: "ok", "comet-workspace": "team", projectname: "gateway" },
				protocol: "http/protobuf",
			});
			expect(resolveOtlpTarget("comet_opik", { api_key: "ok", workspace: "t", project_name: "g", base_url: "https://opik.example.com/" }).endpoint)
				.toBe("https://opik.example.com/api/v1/private/otel/v1/traces");
		});

		it("sends Weave traces to the agents endpoint with the entity and project", () => {
			expect(resolveOtlpTarget("wandb_weave", { api_key: "wb", entity: "team", project: "gateway" })).toMatchObject({
				endpoint: "https://trace.wandb.ai/agents/otel/v1/traces",
				headers: { "wandb-api-key": "wb" },
				protocol: "http/protobuf",
				compression: "gzip",
				resourceAttributes: { "wandb.entity": "team", "wandb.project": "gateway" },
			});
			expect(() => resolveOtlpTarget("wandb_weave", { api_key: "wb", entity: "team" })).toThrow("project is required");
		});

		it("sends Axiom traces to the dataset's edge deployment", () => {
			expect(resolveOtlpTarget("axiom", { api_token: "xaat-1", dataset: "traces" })).toMatchObject({
				endpoint: "https://us-east-1.aws.edge.axiom.co/v1/traces",
				headers: { authorization: "Bearer xaat-1", "x-axiom-dataset": "traces" },
				protocol: "http/protobuf",
			});
			expect(resolveOtlpTarget("axiom", { api_token: "xaat-1", dataset: "traces", region: "EU" }).endpoint)
				.toBe("https://eu-central-1.aws.edge.axiom.co/v1/traces");
			expect(() => resolveOtlpTarget("axiom", { api_token: "xaat-1" })).toThrow("dataset is required");
		});

		it("sends Dynatrace traces with an access or platform token", () => {
			const config = { environment_url: "https://abc12345.live.dynatrace.com/", api_token: "dt0c01.x" };
			expect(resolveOtlpTarget("dynatrace", config)).toMatchObject({
				endpoint: "https://abc12345.live.dynatrace.com/api/v2/otlp/v1/traces",
				headers: { authorization: "Api-Token dt0c01.x" },
				protocol: "http/protobuf",
			});
			expect(resolveOtlpTarget("dynatrace", { ...config, token_type: "Platform" }).headers).toEqual({ authorization: "Bearer dt0c01.x" });
			expect(() => resolveOtlpTarget("dynatrace", { ...config, token_type: "oauth" })).toThrow("token_type must be one of: access, platform");
		});

		it("rejects a JSON override for Dynatrace, which only accepts protobuf", () => {
			const config = { environment_url: "https://abc123.live.dynatrace.com", api_token: "dt0c01.token" };
			expect(resolveOtlpTarget("dynatrace", config).protocol).toBe("http/protobuf");
			expect(resolveOtlpTarget("dynatrace", { ...config, otlp_protocol: "http/protobuf" }).protocol).toBe("http/protobuf");
			expect(() => resolveOtlpTarget("dynatrace", { ...config, otlp_protocol: "http/json" }))
				.toThrow("Protocol must be http/protobuf for this destination");
		});

		it("sends Elastic traces to the managed OTLP endpoint with an API key", () => {
			expect(resolveOtlpTarget("elastic", { otlp_endpoint: "https://d.ingest.us-east-1.aws.elastic.cloud:443", api_key: "k" })).toMatchObject({
				endpoint: "https://d.ingest.us-east-1.aws.elastic.cloud:443/v1/traces",
				headers: { authorization: "ApiKey k" },
				protocol: "http/protobuf",
			});
		});

		it("sends Honeycomb traces to the region, with a dataset only when set", () => {
			expect(resolveOtlpTarget("honeycomb", { api_key: "hc" })).toMatchObject({
				endpoint: "https://api.honeycomb.io/v1/traces",
				headers: { "x-honeycomb-team": "hc" },
				protocol: "http/protobuf",
			});
			expect(resolveOtlpTarget("honeycomb", { api_key: "hc", region: "eu", dataset: "gw" })).toMatchObject({
				endpoint: "https://api.eu1.honeycomb.io/v1/traces",
				headers: { "x-honeycomb-team": "hc", "x-honeycomb-dataset": "gw" },
			});
		});

		it("sends Respan traces with a Bearer key", () => {
			expect(resolveOtlpTarget("respan", { api_key: "rs" })).toMatchObject({
				endpoint: "https://api.respan.ai/api/v2/traces",
				headers: { authorization: "Bearer rs" },
				protocol: "http/protobuf",
			});
		});

		it("copies the conversation id to Langfuse's session attribute", () => {
			const payload = { resourceSpans: [{ scopeSpans: [{ spans: [{ attributes: [{ key: "gen_ai.conversation.id", value: { stringValue: "s1" } }] }] }] }] };
			const applied = applyOtlpTarget(payload, resolveOtlpTarget("langfuse", { public_key: "pk", secret_key: "sk" })) as typeof payload;
			expect(applied.resourceSpans[0].scopeSpans[0].spans[0].attributes).toContainEqual({ key: "langfuse.session.id", value: { stringValue: "s1" } });
		});
	});

	it("maps legacy ids and recognises the cap error", () => {
		expect(normalizeBroadcastDestinationId(" arize_ai ")).toBe("arize");
		expect(normalizeBroadcastDestinationId("webhook")).toBe("webhook");
		expect(isBroadcastDestinationLimitError({ code: "23514", message: "broadcast_destination_limit_reached" })).toBe(true);
		expect(isBroadcastDestinationLimitError(new Error("violates check constraint"))).toBe(false);
	});
});

describe("Broadcast webhook signing", () => {
	it("accepts no secret or 16 to 256 printable characters", () => {
		expect(broadcastWebhookSigningSecretError(undefined)).toBeNull();
		expect(broadcastWebhookSigningSecretError("")).toBeNull();
		expect(broadcastWebhookSigningSecretError("a".repeat(16))).toBeNull();
		expect(broadcastWebhookSigningSecretError("a".repeat(15))).toBe("Signing secret must be 16 to 256 characters");
		expect(broadcastWebhookSigningSecretError("a".repeat(257))).toBe("Signing secret must be 16 to 256 characters");
		expect(broadcastWebhookSigningSecretError("a".repeat(16) + " b")).toBe("Signing secret cannot contain spaces or control characters");
		expect(broadcastWebhookSigningSecretError(12345678901234567)).toBe("Signing secret must be text");
	});

	it("signs `${timestamp}.${body}` with HMAC-SHA256", async () => {
		// printf '1700000000.{"a":1}' | openssl dgst -sha256 -hmac 0123456789abcdef
		expect(await broadcastWebhookSignatureHeaders({ signing_secret: "0123456789abcdef" }, '{"a":1}', 1_700_000_000_500)).toEqual({
			"x-phaseo-timestamp": "1700000000",
			"x-phaseo-signature": "9eb18f493f8ec135d9eb2dad817c369bb4e9cbfa818657897a7437c1cd8c3a23",
		});
		expect(await broadcastWebhookSignatureHeaders({}, "{}")).toEqual({});
	});
});
