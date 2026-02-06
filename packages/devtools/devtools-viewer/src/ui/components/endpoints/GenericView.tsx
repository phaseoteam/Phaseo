import type { DevToolsEntry } from "@ai-stats/devtools-core";
import { safeJson } from "../../utils/format";

interface GenericViewProps {
  entry: DevToolsEntry;
}

export function GenericView({ entry }: GenericViewProps) {
  console.log("Rendering GenericView for entry:", entry);
  const request = (entry?.request && typeof entry.request === "object") ? entry.request : entry?.request ?? {};
  const response = entry?.response && typeof entry.response === "object" ? entry.response : entry?.response ?? null;
  return (
    <div className="space-y-6">
      {/* Request */}
      <section className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Request</h3>
        <pre className="text-xs p-4 bg-muted/60 rounded-xl overflow-x-auto border border-border/60">
          {safeJson(request)}
        </pre>
      </section>

      {/* Response */}
      {response && (
        <section className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
          <h3 className="text-lg font-semibold mb-3">Response</h3>
          <pre className="text-xs p-4 bg-muted/60 rounded-xl overflow-x-auto border border-border/60">
            {safeJson(response)}
          </pre>
        </section>
      )}

      {/* Metadata */}
      <section className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Metadata</h3>
        <pre className="text-xs p-4 bg-muted/60 rounded-xl overflow-x-auto border border-border/60">
          {safeJson(entry.metadata)}
        </pre>
      </section>
    </div>
  );
}
