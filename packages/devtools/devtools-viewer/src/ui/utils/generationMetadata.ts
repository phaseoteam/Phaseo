import type { DevToolsEntry } from "@/types";

type AnyRecord = Record<string, unknown>;

export function getGenerationCorrelationMetadata(entry: DevToolsEntry): {
  gatewayRequestId?: string;
  upstreamRequestId?: string;
  nativeResponseId?: string;
  sessionId?: string;
  pricingLines: Array<Record<string, unknown> | string | number | boolean | null>;
} {
  const request = asRecord(entry.request);
  const response = asRecord(entry.response);
  const responseMetadata = asRecord(response.metadata);
  const responseUsage = asRecord(response.usage);

  return {
    gatewayRequestId: firstNonEmpty(
      entry.metadata?.request_id,
      responseMetadata.aistats_request_id,
      response.request_id
    ),
    upstreamRequestId: firstNonEmpty(
      entry.metadata?.upstream_request_id,
      response.upstream_request_id,
      response.upstreamRequestId
    ),
    nativeResponseId: firstNonEmpty(
      entry.metadata?.native_response_id,
      response.native_response_id,
      response.nativeResponseId,
      response.id,
      response.response_id
    ),
    sessionId: firstNonEmpty(
      entry.metadata?.session_id,
      request.session_id,
      response.session_id,
      response.sessionId
    ),
    pricingLines: normalizePricingLines(
      entry.metadata?.pricing_lines ??
        response.pricing_lines ??
        response.pricingLines ??
        responseUsage.pricing_lines ??
        responseUsage.pricingLines
    )
  };
}

export function getGenerationLookupId(entry: DevToolsEntry): string {
  return getGenerationCorrelationMetadata(entry).gatewayRequestId ?? entry.id;
}

export function getEntrySearchTerms(entry: DevToolsEntry): string {
  const request = asRecord(entry.request);
  const response = asRecord(entry.response);
  const correlation = getGenerationCorrelationMetadata(entry);

  return [
    correlation.gatewayRequestId,
    correlation.upstreamRequestId,
    correlation.nativeResponseId,
    correlation.sessionId,
    response.id,
    request.batch_id,
    request.input_file_id,
    response.input_file_id,
    response.output_file_id,
    response.error_file_id,
    request.file_id,
    response.filename
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function normalizePricingLines(
  value: unknown
): Array<Record<string, unknown> | string | number | boolean | null> {
  return Array.isArray(value)
    ? (value as Array<Record<string, unknown> | string | number | boolean | null>)
    : [];
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}
