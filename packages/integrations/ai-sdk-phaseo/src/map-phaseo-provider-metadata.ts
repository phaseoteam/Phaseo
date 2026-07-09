import type { SharedV3ProviderMetadata } from '@ai-sdk/provider';

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | undefined {
  return value != null && typeof value === 'object' ? (value as AnyRecord) : undefined;
}

function readString(record: AnyRecord | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readArray(record: AnyRecord | undefined, key: string): unknown[] | undefined {
  const value = record?.[key];
  return Array.isArray(value) ? value : undefined;
}

export function mapPhaseoProviderMetadata(
  payload: unknown,
  responseHeaders?: Record<string, string>
): SharedV3ProviderMetadata | undefined {
  const record = asRecord(payload);
  const metaRecord = asRecord(record?.meta);
  const routingRecord = asRecord(metaRecord?.routing);

  const metadata: Record<string, unknown> = {};

  const requestId =
    responseHeaders?.['x-request-id'] ??
    readString(record, 'request_id') ??
    readString(record, 'requestId');
  if (requestId) {
    metadata.requestId = requestId;
  }

  const responseId = readString(record, 'id');
  if (responseId) {
    metadata.responseId = responseId;
  }

  const provider = readString(record, 'provider');
  if (provider) {
    metadata.provider = provider;
  }

  const nativeResponseId =
    readString(record, 'nativeResponseId') ??
    readString(record, 'native_response_id');
  if (nativeResponseId) {
    metadata.nativeResponseId = nativeResponseId;
  }

  const sessionId =
    readString(record, 'session_id') ??
    readString(record, 'sessionId');
  if (sessionId) {
    metadata.sessionId = sessionId;
  }

  const pricingLines =
    readArray(record, 'pricing_lines') ??
    readArray(record, 'pricingLines');
  if (pricingLines) {
    metadata.pricingLines = pricingLines;
  }

  if (routingRecord) {
    metadata.routing = routingRecord;
  }

  if (Object.keys(metadata).length === 0) {
    return undefined;
  }

  return {
    'phaseo': metadata as SharedV3ProviderMetadata[string],
  };
}

export function mergePhaseoProviderMetadata(
  current: SharedV3ProviderMetadata | undefined,
  next: SharedV3ProviderMetadata | undefined
): SharedV3ProviderMetadata | undefined {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }

  return {
    ...current,
    'phaseo': {
      ...(current['phaseo'] ?? {}),
      ...(next['phaseo'] ?? {}),
    },
  };
}
