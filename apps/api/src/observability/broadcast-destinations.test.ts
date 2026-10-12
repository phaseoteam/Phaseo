import { describe, expect, it } from "vitest";
import {
	AVAILABLE_BROADCAST_DESTINATION_IDS,
	broadcastDestinationEndpoint,
	isBroadcastDestinationLimitError,
	normalizeBroadcastDestinationId,
	otlpTracesEndpoint,
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

	it("maps legacy ids and recognises the cap error", () => {
		expect(normalizeBroadcastDestinationId(" arize_ai ")).toBe("arize");
		expect(normalizeBroadcastDestinationId("webhook")).toBe("webhook");
		expect(isBroadcastDestinationLimitError({ code: "23514", message: "broadcast_destination_limit_reached" })).toBe(true);
		expect(isBroadcastDestinationLimitError(new Error("violates check constraint"))).toBe(false);
	});
});
