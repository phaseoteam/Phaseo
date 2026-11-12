import { describe, expect, it } from "vitest";
import { decodeOtlpTraceResponse, encodeOtlpTraceRequest } from "./otlp-protobuf";

// Bytes checked against protobufjs with the opentelemetry-proto v1.11.1 .proto
// files: decoding them gives this payload back, and re-encoding them gives
// identical bytes.
const GOLDEN_PAYLOAD = {
	resourceSpans: [{
		resource: { attributes: [{ key: "service.name", value: { stringValue: "phaseo-gateway" } }] },
		scopeSpans: [{
			scope: { name: "phaseo.gateway.gen_ai", version: "1.0.0" },
			schemaUrl: "https://opentelemetry.io/schemas/gen-ai/1.42.0",
			spans: [{
				traceId: "0af7651916cd43dd8448eb211c80319c",
				spanId: "b7ad6b7169203331",
				parentSpanId: "00f067aa0ba902b7",
				flags: 1,
				name: "chat gpt-5",
				kind: 3,
				startTimeUnixNano: "1760270400000000000",
				endTimeUnixNano: "1760270401500000000",
				attributes: [
					{ key: "gen_ai.usage.input_tokens", value: { intValue: "-42" } },
					{ key: "phaseo.cost.usd", value: { doubleValue: 0.125 } },
					{ key: "phaseo.cached", value: { boolValue: false } },
					{ key: "tags", value: { arrayValue: { values: [{ stringValue: "a" }] } } },
				],
				events: [{ timeUnixNano: "1760270400500000000", name: "first_token" }],
				links: [{ traceId: "11111111111111111111111111111111", spanId: "2222222222222222", flags: 1 }],
				status: { code: 2, message: "HTTP 503" },
			}],
		}],
	}],
};
const GOLDEN_HEX = [
	"0afd020a220a200a0c736572766963652e6e616d6512100a0e70686173656f2d6761746577617912d6020a1e0a157068",
	"6173656f2e676174657761792e67656e5f61691205312e302e301283020a100af7651916cd43dd8448eb211c80319c12",
	"08b7ad6b7169203331220800f067aa0ba902b72a0a63686174206770742d353003390080a23c9abc6d184100af0a969a",
	"bc6d184a280a1967656e5f61692e75736167652e696e7075745f746f6b656e73120b18d6ffffffffffffffff014a1c0a",
	"0f70686173656f2e636f73742e757364120921000000000000c03f4a130a0d70686173656f2e63616368656412021000",
	"4a0f0a047461677312072a050a030a01615a160900e56f5a9abc6d18120b66697273745f746f6b656e6a210a10111111",
	"111111111111111111111111111208222222222222222235010000007a0c120848545450203530331802850101000000",
	"1a2e68747470733a2f2f6f70656e74656c656d657472792e696f2f736368656d61732f67656e2d61692f312e34322e30",
].join("");

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const unhex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));

describe("OTLP protobuf encoding", () => {
	it("matches the reference encoding of a trace export", () => {
		expect(hex(encodeOtlpTraceRequest(GOLDEN_PAYLOAD))).toBe(GOLDEN_HEX);
	});

	it("accepts enum names and numbers alike, and skips malformed ids", () => {
		const span = (overrides: Record<string, unknown>) => ({ resourceSpans: [{ scopeSpans: [{ spans: [{ name: "s", ...overrides }] }] }] });
		expect(encodeOtlpTraceRequest(span({ kind: "SPAN_KIND_CLIENT", status: { code: "STATUS_CODE_ERROR" } })))
			.toEqual(encodeOtlpTraceRequest(span({ kind: 3, status: { code: 2 } })));
		expect(encodeOtlpTraceRequest(span({ traceId: "not-hex", spanId: "abc" })))
			.toEqual(encodeOtlpTraceRequest(span({})));
	});

	it("encodes an empty export as no bytes", () => {
		expect(encodeOtlpTraceRequest({ resourceSpans: [] })).toEqual(new Uint8Array());
	});
});

describe("OTLP protobuf responses", () => {
	it("reads partial success and ignores malformed bodies", () => {
		// partial_success { rejected_spans: 7, error_message: "bad span" }
		expect(decodeOtlpTraceResponse(unhex("0a0c08071208626164207370616e")))
			.toEqual({ rejectedSpans: 7, errorMessage: "bad span" });
		expect(decodeOtlpTraceResponse(new Uint8Array())).toEqual({ rejectedSpans: 0, errorMessage: "" });
		expect(decodeOtlpTraceResponse(unhex("0a0508"))).toEqual({ rejectedSpans: 0, errorMessage: "" });
	});
});
