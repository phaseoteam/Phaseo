import type { DevToolsEntry } from "@ai-stats/devtools-core";

interface GenericViewProps {
  entry: DevToolsEntry;
}

export function GenericView({ entry }: GenericViewProps) {
  return (
    <div className="space-y-6">
      {/* Request */}
      <div>
        <h3 className="font-semibold mb-3">Request</h3>
        <pre className="text-xs p-4 bg-muted/30 rounded overflow-x-auto border border-border">
          {JSON.stringify(entry.request, null, 2)}
        </pre>
      </div>

      {/* Response */}
      {entry.response && (
        <div>
          <h3 className="font-semibold mb-3">Response</h3>
          <pre className="text-xs p-4 bg-muted/30 rounded overflow-x-auto border border-border">
            {JSON.stringify(entry.response, null, 2)}
          </pre>
        </div>
      )}

      {/* Metadata */}
      <div>
        <h3 className="font-semibold mb-3">Metadata</h3>
        <pre className="text-xs p-4 bg-muted/30 rounded overflow-x-auto border border-border">
          {JSON.stringify(entry.metadata, null, 2)}
        </pre>
      </div>
    </div>
  );
}
