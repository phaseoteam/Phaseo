import { useQuery } from "@tanstack/react-query";
import type { DevToolsEntry } from "@ai-stats/devtools-core";

interface GenerationsListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function GenerationsList({ selectedId, onSelect }: GenerationsListProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["generations"],
    queryFn: async () => {
      const res = await fetch("/api/generations?limit=100");
      if (!res.ok) throw new Error("Failed to fetch generations");
      return res.json() as Promise<{ generations: DevToolsEntry[]; total: number }>;
    }
  });

  if (isLoading) {
    return (
      <div className="p-4 text-muted-foreground">
        Loading generations...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-destructive">
        Error: {error instanceof Error ? error.message : "Unknown error"}
      </div>
    );
  }

  if (!data || data.generations.length === 0) {
    return (
      <div className="p-4 text-muted-foreground">
        No generations captured yet. Make API requests with devtools enabled to see them here.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {data.generations.map((entry) => (
        <button
          key={entry.id}
          onClick={() => onSelect(entry.id)}
          className={`w-full text-left p-4 hover:bg-accent transition-colors ${
            selectedId === entry.id ? "bg-accent" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{entry.type}</div>
              <div className="text-sm text-muted-foreground truncate">
                {entry.metadata.model || "Unknown model"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 text-xs">
              {entry.error ? (
                <span className="px-2 py-1 bg-destructive/10 text-destructive rounded">
                  Error
                </span>
              ) : (
                <span className="px-2 py-1 bg-green-500/10 text-green-600 rounded">
                  Success
                </span>
              )}
              <span className="text-muted-foreground">
                {entry.duration_ms}ms
              </span>
              {entry.metadata.cost && (
                <span className="text-muted-foreground">
                  ${entry.metadata.cost.total_cost.toFixed(4)}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
