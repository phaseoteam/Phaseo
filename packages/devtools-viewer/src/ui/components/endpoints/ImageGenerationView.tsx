import type { DevToolsEntry } from "@ai-stats/devtools-core";

interface ImageGenerationViewProps {
  entry: DevToolsEntry;
}

export function ImageGenerationView({ entry }: ImageGenerationViewProps) {
  const prompt = entry.request.prompt || "";
  const images = entry.response?.data || [];

  return (
    <div className="space-y-6">
      {/* Prompt */}
      <div>
        <h3 className="font-semibold mb-3">Prompt</h3>
        <div className="p-4 rounded border border-border bg-muted/30 whitespace-pre-wrap text-sm">
          {prompt}
        </div>
      </div>

      {/* Generated Images */}
      {images.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">Generated Images ({images.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {images.map((img: any, idx: number) => (
              <div key={idx} className="border border-border rounded overflow-hidden">
                {img.url ? (
                  <img
                    src={img.url}
                    alt={`Generated image ${idx + 1}`}
                    className="w-full h-auto"
                  />
                ) : img.b64_json ? (
                  <img
                    src={`data:image/png;base64,${img.b64_json}`}
                    alt={`Generated image ${idx + 1}`}
                    className="w-full h-auto"
                  />
                ) : (
                  <div className="p-4 text-muted-foreground">
                    No image data available
                  </div>
                )}
                {img.revised_prompt && (
                  <div className="p-3 bg-muted/50 border-t border-border">
                    <div className="text-xs text-muted-foreground mb-1">Revised Prompt:</div>
                    <div className="text-sm">{img.revised_prompt}</div>
                  </div>
                )}
              </div>
            ))}
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
              size: entry.request.size,
              n: entry.request.n,
              quality: entry.request.quality,
              style: entry.request.style,
              ...Object.fromEntries(
                Object.entries(entry.request).filter(
                  ([k]) => !["prompt", "model"].includes(k)
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
