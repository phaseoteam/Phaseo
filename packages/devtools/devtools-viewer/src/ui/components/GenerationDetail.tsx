import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Clock3,
  Database,
  FileJson,
  Hash,
  Layers3,
  MessageSquareText,
  Server,
  Timer,
  Wallet,
  Workflow
} from "lucide-react";
import type { DevToolsEntry } from "@/types";
import { safeJson } from "@/utils/format";

interface GenerationDetailProps {
  id: string;
}

type AnyRecord = Record<string, any>;

const SDK_BADGE_MAP: Record<string, { label: string; icon: string; darkIcon?: string }> = {
  typescript: { label: "TypeScript", icon: "/languages/typescript.svg" },
  python: { label: "Python", icon: "/languages/python.svg" },
  go: { label: "Go", icon: "/languages/golang_light.svg", darkIcon: "/languages/golang_dark.svg" },
  csharp: { label: "C#", icon: "/languages/csharp.svg" },
  java: { label: "Java", icon: "/languages/java.svg" },
  php: { label: "PHP", icon: "/languages/php_light.svg", darkIcon: "/languages/php_dark.svg" },
  ruby: { label: "Ruby", icon: "/languages/ruby.svg" },
  rust: { label: "Rust", icon: "/languages/rust_light.svg", darkIcon: "/languages/rust_dark.svg" },
  cpp: { label: "C++", icon: "/languages/c-plusplus.svg" }
};

