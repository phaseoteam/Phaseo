import type { DevToolsEntry } from "@/types";
import { safeJson } from "../../utils/format";

interface ImageGenerationViewProps {
  entry: DevToolsEntry;
}

export function ImageGenerationView({ entry }: ImageGenerationViewProps) {
  console.log("Rendering ImageGenerationView for entry:", entry);
  const request = (entry?.request && typeof entry.request === "object") ? entry.request : {};
  const prompt = (request as any)?.prompt || "";
  const response = entry?.response && typeof entry.response === "object" ? entry.response as any : {};
  const images = Array.isArray(response?.data) ? response.data : [];

  return (
    <div className="space-y-6">
      {/* Prompt */}
      <section className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Prompt</h3>
        <div className="p-4 rounded-xl border border-border/60 bg-muted/60 whitespace-pre-wrap text-sm">
          {prompt}
        </div>
      </section>

      {/* Generated Images */}
      {images.length > 0 && (
        <section className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">
            Generated Images ({images.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {images.map((img: any, idx: number) => (
              <div
                key={idx}
                className="border border-border/60 rounded-2xl overflow-hidden bg-background/80 shadow-sm"
              >
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
                  <div className="p-3 bg-muted/50 border-t border-border/60">
                    <div className="text-xs text-muted-foreground mb-1">Revised Prompt:</div>
                    <div className="text-sm">{img.revised_prompt}</div>
                  </div>
                )}
              </div>
            ))}
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
              size: (request as any).size,
              n: (request as any).n,
              quality: (request as any).quality,
              style: (request as any).style,
              ...Object.fromEntries(
                Object.entries(request).filter(
                  ([k]) => !["prompt", "model"].includes(k)
                )
              )
            }
          )}
        </pre>
      </details>
    </div>
  );
}

