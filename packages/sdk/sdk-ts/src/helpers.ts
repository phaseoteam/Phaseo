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

export type BatchResult = { custom_id?: string; response?: unknown; error?: unknown; [key: string]: unknown };
/** Incremental JSONL decoder; does not buffer the entire batch. */
export async function* batchResults(stream: ReadableStream<Uint8Array>, maxLineBytes = 10 * 1024 * 1024): AsyncGenerator<BatchResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
        if (new TextEncoder().encode(line).length > maxLineBytes) throw new Error("Batch result line exceeds size limit");
        if (line.trim()) yield parseBatchLine(line);
      }
      if (new TextEncoder().encode(pending).length > maxLineBytes) throw new Error("Batch result line exceeds size limit");
      if (done) { if (pending.trim()) yield parseBatchLine(pending); break; }
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