export function GenerationDetail({ id }: GenerationDetailProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["generation", id],
    queryFn: async () => {
      const res = await fetch(`/api/generations/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch generation: ${res.status} ${errorText}`);
      }
      return (await res.json()) as DevToolsEntry;
    }
  });

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading request details...</div>;
  }

  if (error || !data) {
    return (
      <div className="p-6 text-destructive">
        <div className="text-lg font-semibold mb-2">Failed to load request details</div>
        <div className="text-sm">{error instanceof Error ? error.message : "Unknown error"}</div>
      </div>
    );
  }

  const requestRaw = data.request;
  const responseRaw = data.response;
  const request = asRecord(requestRaw);
  const response = asRecord(responseRaw);
  const endpointLabel = formatEndpointLabel(data.type);
  const model = firstNonEmpty(
    data.metadata.model,
    request.model,
    response.model,
    response.actual_model,
    "Unknown"
  );
  const provider = firstNonEmpty(data.metadata.provider, response.provider, "N/A");
  const sdkVersion = data.metadata.sdk_version ? ` v${data.metadata.sdk_version}` : "";
  const sdkLabel = `${getSdkLabel(data.metadata.sdk)}${sdkVersion}`;
  const completed = !data.error;
  const upstreamRequestId = firstNonEmpty(
    response.nativeResponseId,
    response.id,
    response.response_id,
    response.request_id
  );
  const gatewayRequestId = firstNonEmpty(response?.metadata?.aistats_request_id, response?.request_id);
  const canonicalRequestId = gatewayRequestId ?? data.id;
  const statusLabel = completed ? "Success" : "Error";
  const finishReason = firstNonEmpty(
    response?.choices?.[0]?.finish_reason,
    response?.incomplete_details?.reason,
    response?.status
  );
  const resolvedUsage = resolveUsage(data, response);
  const resolvedCost = resolveCost(data, response);

  const tokenMetrics = [
    { label: "Prompt Tokens", value: formatMaybeNumber(resolvedUsage.prompt_tokens) },
    { label: "Completion Tokens", value: formatMaybeNumber(resolvedUsage.completion_tokens) },
    { label: "Total Tokens", value: formatMaybeNumber(resolvedUsage.total_tokens) }
  ];

  const topFacts: Array<{ label: string; value: string; copyable?: boolean; className?: string }> = [
    { label: "Endpoint", value: endpointLabel, copyable: false },
    { label: "Model", value: model, copyable: true },
    { label: "SDK", value: sdkLabel, copyable: false },
    { label: "Timestamp", value: formatDateTime(data.timestamp), copyable: false },
    { label: "Provider", value: provider, copyable: false },
    { label: "Request ID", value: canonicalRequestId, copyable: true }
  ];

  return (
    <div className="p-6 space-y-5">
      <section className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{endpointLabel}</div>
            <h2 className="text-xl font-semibold">{model}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill isError={!completed} label={statusLabel} />
            <SdkPill sdk={data.metadata.sdk} />
            {data.metadata.stream && (
              <Pill className="border border-border/60 bg-muted/60 text-muted-foreground">Streaming</Pill>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topFacts.map((fact) => (
            <FactCard
              key={fact.label}
              label={fact.label}
              value={fact.value}
              copyable={fact.copyable}
              className={fact.className}
            />
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard icon={Timer} label="Duration" value={`${data.duration_ms}ms`} />
          <MetricCard icon={Wallet} label="Cost" value={formatCost(resolvedCost)} />
          <MetricCard icon={Server} label="Provider" value={provider} />
          {tokenMetrics.map((metric) => (
            <MetricCard key={metric.label} icon={Hash} label={metric.label} value={metric.value} />
          ))}
        </div>
      </section>

      <StepCard
        step={1}
        title="Request"
        right={(
          <div className="text-xs text-muted-foreground">
            {request.model ? `model: ${request.model}` : "request payload"}
          </div>
        )}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Input" icon={MessageSquareText}>
            <RequestHighlights entry={data} request={request} requestRaw={requestRaw} />
          </Panel>
          <Panel title="Parameters" icon={Workflow}>
            <KeyValueList rows={extractRequestRows(request)} />
          </Panel>
        </div>
        <JsonDetails title="Raw Request JSON" value={requestRaw} defaultOpen={false} />
      </StepCard>

      <StepCard
        step={2}
        title="Response"
        right={(
          <div className="text-xs text-muted-foreground">
            {finishReason ? `finish: ${finishReason}` : completed ? "completed" : "failed"}
          </div>
        )}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Output" icon={Layers3}>
            <ResponseHighlights entry={data} response={response} responseRaw={responseRaw} />
          </Panel>
          <Panel title="Response Facts" icon={Clock3}>
            <KeyValueList
              rows={[
                { label: "Status", value: statusLabel },
                { label: "Finish Reason", value: finishReason ?? "N/A" },
                { label: "Provider", value: provider },
                { label: "Object", value: firstNonEmpty(response.object, "N/A") },
                { label: "Upstream Request ID", value: upstreamRequestId ?? "N/A" }
              ]}
            />
          </Panel>
        </div>
        {data.response ? (
          <JsonDetails title="Raw Response JSON" value={data.response} defaultOpen={false} />
        ) : (
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
            No response payload was recorded for this request.
          </div>
        )}
      </StepCard>

      <StepCard step={3} title="Diagnostics & Metadata">
        {data.error ? (
          <div className="rounded-xl border border-destructive/35 bg-destructive/10 p-4 space-y-3">
            <div className="flex items-center gap-2 text-destructive font-medium">
              <AlertTriangle className="h-4 w-4" />
              Request failed
            </div>
            <pre className="text-xs whitespace-pre-wrap break-words rounded-lg border border-destructive/20 bg-background/70 p-3">
              {data.error.message}
            </pre>
            {data.error.stack && (
              <details>
                <summary className="cursor-pointer text-xs font-medium text-destructive">Stack Trace</summary>
                <pre className="mt-2 text-xs whitespace-pre-wrap break-words rounded-lg border border-destructive/20 bg-background/70 p-3">
                  {data.error.stack}
                </pre>
              </details>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Request completed without SDK-side errors.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Transport & Runtime" icon={Server}>
            <KeyValueList
              rows={[
                { label: "SDK", value: sdkLabel },
                { label: "Gateway Request ID", value: gatewayRequestId ?? "N/A" },
                { label: "Telemetry Entry ID", value: data.id },
                { label: "Stream", value: data.metadata.stream ? "true" : "false" },
                { label: "Chunks", value: formatMaybeNumber(data.metadata.chunk_count) },
                { label: "HTTP Status", value: formatMaybeNumber(data.metadata.status_code) }
              ]}
            />
          </Panel>
          <Panel title="Metadata" icon={Database}>
            <JsonPreview value={data.metadata} />
          </Panel>
        </div>
        <JsonDetails title="Full Entry JSON" value={data} defaultOpen={false} />
      </StepCard>
    </div>
  );
}

function RequestHighlights({
  entry,
  request,
  requestRaw
}: {
  entry: DevToolsEntry;
  request: AnyRecord;
  requestRaw: unknown;
}) {
  const normalizedMessages = normalizeMessages(entry.type, request);

  if (normalizedMessages.length > 0) {
    return (
      <div className="space-y-2">
        {normalizedMessages.map((message, idx) => (
          <div key={`${message.role}-${idx}`} className="rounded-lg border border-border/60 bg-background/70 p-3">
            <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{message.role}</div>
            <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>
          </div>
        ))}
      </div>
    );
  }

  if (entry.type.startsWith("images.")) {
    return (
      <KeyValueList
        rows={[
          { label: "Prompt", value: stringifyValue(request.prompt) },
          { label: "Size", value: stringifyValue(request.size) },
          { label: "Count", value: stringifyValue(request.n) },
          { label: "Quality", value: stringifyValue(request.quality) }
        ]}
      />
    );
  }

  if (entry.type.startsWith("audio.")) {
    return (
      <KeyValueList
        rows={[
          { label: "Input", value: stringifyValue(request.input) },
          { label: "Voice", value: stringifyValue(request.voice) },
          { label: "Language", value: stringifyValue(request.language) },
          { label: "Response Format", value: stringifyValue(request.response_format) }
        ]}
      />
    );
  }

  if (entry.type === "moderations") {
    return <TextPreview value={request.input} />;
  }

  if (entry.type === "embeddings") {
    return (
      <KeyValueList
        rows={[
          { label: "Input", value: previewValue(request.input) },
          { label: "Dimensions", value: stringifyValue(request.dimensions) },
          { label: "Encoding", value: stringifyValue(request.encoding_format) }
        ]}
      />
    );
  }

  return <JsonPreview value={requestRaw} />;
}

function ResponseHighlights({
  entry,
  response,
  responseRaw
}: {
  entry: DevToolsEntry;
  response: AnyRecord;
  responseRaw: unknown;
}) {
  if (!entry.response) {
    return (
      <div className="rounded-lg border border-border/60 bg-background/70 p-3 text-sm text-muted-foreground">
        No response captured.
      </div>
    );
  }

  if (entry.type === "chat.completions") {
    const choices = Array.isArray(response.choices) ? response.choices : [];
    if (choices.length === 0) return <JsonPreview value={response} />;
    return (
      <div className="space-y-3">
        {choices.map((choice: AnyRecord, idx: number) => (
          <div key={idx} className="rounded-lg border border-border/60 bg-background/70 p-3">
            <div className="text-xs text-muted-foreground mb-1">choice {idx + 1}</div>
            <div className="text-sm whitespace-pre-wrap break-words">
              {previewValue(choice?.message?.content ?? choice?.text ?? choice)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entry.type === "responses") {
    const outputText = firstNonEmpty(response.output_text, extractOutputText(response.output));
    const outputItems = Array.isArray(response.output) ? response.output : [];
    return (
      <div className="space-y-3">
        {outputText ? (
          <div className="rounded-lg border border-border/60 bg-background/70 p-3">
            <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Assistant Output</div>
            <div className="text-sm whitespace-pre-wrap break-words max-h-80 overflow-auto">
              {outputText}
            </div>
          </div>
        ) : null}
        {outputItems.length > 0 ? (
          <div className="space-y-2">
            {outputItems.map((item: AnyRecord, idx: number) => (
              <ResponseOutputItemCard key={idx} item={item} />
            ))}
          </div>
        ) : null}
        {!outputText && outputItems.length === 0 ? <JsonPreview value={response} /> : null}
      </div>
    );
  }

  if (entry.type.startsWith("images.")) {
    const images = Array.isArray(response.data) ? response.data : [];
    if (images.length === 0) return <JsonPreview value={response} />;
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {images.map((img: AnyRecord, idx: number) => (
          <div key={idx} className="rounded-lg border border-border/60 bg-background/70 overflow-hidden">
            {img.url ? (
              <img src={img.url} alt={`Generated image ${idx + 1}`} className="w-full h-auto" />
            ) : img.b64_json ? (
              <img src={`data:image/png;base64,${img.b64_json}`} alt={`Generated image ${idx + 1}`} className="w-full h-auto" />
            ) : (
              <div className="p-3 text-xs text-muted-foreground">No image payload for this item.</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (entry.type === "audio.speech") {
    return (
      <div className="space-y-3">
        <audio controls className="w-full">
          <source src={`/devtools-assets/audio/${entry.id}.mp3`} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
        <JsonPreview value={response} />
      </div>
    );
  }

  if (entry.type === "audio.transcriptions" || entry.type === "audio.translations") {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-border/60 bg-background/70 p-3 text-sm whitespace-pre-wrap break-words">
          {previewValue(response.text)}
        </div>
      </div>
    );
  }

  if (entry.type === "moderations") {
    const results = Array.isArray(response.results) ? response.results : [];
    return results.length > 0 ? <JsonPreview value={results} /> : <JsonPreview value={responseRaw} />;
  }

  if (entry.type === "embeddings") {
    const vectors = Array.isArray(response.data) ? response.data : [];
    return (
      <KeyValueList
        rows={[
          { label: "Embeddings", value: `${vectors.length}` },
          { label: "Dimensions", value: vectors[0]?.embedding?.length ? `${vectors[0].embedding.length}` : "N/A" },
          { label: "Object", value: stringifyValue(response.object) }
        ]}
      />
    );
  }

  return <JsonPreview value={responseRaw} />;
}

function ResponseOutputItemCard({ item }: { item: AnyRecord }) {
  const type = typeof item.type === "string" ? item.type : "unknown";
  const typeLabel = formatResponseOutputType(type);
  const itemId = typeof item.id === "string" && item.id.trim().length > 0 ? item.id : undefined;
  const messageText = extractMessageTextFromOutputItem(item);
  const reasoningSummary = extractReasoningSummary(item);
  const isTool = isToolLikeOutputType(type);
  const toolName = firstNonEmpty(item.name, item.tool_name, item?.function?.name);
  const toolStatus = firstNonEmpty(item.status, item.state);
  const hasRenderableSummary = Boolean(messageText || reasoningSummary || toolName || toolStatus);

  return (
    <div className="rounded-lg border border-border/60 bg-background/70 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {typeLabel}
          </span>
          {toolName && isTool ? (
            <span className="text-xs font-medium text-foreground">{toolName}</span>
          ) : null}
        </div>
        {itemId ? (
          <span className="max-w-[18rem] truncate text-[11px] text-muted-foreground" title={itemId}>
            {itemId}
          </span>
        ) : null}
      </div>

      {type === "reasoning" ? (
        <div className="rounded-md border border-border/50 bg-muted/30 p-2.5 text-sm whitespace-pre-wrap break-words">
          {reasoningSummary ?? "No reasoning summary was returned for this item."}
        </div>
      ) : null}

      {type === "message" ? (
        <div className="rounded-md border border-border/50 bg-muted/30 p-2.5 text-sm whitespace-pre-wrap break-words max-h-72 overflow-auto">
          {messageText ?? "No message text content was returned for this item."}
        </div>
      ) : null}

      {isTool ? (
        <KeyValueList
          rows={[
            { label: "Tool", value: toolName ?? "N/A" },
            { label: "Status", value: toolStatus ?? "N/A" },
            { label: "Call ID", value: firstNonEmpty(item.call_id, itemId, "N/A") }
          ]}
        />
      ) : null}

      {!isTool && type !== "message" && type !== "reasoning" && hasRenderableSummary ? (
        <KeyValueList
          rows={[
            { label: "Status", value: firstNonEmpty(item.status, item.state, "N/A") },
            { label: "Role", value: firstNonEmpty(item.role, "N/A") }
          ]}
        />
      ) : null}

      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">Raw item JSON</summary>
        <pre className="mt-2 rounded-md border border-border/60 bg-background/80 p-2.5 text-xs overflow-x-auto max-h-56">
          {safeJson(item)}
        </pre>
      </details>
    </div>
  );
}

function formatResponseOutputType(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized === "message") return "Message";
  if (normalized === "reasoning") return "Reasoning";
  if (normalized.includes("tool")) return "Tool Call";
  if (normalized.includes("function")) return "Function Call";
  return formatEndpointLabel(type);
}

function isToolLikeOutputType(type: string): boolean {
  const normalized = type.trim().toLowerCase();
  return normalized.includes("tool") || normalized.includes("function");
}

function extractMessageTextFromOutputItem(item: AnyRecord): string | undefined {
  const texts: string[] = [];
  if (typeof item.text === "string" && item.text.trim().length > 0) {
    texts.push(item.text.trim());
  }

  if (Array.isArray(item.content)) {
    for (const part of item.content) {
      if (typeof part === "string" && part.trim().length > 0) {
        texts.push(part.trim());
        continue;
      }
      const partRecord = asRecord(part);
      if (typeof partRecord.text === "string" && partRecord.text.trim().length > 0) {
        texts.push(partRecord.text.trim());
      } else if (typeof partRecord.output_text === "string" && partRecord.output_text.trim().length > 0) {
        texts.push(partRecord.output_text.trim());
      } else if (typeof partRecord.content === "string" && partRecord.content.trim().length > 0) {
        texts.push(partRecord.content.trim());
      }
    }
  }

  return texts.length > 0 ? texts.join("\n\n") : undefined;
}

function extractReasoningSummary(item: AnyRecord): string | undefined {
  if (typeof item.summary === "string" && item.summary.trim().length > 0) {
    return item.summary.trim();
  }

  if (Array.isArray(item.summary)) {
    const lines: string[] = [];
    for (const summaryPart of item.summary) {
      if (typeof summaryPart === "string" && summaryPart.trim().length > 0) {
        lines.push(summaryPart.trim());
        continue;
      }
      const summaryRecord = asRecord(summaryPart);
      if (typeof summaryRecord.text === "string" && summaryRecord.text.trim().length > 0) {
        lines.push(summaryRecord.text.trim());
      } else if (typeof summaryRecord.summary === "string" && summaryRecord.summary.trim().length > 0) {
        lines.push(summaryRecord.summary.trim());
      }
    }
    if (lines.length > 0) {
      return lines.join("\n\n");
    }
  }

  if (typeof item.text === "string" && item.text.trim().length > 0) {
    return item.text.trim();
  }

  return undefined;
}

function normalizeMessages(endpoint: string, request: AnyRecord): Array<{ role: string; content: string }> {
  if (Array.isArray(request.messages)) {
    return request.messages.map((message: AnyRecord) => ({
      role: String(message?.role ?? "message"),
      content: previewMessageContent(message?.content)
    }));
  }

  if (endpoint === "responses") {
    if (Array.isArray(request.input)) {
      return request.input.map((item: AnyRecord) => ({
        role: String(item?.role ?? item?.type ?? "input"),
        content: previewMessageContent(item?.content ?? item)
      }));
    }
    if (request.input !== undefined) {
      return [{ role: "input", content: previewValue(request.input) }];
    }
  }

  if (request.prompt !== undefined) {
    return [{ role: "prompt", content: previewValue(request.prompt) }];
  }

  if (request.input !== undefined && endpoint !== "audio.transcriptions" && endpoint !== "audio.translations") {
    return [{ role: "input", content: previewValue(request.input) }];
  }

  return [];
}

function extractRequestRows(request: AnyRecord): Array<{ label: string; value: string }> {
  const preferredKeys = [
    "model",
    "temperature",
    "top_p",
    "max_tokens",
    "max_output_tokens",
    "stream",
    "tool_choice",
    "voice",
    "size",
    "n",
    "quality",
    "language"
  ];

  const rows: Array<{ label: string; value: string }> = [];
  for (const key of preferredKeys) {
    if (request[key] === undefined) continue;
    rows.push({ label: prettifyKey(key), value: stringifyValue(request[key]) });
  }

  if (rows.length > 0) return rows;

  return Object.entries(request)
    .filter(([_, value]) => value !== undefined && value !== null && typeof value !== "object")
    .slice(0, 12)
    .map(([key, value]) => ({ label: prettifyKey(key), value: stringifyValue(value) }));
}

function extractOutputText(output: unknown): string | undefined {
  if (!Array.isArray(output)) return undefined;
  const texts: string[] = [];

  for (const item of output as AnyRecord[]) {
    if (typeof item?.text === "string" && item.text.trim()) {
      texts.push(item.text);
    }
    if (Array.isArray(item?.content)) {
      for (const part of item.content) {
        const text = (part as AnyRecord)?.text;
        if (typeof text === "string" && text.trim()) {
          texts.push(text);
        }
      }
    }
  }

  return texts.length > 0 ? texts.join("\n\n") : undefined;
}

function FactCard({
  label,
  value,
  copyable,
  className
}: {
  label: string;
  value: string;
  copyable?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border/60 bg-background/70 p-3 ${className ?? ""}`}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-medium break-all flex items-center gap-2">
        <span>{value}</span>
        {copyable ? (
          <button
            type="button"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border/60 bg-card/70 text-muted-foreground hover:text-foreground"
            onClick={() => void navigator.clipboard.writeText(value)}
            title={`Copy ${label}`}
          >
            <Clipboard className="h-3 w-3" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Timer; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function StepCard({
  step,
  title,
  right,
  children
}: {
  step: number;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/80 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-4 py-3">
        <div className="text-sm font-semibold">Step {step}: {title}</div>
        {right}
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  );
}

function Panel({
  title,
  icon: Icon,
  children
}: {
  title: string;
  icon: typeof FileJson;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {children}
    </div>
  );
}

function KeyValueList({ rows }: { rows: Array<{ label: string; value: string }> }) {
  const valid = rows.filter((row) => row.value !== "N/A" && row.value !== "undefined");
  if (valid.length === 0) {
    return <div className="text-sm text-muted-foreground">No structured fields detected.</div>;
  }
  return (
    <div className="space-y-2">
      {valid.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-background/70 p-2">
          <div className="text-xs text-muted-foreground">{row.label}</div>
          <div className="text-sm text-right break-all">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

function JsonPreview({ value }: { value: unknown }) {
  return (
    <pre className="rounded-lg border border-border/60 bg-background/70 p-3 text-xs overflow-x-auto max-h-[24rem]">
      {safeJson(value)}
    </pre>
  );
}

function JsonDetails({
  title,
  value,
  defaultOpen
}: {
  title: string;
  value: unknown;
  defaultOpen?: boolean;
}) {
  return (
    <details className="rounded-xl border border-border/60 bg-background/50 p-3" open={defaultOpen}>
      <summary className="cursor-pointer text-sm font-medium flex items-center gap-2">
        <FileJson className="h-4 w-4" />
        {title}
      </summary>
      <pre className="mt-3 rounded-lg border border-border/60 bg-background/80 p-3 text-xs overflow-x-auto max-h-[28rem]">
        {safeJson(value)}
      </pre>
    </details>
  );
}

function StatusPill({ isError, label }: { isError: boolean; label: string }) {
  return (
    <Pill
      className={
        isError
          ? "bg-destructive/10 text-destructive border border-destructive/25"
          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25"
      }
    >
      {label}
    </Pill>
  );
}

function SdkPill({ sdk }: { sdk: string }) {
  const config = SDK_BADGE_MAP[sdk];
  if (!config) {
    return <Pill className="border border-border/60 bg-card/70 text-foreground">{sdk.toUpperCase()}</Pill>;
  }
  return (
    <Pill className="border border-border/60 bg-card/70 text-foreground inline-flex items-center gap-1.5">
      {config.darkIcon ? (
        <>
          <img src={config.icon} alt={`${config.label} logo`} className="h-3.5 w-3.5 dark:hidden" />
          <img src={config.darkIcon} alt={`${config.label} logo`} className="hidden h-3.5 w-3.5 dark:block" />
        </>
      ) : (
        <img src={config.icon} alt={`${config.label} logo`} className="h-3.5 w-3.5" />
      )}
      {config.label}
    </Pill>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${className ?? ""}`}>{children}</span>;
}

function formatEndpointLabel(endpoint: string): string {
  return endpoint
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function prettifyKey(key: string): string {
  return key
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((piece) => piece.charAt(0).toUpperCase() + piece.slice(1))
    .join(" ");
}

function formatDateTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatMaybeNumber(value: unknown): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return value.toLocaleString();
}

function formatCost(value: unknown): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return `$${value.toFixed(6)}`;
}

function resolveUsage(entry: DevToolsEntry, response: AnyRecord): {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
} {
  const metadataUsage = asRecord(entry.metadata?.usage);
  const responseUsage = asRecord(response?.usage);

  const promptTokens =
    asNumber(metadataUsage.prompt_tokens) ??
    asNumber(responseUsage.prompt_tokens) ??
    asNumber(responseUsage.input_tokens);
  const completionTokens =
    asNumber(metadataUsage.completion_tokens) ??
    asNumber(responseUsage.completion_tokens) ??
    asNumber(responseUsage.output_tokens);

  const directTotal =
    asNumber(metadataUsage.total_tokens) ??
    asNumber(responseUsage.total_tokens);
  const totalTokens =
    directTotal ?? (promptTokens !== undefined && completionTokens !== undefined
      ? promptTokens + completionTokens
      : undefined);

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens
  };
}

function resolveCost(entry: DevToolsEntry, response: AnyRecord): number | undefined {
  const metadataCost = asRecord(entry.metadata?.cost);
  const directCost = asNumber(metadataCost.total_cost);
  if (directCost !== undefined) return directCost;

  const responseUsage = asRecord(response?.usage);
  const pricingBreakdown = asRecord(responseUsage.pricing_breakdown ?? response?.pricing_breakdown);

  const totalUsdString = pricingBreakdown.total_usd_str;
  if (typeof totalUsdString === "string") {
    const parsed = Number.parseFloat(totalUsdString);
    if (Number.isFinite(parsed)) return parsed;
  }

  const totalUsd = asNumber(pricingBreakdown.total_usd);
  if (totalUsd !== undefined) return totalUsd;

  const totalNanos =
    asNumber(pricingBreakdown.total_nanos) ??
    asNumber(response.cost_nanos) ??
    asNumber(response.total_nanos);
  if (totalNanos !== undefined) return totalNanos / 1_000_000_000;

  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return safeJson(value, 0);
}

function previewValue(value: unknown): string {
  return truncate(stringifyValue(value), 1400);
}

function previewMessageContent(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        const partRecord = asRecord(part);
        if (typeof partRecord.text === "string") return partRecord.text;
        if (typeof partRecord.content === "string") return partRecord.content;
        return safeJson(partRecord);
      })
      .join("\n");
  }
  return previewValue(content);
}

function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength)}...`;
}

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function asRecord(value: unknown): AnyRecord {
  if (!value || typeof value !== "object") return {};
  return value as AnyRecord;
}

function getSdkLabel(sdk: string): string {
  return SDK_BADGE_MAP[sdk]?.label ?? sdk.toUpperCase();
}

function TextPreview({ value }: { value: unknown }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/70 p-3 text-sm whitespace-pre-wrap break-words">
      {previewValue(value)}
    </div>
  );
}
