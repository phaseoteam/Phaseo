import { describe, expect, it } from "vitest";
import { metadataTraceContext, parseW3cTraceContext, requestMetadata } from "./trace-context";

describe("requestMetadata", () => {
	it("keeps scalar values as strings and drops the rest", () => {
		expect(requestMetadata({
			trace_name: "checkout",
			attempt: 2,
			retry: false,
			nested: { a: 1 },
			list: ["a"],
			empty: null,
			[`k${"x".repeat(64)}`]: "too long",
		})).toEqual({ trace_name: "checkout", attempt: "2", retry: "false" });
	});

	it("caps value length and key count", () => {
		const many = Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`key_${index}`, "v"]));
		expect(Object.keys(requestMetadata(many) ?? {})).toHaveLength(64);
		expect(requestMetadata({ note: "a".repeat(600) })?.note).toHaveLength(512);
	});

	it("returns null for anything but a non-empty object", () => {
		expect(requestMetadata(null)).toBeNull();
		expect(requestMetadata("trace")).toBeNull();
		expect(requestMetadata(["a"])).toBeNull();
		expect(requestMetadata({ nested: {} })).toBeNull();
	});
});

describe("metadataTraceContext", () => {
	it("uses a 32-hex trace ID or UUID as is", () => {
		expect(metadataTraceContext({ trace_id: "4BF92F3577B34DA6A3CE929D0E0E4736" })?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
		expect(metadataTraceContext({ trace_id: "4bf92f35-77b3-4da6-a3ce-929d0e0e4736" })?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
	});

	it("hashes any other string to the same trace ID every time", () => {
		const first = metadataTraceContext({ trace_id: "conversation-42" });
		const again = metadataTraceContext({ trace_id: "conversation-42" });
		const other = metadataTraceContext({ trace_id: "conversation-43" });
		expect(first?.traceId).toMatch(/^[0-9a-f]{32}$/);
		expect(again?.traceId).toBe(first?.traceId);
		expect(other?.traceId).not.toBe(first?.traceId);
		expect(metadataTraceContext({ trace_id: "0".repeat(32) })?.traceId).not.toBe("0".repeat(32));
	});

	it("uses parent_span_id only when it is a valid span ID", () => {
		expect(metadataTraceContext({ trace_id: "t", parent_span_id: "00F067AA0BA902B7" })?.parentSpanId).toBe("00f067aa0ba902b7");
		expect(metadataTraceContext({ trace_id: "t", parent_span_id: "span-1" })?.parentSpanId).toBe("");
		expect(metadataTraceContext({ parent_span_id: "00f067aa0ba902b7" })).toBeNull();
		expect(metadataTraceContext(null)).toBeNull();
	});
});
