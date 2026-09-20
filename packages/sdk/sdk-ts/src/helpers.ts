/** Compatible with Zod schemas without requiring Zod at runtime. */
export type OutputSchema<T> = { parse(value: unknown): T };
export class StructuredOutputError extends Error {
  constructor(message: string, readonly response: unknown, cause?: unknown) {
    super(message, { cause }); this.name = "StructuredOutputError";
  }
}

export function outputText(response: unknown): string {
  const value = response as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; choices?: Array<{ message?: { content?: string } }> };
  return value.output_text ?? value.output?.flatMap(item => item.content ?? []).filter(item => item.type === "output_text").map(item => item.text ?? "").join("") ?? value.choices?.[0]?.message?.content ?? "";
}

/** Validates completed output. The caller still selects the server response_format. */
export function parseOutput<T>(response: unknown, schema: OutputSchema<T>): T {
  try { return schema.parse(JSON.parse(outputText(response))); }
  catch (cause) { throw new StructuredOutputError("Response did not match the output schema", response, cause); }
}

export class StreamResponseError extends Error {
  constructor(readonly event: unknown) { super("Generation stream ended with an error"); this.name = "StreamResponseError"; }
}

export async function collectStream<T extends { text?: string; usage?: unknown }>(events: AsyncIterable<T>): Promise<{ text: string; usage?: unknown; lastEvent?: T; finalResponse?: unknown }> {
  let text = "";
  let usage: unknown;
  let lastEvent: T | undefined;
  let finalResponse: unknown;
  for await (const event of events) {
    const value = event as T & { type?: string; response?: { output_text?: string; output?: unknown[] } };
    if (value.type === "error" || value.type === "response.failed" || value.type === "response.incomplete") throw new StreamResponseError(event);
    if (value.type === "response.completed" && value.response) {
      finalResponse = value.response;
      if (typeof value.response.output_text === "string" || Array.isArray(value.response.output)) text = outputText(value.response);
    } else if (value.type !== "response.output_text.done") text += event.text ?? "";
    if (event.usage != null) usage = event.usage;
    lastEvent = event;
  }
  return { text, usage, lastEvent, finalResponse };
}

export type CapabilityRequirements = { inputTypes?: string[]; outputTypes?: string[]; endpoints?: string[]; parameters?: string[]; parameterValues?: Record<string, string | number | boolean> };
type AdvertisedCapabilities = { endpoints?: string[]; parameters?: string[]; parameter_details?: Record<string, Record<string, unknown>> };
export type ModelCapabilities = {
  id?: string; model_id?: string | null; input_types?: string[]; output_types?: string[]; status?: string | null;
  modalities?: { input?: string[]; output?: string[] };
  availability?: { status?: string }; lifecycle?: { status?: string | null };
  capabilities?: AdvertisedCapabilities;
  offers?: Array<{ status?: string; routable?: boolean; modalities?: { input?: string[]; output?: string[] }; endpoints?: string[]; capabilities?: AdvertisedCapabilities }>;
};
export type CapabilityCheck = { ok: boolean; issues: string[] };
/** Validate declared catalogue facts. Missing metadata is unknown, never assumed supported. */
export function checkCapabilities(model: ModelCapabilities, requirements: CapabilityRequirements): CapabilityCheck {
  const issues: string[] = [];
  const status = model.lifecycle?.status === "retired" ? "retired" : model.availability?.status ?? model.status;
  if (["retired", "inactive", "disabled", "coming_soon", "not_listed"].includes(status ?? "")) issues.push(`Model is ${status}`);
  for (const [label, requested, supported] of [
    ["input", requirements.inputTypes, model.modalities?.input ?? model.input_types],
    ["output", requirements.outputTypes, model.modalities?.output ?? model.output_types],
    ["endpoint", requirements.endpoints, model.capabilities?.endpoints],
    ["parameter", [...(requirements.parameters ?? []), ...Object.keys(requirements.parameterValues ?? {})], model.capabilities?.parameters],
  ] as const) {
    for (const modality of requested ?? []) {
      if (!supported) issues.push(`${label} capabilities are unknown; cannot verify ${modality}`);
      else if (!supported.includes(modality)) issues.push(`${label} ${modality} is unsupported (supported: ${supported.join(", ") || "none"})`);
    }
  }
  if (model.offers) {
    const checks = model.offers.filter(offer => offer.status === "active" && offer.routable !== false).map(offer =>
      checkCapabilities({ ...offer, status: undefined, capabilities: { ...offer.capabilities, endpoints: offer.endpoints ?? offer.capabilities?.endpoints } }, requirements));
    if (!checks.some(check => check.ok)) issues.push("No active provider offer supports all requested capabilities together", ...new Set(checks.flatMap(check => check.issues)));
  } else {
    for (const [parameter, value] of Object.entries(requirements.parameterValues ?? {})) {
      const detail = model.capabilities?.parameter_details?.[parameter];
      if (!detail) { issues.push(`${parameter} constraints are unknown`); continue; }
      const allowed = detail.values ?? detail.enum;
      if (Array.isArray(allowed) && !allowed.includes(value)) issues.push(`${parameter} must be one of: ${allowed.join(", ")}`);
      if (typeof value === "number") {
        if (!Number.isFinite(value)) issues.push(`${parameter} must be finite`);
        if (typeof detail.minimum === "number" && value < detail.minimum) issues.push(`${parameter} must be at least ${detail.minimum}`);
        if (typeof detail.maximum === "number" && value > detail.maximum) issues.push(`${parameter} must be at most ${detail.maximum}`);
        if (typeof detail.step === "number" && detail.step > 0) {
          const steps = (value - (typeof detail.minimum === "number" ? detail.minimum : 0)) / detail.step;
          if (Math.abs(steps - Math.round(steps)) > 1e-8) issues.push(`${parameter} must use steps of ${detail.step}`);
        }
      }
      if (detail.supported === false) issues.push(`${parameter} is unsupported`);
    }
  }
  return { ok: issues.length === 0, issues };
}

