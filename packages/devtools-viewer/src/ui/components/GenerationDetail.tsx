import { useQuery } from "@tanstack/react-query";
import type { DevToolsEntry } from "@ai-stats/devtools-core";
import { ChatCompletionView } from "./endpoints/ChatCompletionView";
import { ImageGenerationView } from "./endpoints/ImageGenerationView";
import { AudioView } from "./endpoints/AudioView";
import { GenericView } from "./endpoints/GenericView";

interface GenerationDetailProps {
  id: string;
}

export function GenerationDetail({ id }: GenerationDetailProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["generation", id],
    queryFn: async () => {
      const res = await fetch(`/api/generations/${id}`);
      if (!res.ok) throw new Error("Failed to fetch generation");
      return res.json() as Promise<DevToolsEntry>;
    }
  });

  if (isLoading) {
    return (
      <div className="p-6 text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-destructive">
        Error: {error instanceof Error ? error.message : "Unknown error"}
      </div>
    );
  }

  // Render different UI based on endpoint type
  const renderContent = () => {
    switch (data.type) {
      case "chat.completions":
      case "responses":
        return <ChatCompletionView entry={data} />;

      case "images.generations":
      case "images.edits":
        return <ImageGenerationView entry={data} />;

      case "audio.speech":
      case "audio.transcriptions":
      case "audio.translations":
        return <AudioView entry={data} />;

      default:
        return <GenericView entry={data} />;
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 pb-4 border-b border-border">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-2xl font-bold">{data.type}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date(data.timestamp).toLocaleString()}
            </p>
          </div>
          {data.error ? (
            <span className="px-3 py-1 bg-destructive/10 text-destructive rounded text-sm">
              Error
            </span>
          ) : (
            <span className="px-3 py-1 bg-green-500/10 text-green-600 rounded text-sm">
              Success
            </span>
          )}
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div>
            <div className="text-xs text-muted-foreground">Model</div>
            <div className="font-medium">{data.metadata.model || "N/A"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Provider</div>
            <div className="font-medium">{data.metadata.provider || "N/A"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Duration</div>
            <div className="font-medium">{data.duration_ms}ms</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Cost</div>
            <div className="font-medium">
              {data.metadata.cost ? `$${data.metadata.cost.total_cost.toFixed(6)}` : "N/A"}
            </div>
          </div>
        </div>

        {/* Usage Info */}
        {data.metadata.usage && (
          <div className="grid grid-cols-3 gap-4 mt-4">
            {data.metadata.usage.prompt_tokens !== undefined && (
              <div>
                <div className="text-xs text-muted-foreground">Prompt Tokens</div>
                <div className="font-medium">{data.metadata.usage.prompt_tokens}</div>
              </div>
            )}
            {data.metadata.usage.completion_tokens !== undefined && (
              <div>
                <div className="text-xs text-muted-foreground">Completion Tokens</div>
                <div className="font-medium">{data.metadata.usage.completion_tokens}</div>
              </div>
            )}
            {data.metadata.usage.total_tokens !== undefined && (
              <div>
                <div className="text-xs text-muted-foreground">Total Tokens</div>
                <div className="font-medium">{data.metadata.usage.total_tokens}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Display */}
      {data.error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded">
          <h3 className="font-semibold text-destructive mb-2">Error</h3>
          <pre className="text-sm overflow-x-auto">{data.error.message}</pre>
          {data.error.stack && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-destructive">Stack trace</summary>
              <pre className="text-xs mt-2 overflow-x-auto">{data.error.stack}</pre>
            </details>
          )}
        </div>
      )}

      {/* Endpoint-specific content */}
      {renderContent()}
    </div>
  );
}
