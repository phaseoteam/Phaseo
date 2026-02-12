import type { DevToolsEntry } from "@/types";
import { safeJson } from "../../utils/format";

interface ChatCompletionViewProps {
  entry: DevToolsEntry;
}

export function ChatCompletionView({ entry }: ChatCompletionViewProps) {
  console.log("Rendering ChatCompletionView for entry:", entry);

  const request = (entry?.request && typeof entry.request === "object") ? entry.request : {};
  const rawMessages = (request as any)?.messages;
  const messages = Array.isArray(rawMessages) ? rawMessages : [];
  const response = entry?.response;
  const hasMessages = messages.length > 0;
  const fallbackInput =
    (request as any)?.input ??
    (request as any)?.prompt ??
    (typeof entry?.request === "string" ? entry.request : null);
  const choices = response && typeof response === "object" && Array.isArray((response as any).choices)
    ? (response as any).choices
    : null;

  return (
    <div className="space-y-6">
      {/* Request Messages */}
      <section className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Messages</h3>
          <span className="text-xs text-muted-foreground">
            {hasMessages ? `${messages.length} total` : "No messages"}
          </span>
        </div>
        {hasMessages ? (
          <div className="space-y-4">
            {messages.map((msg: any, idx: number) => (
              <div
                key={idx}
                className="rounded-xl border border-border/60 bg-muted/60 p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-1 text-[11px] rounded-full bg-primary text-primary-foreground font-medium uppercase tracking-wide">
                    {msg.role}
                  </span>
                  {msg.name && (
                    <span className="text-xs text-muted-foreground">
                      {msg.name}
                    </span>
                  )}
                </div>
                <div className="whitespace-pre-wrap text-sm">
                  {typeof msg.content === "string"
                    ? msg.content
                    : safeJson(msg.content)}
                </div>
                {msg.tool_calls && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-primary">
                      Tool Calls ({msg.tool_calls.length})
                    </summary>
                    <pre className="text-xs mt-2 p-3 bg-background/80 rounded-xl overflow-x-auto border border-border/60">
                      {safeJson(msg.tool_calls)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-muted/60 p-4 text-sm text-muted-foreground">
            {fallbackInput
              ? `Input: ${typeof fallbackInput === "string" ? fallbackInput : safeJson(fallbackInput)}`
              : "No message payload captured for this request."}
          </div>
        )}
      </section>

      {/* Response */}
      {response && (
        <section className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Response</h3>
            <span className="text-xs text-muted-foreground">
              {response.choices?.length ?? 0} choices
            </span>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/60 p-4">
            {choices && choices.length > 0 ? (
              <div className="space-y-4">
                {choices.map((choice: any, idx: number) => (
                  <div key={idx}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2.5 py-1 text-[11px] rounded-full bg-secondary text-secondary-foreground font-medium uppercase tracking-wide">
                        assistant
                      </span>
                      <span className="text-xs text-muted-foreground">
                        finish_reason: {choice.finish_reason}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm">
                      {choice.message?.content || choice.text || "No content"}
                    </div>
                    {choice.message?.tool_calls && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-primary">
                          Tool Calls ({choice.message.tool_calls.length})
                        </summary>
                        <pre className="text-xs mt-2 p-3 bg-background/80 rounded-xl overflow-x-auto border border-border/60">
                          {safeJson(choice.message.tool_calls)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <pre className="text-xs overflow-x-auto">
                {safeJson(response)}
              </pre>
            )}
          </div>
        </section>
      )}

      {/* Request Parameters */}
      <details className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold">
          Request Parameters
        </summary>
        <pre className="text-xs p-4 bg-muted/60 rounded-xl overflow-x-auto mt-3 border border-border/60">
          {safeJson(
            {
              model: (request as any).model,
              temperature: (request as any).temperature,
              max_tokens: (request as any).max_tokens,
              stream: (request as any).stream,
              ...Object.fromEntries(
                Object.entries(request).filter(
                  ([k]) => !["messages", "model"].includes(k)
                )
              )
            }
          )}
        </pre>
      </details>
    </div>
  );
}