export type ParameterSupportStatus = "supported" | "partial" | "unsupported" | "unknown";
export type ParameterRouteReference = {
  id: string;
  provider: string;
  endpoint: string;
  publicPath: string;
};
export type ParameterSupport = {
  name: string;
  value: unknown;
  status: ParameterSupportStatus;
  supportedBy: ParameterRouteReference[];
  acceptedBy: ParameterRouteReference[];
  unsupportedBy: ParameterRouteReference[];
  constraints: Array<{ route: ParameterRouteReference; detail: Record<string, unknown> }>;
  issues: string[];
};
export type ParameterSupportReport = {
  ok: boolean;
  modelId: string;
  routeCount: number;
  matchingRoutes: ParameterRouteReference[];
  parameters: ParameterSupport[];
  issues: string[];
};
export type ParameterSupportOptions = {
  endpoint?: string;
  provider?: string | string[];
};

type ModelEndpointCapabilityLike = {
  id?: string;
  endpoint?: string;
  capability_id?: string;
  public_path?: string;
  routable?: boolean;
  status?: string;
  provider?: { id?: string };
  capabilities?: {
    parameters?: string[];
    parameter_details?: Record<string, Record<string, unknown>>;
  };
};
type ModelEndpointsLike = { id?: string; endpoints?: ModelEndpointCapabilityLike[] };

function routeReference(route: ModelEndpointCapabilityLike): ParameterRouteReference {
  const provider = route.provider?.id ?? "unknown";
  const endpoint = route.endpoint ?? route.capability_id ?? "unknown";
  return {
    id: route.id ?? `${provider}:${endpoint}`,
    provider,
    endpoint,
    publicPath: route.public_path ?? endpoint,
  };
}

function parameterValueIssues(name: string, value: unknown, detail: Record<string, unknown>): string[] {
  const issues: string[] = [];
  if (detail.supported === false) issues.push(`${name} is unsupported`);
  const allowed = Array.isArray(detail.values) ? detail.values : Array.isArray(detail.enum) ? detail.enum : undefined;
  if (allowed && !allowed.some(item => Object.is(item, value) || JSON.stringify(item) === JSON.stringify(value))) {
    issues.push(`${name} must be one of: ${allowed.map(String).join(", ")}`);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) issues.push(`${name} must be finite`);
    if (typeof detail.minimum === "number" && value < detail.minimum) issues.push(`${name} must be at least ${detail.minimum}`);
    if (typeof detail.maximum === "number" && value > detail.maximum) issues.push(`${name} must be at most ${detail.maximum}`);
    if (typeof detail.step === "number" && detail.step > 0) {
      const steps = (value - (typeof detail.minimum === "number" ? detail.minimum : 0)) / detail.step;
      if (Math.abs(steps - Math.round(steps)) > 1e-8) issues.push(`${name} must use steps of ${detail.step}`);
    }
  }
  return issues;
}

