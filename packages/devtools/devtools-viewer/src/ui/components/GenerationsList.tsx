import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  DollarSign,
  Download,
  Search,
  Timer,
  X
} from "lucide-react";
import type { DevToolsEntry } from "@ai-stats/devtools-core";

interface GenerationsListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function GenerationsList({ selectedId, onSelect }: GenerationsListProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["generations"],
    queryFn: async () => {
      const res = await fetch("/api/generations?limit=200");
      if (!res.ok) throw new Error("Failed to fetch generations");
      return res.json() as Promise<{ generations: DevToolsEntry[]; total: number }>;
    }
  });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "success" | "error">("all");
  const [endpoint, setEndpoint] = useState<string>("all");
  const [showCostly, setShowCostly] = useState(false);
  const [showSlow, setShowSlow] = useState(false);

  const endpoints = useMemo(() => {
    if (!data?.generations) return [];
    return Array.from(new Set(data.generations.map((entry) => entry.type))).sort();
  }, [data?.generations]);

  const filtered = useMemo(() => {
    if (!data?.generations) return [];
    const search = query.trim().toLowerCase();
    return data.generations.filter((entry) => {
      if (status === "success" && entry.error) return false;
      if (status === "error" && !entry.error) return false;
      if (endpoint !== "all" && entry.type !== endpoint) return false;
      if (showCostly && (!entry.metadata.cost?.total_cost || entry.metadata.cost.total_cost < 0.01)) return false;
      if (showSlow && entry.duration_ms < 5000) return false;
      if (!search) return true;
      const haystack = `${entry.type} ${entry.metadata.model ?? ""} ${entry.metadata.provider ?? ""} ${entry.id}`.toLowerCase();
      return haystack.includes(search);
    });
  }, [data?.generations, endpoint, query, status, showCostly, showSlow]);

  if (isLoading) {
    return (
      <div className="p-6 text-muted-foreground">Loading generations...</div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-destructive">
        Error: {error instanceof Error ? error.message : "Unknown error"}
      </div>
    );
  }

  if (!data || data.generations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <BarChart3 className="h-10 w-10 text-muted-foreground mb-4" />
        <div className="text-sm font-medium text-foreground mb-2">No Generations Yet</div>
        <p className="text-xs text-muted-foreground max-w-xs">
          Make API requests with the AI Stats SDK to see them appear here in real-time.
        </p>
        <div className="mt-6 rounded-xl border border-border/60 bg-card/80 p-4 text-left text-xs max-w-xs">
          <div className="font-medium mb-2">Quick Start:</div>
          <code className="block text-[10px] bg-muted/60 p-2 rounded">
            import {"{"} AIStats {"}"} from '@ai-stats/sdk'<br/>
            const client = new AIStats()
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-border/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold">Generations</div>
            <div className="text-xs text-muted-foreground">
              Showing {filtered.length.toLocaleString()} of {data.total.toLocaleString()}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const dataStr = JSON.stringify(data.generations, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ai-stats-devtools-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="rounded-lg border border-border/60 bg-card/80 px-2 py-1 text-xs hover:bg-accent/40 transition"
              title="Export all as JSON"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by model, endpoint, provider, ID..."
              className="w-full rounded-xl border border-border bg-card px-3 py-2 pl-8 text-sm text-foreground placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
            <span className="absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none">
              <Search className="h-4 w-4" />
            </span>
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                title="Clear search (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "success", "error"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setStatus(option)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  status === option
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border/60 bg-card/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                {option === "all" ? (
                  "All"
                ) : option === "success" ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Success
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Errors
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={() => setShowCostly(!showCostly)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                showCostly
                  ? "bg-amber-500/20 text-amber-600 border border-amber-500/30"
                  : "border border-border/60 bg-card/70 text-muted-foreground hover:text-foreground"
              }`}
              title="Show only expensive requests (>$0.01)"
            >
              <span className="inline-flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Costly
              </span>
            </button>
            <button
              onClick={() => setShowSlow(!showSlow)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                showSlow
                  ? "bg-orange-500/20 text-orange-600 border border-orange-500/30"
                  : "border border-border/60 bg-card/70 text-muted-foreground hover:text-foreground"
              }`}
              title="Show only slow requests (>5s)"
            >
              <span className="inline-flex items-center gap-1">
                <Timer className="h-3 w-3" />
                Slow
              </span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Endpoint</span>
            <select
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all cursor-pointer"
            >
              <option value="all">All endpoints</option>
              {endpoints.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-muted-foreground">
            No generations match your filters.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((entry) => (
              <button
                key={entry.id}
                onClick={() => onSelect(entry.id)}
                className={`w-full text-left p-4 transition relative ${
                  selectedId === entry.id
                    ? "bg-primary/10 border-l-4 border-l-primary"
                    : "hover:bg-accent/40 border-l-4 border-l-transparent"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold truncate">{entry.type}</div>
                      {entry.error && (
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {entry.metadata.model || "Unknown model"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {entry.metadata.provider && (
                        <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5">
                          {entry.metadata.provider}
                        </span>
                      )}
                      {entry.metadata.stream && (
                        <span className="rounded-full border border-border/60 bg-card/70 px-2 py-0.5">
                          Streaming
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-xs">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        entry.error
                          ? "bg-destructive/10 text-destructive"
                          : "bg-emerald-500/10 text-emerald-600"
                      }`}
                    >
                      {entry.error ? "Error" : "OK"}
                    </span>
                    <div className="text-[11px] text-muted-foreground text-right">
                      {new Date(entry.timestamp).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {entry.duration_ms}ms
                    </div>
                    {typeof entry.metadata.cost?.total_cost === "number" && (
                      <div className="text-[11px] text-muted-foreground">
                        ${entry.metadata.cost.total_cost.toFixed(4)}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
