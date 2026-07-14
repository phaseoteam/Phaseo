import { describe, expect, it } from "vitest";
import type { DevToolsEntry } from "@/types";
import {
  getEntrySearchTerms,
  getGenerationCorrelationMetadata,
  getGenerationLookupId
} from "@/utils/generationMetadata";

function makeEntry(overrides: Partial<DevToolsEntry> = {}): DevToolsEntry {
  return {
    id: "entry_123",
    type: "responses",
    timestamp: Date.now(),
    duration_ms: 42,
    request: {},
    response: null,
    error: null,
    metadata: {
      sdk: "typescript",
      sdk_version: "0.0.0",
      stream: false
    },
    ...overrides
  };
}

describe("generationMetadata", () => {
  it("prefers explicit metadata correlation fields and pricing lines", () => {
    const entry = makeEntry({
      request: { session_id: "session_request" },
      response: {
        request_id: "req_response",
        upstream_request_id: "upstream_response",
        native_response_id: "native_response",
        pricing_lines: [{ dimension: "input_tokens", units: 12 }]
      },
      metadata: {
        sdk: "typescript",
        sdk_version: "0.0.0",
        stream: false,
        request_id: "req_metadata",
        session_id: "session_metadata",
        upstream_request_id: "upstream_metadata",
        native_response_id: "native_metadata",
        pricing_lines: [{ dimension: "output_tokens", units: 3 }]
      }
    });

    expect(getGenerationCorrelationMetadata(entry)).toEqual({
      gatewayRequestId: "req_metadata",
      upstreamRequestId: "upstream_metadata",
      nativeResponseId: "native_metadata",
      sessionId: "session_metadata",
      pricingLines: [{ dimension: "output_tokens", units: 3 }]
    });
    expect(getGenerationLookupId(entry)).toBe("req_metadata");
  });

  it("falls back to response and request fields when metadata is absent", () => {
    const entry = makeEntry({
      request: { session_id: "session_request", file_id: "file_123" },
      response: {
        metadata: { phaseo_request_id: "req_gateway" },
        request_id: "req_response",
        upstreamRequestId: "upstream_response",
        id: "native_response",
        usage: {
          pricingLines: [{ amount: 1.23 }]
        },
        filename: "report.json"
      }
    });

    expect(getGenerationCorrelationMetadata(entry)).toEqual({
      gatewayRequestId: "req_gateway",
      upstreamRequestId: "upstream_response",
      nativeResponseId: "native_response",
      sessionId: "session_request",
      pricingLines: [{ amount: 1.23 }]
    });
    expect(getGenerationLookupId(entry)).toBe("req_gateway");
    expect(getEntrySearchTerms(entry)).toContain("req_gateway");
    expect(getEntrySearchTerms(entry)).toContain("upstream_response");
    expect(getEntrySearchTerms(entry)).toContain("native_response");
    expect(getEntrySearchTerms(entry)).toContain("session_request");
    expect(getEntrySearchTerms(entry)).toContain("file_123");
    expect(getEntrySearchTerms(entry)).toContain("report.json");
  });

  it("falls back to the telemetry entry id when no gateway request id exists", () => {
    const entry = makeEntry();

    expect(getGenerationLookupId(entry)).toBe("entry_123");
    expect(getGenerationCorrelationMetadata(entry)).toEqual({
      gatewayRequestId: undefined,
      upstreamRequestId: undefined,
      nativeResponseId: undefined,
      sessionId: undefined,
      pricingLines: []
    });
  });
});
