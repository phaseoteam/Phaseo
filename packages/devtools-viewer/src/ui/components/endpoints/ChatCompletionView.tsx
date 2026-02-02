import type { DevToolsEntry } from "@ai-stats/devtools-core";

interface ChatCompletionViewProps {
  entry: DevToolsEntry;
}

export function ChatCompletionView({ entry }: ChatCompletionViewProps) {
  const messages = entry.request.messages || [];
  const response = entry.response;

  return (
    <div className="space-y-6">
      {/* Request Messages */}
      <div>
        <h3 className="font-semibold mb-3">Messages</h3>
        <div className="space-y-3">
          {messages.map((msg: any, idx: number) => (
            <div
              key={idx}
              className="p-4 rounded border border-border bg-muted/30"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground font-medium">
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
                  : JSON.stringify(msg.content, null, 2)}
              </div>
              {msg.tool_calls && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-primary">
                    Tool Calls ({msg.tool_calls.length})
                  </summary>
                  <pre className="text-xs mt-2 p-2 bg-background rounded overflow-x-auto">
                    {JSON.stringify(msg.tool_calls, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Response */}
      {response && (
        <div>
          <h3 className="font-semibold mb-3">Response</h3>
          <div className="p-4 rounded border border-border bg-muted/30">
            {response.choices && response.choices.length > 0 ? (
              <div className="space-y-4">
                {response.choices.map((choice: any, idx: number) => (
                  <div key={idx}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 text-xs rounded bg-secondary text-secondary-foreground font-medium">
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
                        <pre className="text-xs mt-2 p-2 bg-background rounded overflow-x-auto">
                          {JSON.stringify(choice.message.tool_calls, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(response, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Request Parameters */}
      <details>
        <summary className="cursor-pointer font-semibold mb-3">
          Request Parameters
        </summary>
        <pre className="text-xs p-4 bg-muted/30 rounded overflow-x-auto mt-3">
          {JSON.stringify(
            {
              model: entry.request.model,
              temperature: entry.request.temperature,
              max_tokens: entry.request.max_tokens,
              stream: entry.request.stream,
              ...Object.fromEntries(
                Object.entries(entry.request).filter(
                  ([k]) => !["messages", "model"].includes(k)
                )
              )
            },
            null,
            2
          )}
        </pre>
      </details>
    </div>
  );
}