/** Build a UI-friendly parameter support report from live model endpoint metadata. */
export function checkParameterSupport(
  model: ModelEndpointsLike,
  parameterValues: Record<string, unknown>,
  options: ParameterSupportOptions = {},
): ParameterSupportReport {
  const providers = options.provider == null
    ? undefined
    : new Set(Array.isArray(options.provider) ? options.provider : [options.provider]);
  const routes = (model.endpoints ?? []).filter(route => {
    if (route.routable !== true || route.status !== "active") return false;
    if (providers && !providers.has(route.provider?.id ?? "")) return false;
    if (!options.endpoint) return true;
    const requested = options.endpoint.replace(/^\/v1\//, "").replace(/^\//, "");
    return [route.endpoint, route.capability_id, route.public_path?.replace(/^\/v1\//, "").replace(/^\//, "")]
      .some(value => value === options.endpoint || value === requested);
  });

  const parameters = Object.entries(parameterValues).map(([name, value]): ParameterSupport => {
    const supportedBy: ParameterRouteReference[] = [];
    const acceptedBy: ParameterRouteReference[] = [];
    const unsupportedBy: ParameterRouteReference[] = [];
    const constraints: ParameterSupport["constraints"] = [];
    const valueIssues: string[] = [];
    let knownRouteCount = 0;

    for (const route of routes) {
      const reference = routeReference(route);
      const advertised = route.capabilities?.parameters;
      if (!Array.isArray(advertised)) {
        unsupportedBy.push(reference);
        continue;
      }
      knownRouteCount += 1;
      const detail = route.capabilities?.parameter_details?.[name];
      const supportsName = advertised.includes(name) || detail?.supported === true;
      if (!supportsName || detail?.supported === false) {
        unsupportedBy.push(reference);
        continue;
      }
      supportedBy.push(reference);
      if (detail) constraints.push({ route: reference, detail });
      const issues = detail ? parameterValueIssues(name, value, detail) : [];
      if (issues.length === 0) acceptedBy.push(reference);
      else valueIssues.push(...issues);
    }

    const status: ParameterSupportStatus = routes.length === 0 || knownRouteCount === 0
      ? "unknown"
      : supportedBy.length === 0
        ? "unsupported"
        : supportedBy.length === routes.length
          ? "supported"
          : "partial";
    const issues = status === "unsupported"
      ? [`${name} is not supported by any matching active route`]
      : supportedBy.length > 0 && acceptedBy.length === 0
        ? [...new Set(valueIssues)]
        : [];
    return { name, value, status, supportedBy, acceptedBy, unsupportedBy, constraints, issues };
  });

  const matchingRoutes = routes
    .filter(route => parameters.every(parameter => parameter.acceptedBy.some(candidate => candidate.id === routeReference(route).id)))
    .map(routeReference);
  const issues: string[] = [];
  if (routes.length === 0) issues.push("No active routable model endpoints matched the filters");
  else if (matchingRoutes.length === 0 && parameters.length > 0) issues.push("No active route supports all requested parameter values together");
  issues.push(...parameters.flatMap(parameter => parameter.issues));

  return {
    ok: routes.length > 0 && matchingRoutes.length > 0,
    modelId: model.id ?? "unknown",
    routeCount: routes.length,
    matchingRoutes,
    parameters,
    issues: [...new Set(issues)],
  };
}

export type BatchResult = { custom_id?: string; response?: unknown; error?: unknown; [key: string]: unknown };
/** Incremental JSONL decoder; does not buffer the entire batch. */
export async function* batchResults(stream: ReadableStream<Uint8Array>, maxLineBytes = 10 * 1024 * 1024): AsyncGenerator<BatchResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let parts: string[] = [];
  let pendingBytes = 0;
  const append = (part: string) => {
    pendingBytes += encoder.encode(part).length;
    if (pendingBytes > maxLineBytes) throw new Error("Batch result line exceeds size limit");
    if (part) parts.push(part);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      const chunk = decoder.decode(value, { stream: !done });
      let start = 0;
      let newline: number;
      while ((newline = chunk.indexOf("\n", start)) >= 0) {
        append(chunk.slice(start, newline));
        const line = parts.join("");
        if (line.trim()) yield parseBatchLine(line);
        parts = [];
        pendingBytes = 0;
        start = newline + 1;
      }
      append(chunk.slice(start));
      if (done) { const line = parts.join(""); if (line.trim()) yield parseBatchLine(line); break; }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function parseBatchLine(line: string): BatchResult {
  const value = JSON.parse(line);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a batch result object");
  return value;
}

export function matchBatchResult<T extends { custom_id: string }>(result: BatchResult, inputs: ReadonlyMap<string, T>): { input: T; result: BatchResult } {
  const input = result.custom_id ? inputs.get(result.custom_id) : undefined;
  if (!input) throw new Error(`No input found for batch result ${result.custom_id ?? "(missing custom_id)"}`);
  return { input, result };
}

/** Portable streaming download; callers can pipe to a file or browser sink. */
export async function downloadTo(stream: ReadableStream<Uint8Array>, destination: WritableStream<Uint8Array>, signal?: AbortSignal): Promise<void> {
  await stream.pipeTo(destination, { signal });
}

/** Strings are content, never implicitly interpreted as filesystem paths. */
export function toFile(input: Blob | BufferSource | string, name = "upload", type = "application/octet-stream"): File {
  if (input instanceof File) return input;
  const content = ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice() : input;
  return new File([content], name, { type: input instanceof Blob && input.type ? input.type : type });
}
