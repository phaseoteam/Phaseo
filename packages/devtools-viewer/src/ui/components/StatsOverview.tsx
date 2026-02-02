import { useQuery } from "@tanstack/react-query";
import type { Stats } from "@ai-stats/devtools-core";

export function StatsOverview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json() as Promise<Stats>;
    }
  });

  if (isLoading) {
    return (
      <div className="p-6 text-muted-foreground">
        Loading statistics...
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

  const errorRate = data.total_requests > 0
    ? ((data.total_errors / data.total_requests) * 100).toFixed(2)
    : "0.00";

  const avgDuration = data.total_requests > 0
    ? (data.total_duration_ms / data.total_requests).toFixed(2)
    : "0.00";

  return (
    <div className="p-6 space-y-8">
      {/* Overall Stats */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Requests"
            value={data.total_requests.toLocaleString()}
            subtitle={`${data.total_errors} errors (${errorRate}%)`}
          />
          <StatCard
            title="Total Cost"
            value={`$${data.total_cost.toFixed(4)}`}
            subtitle={`Avg: $${(data.total_cost / Math.max(data.total_requests, 1)).toFixed(6)}`}
          />
          <StatCard
            title="Total Tokens"
            value={data.total_tokens.toLocaleString()}
            subtitle={`Avg: ${Math.round(data.total_tokens / Math.max(data.total_requests, 1))} per request`}
          />
          <StatCard
            title="Avg Duration"
            value={`${avgDuration}ms`}
            subtitle={`Total: ${(data.total_duration_ms / 1000).toFixed(2)}s`}
          />
        </div>
      </div>

      {/* By Endpoint */}
      <div>
        <h2 className="text-xl font-bold mb-4">By Endpoint</h2>
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-semibold">Endpoint</th>
                <th className="text-right p-3 font-semibold">Requests</th>
                <th className="text-right p-3 font-semibold">Errors</th>
                <th className="text-right p-3 font-semibold">Avg Duration</th>
                <th className="text-right p-3 font-semibold">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Object.entries(data.by_endpoint)
                .sort(([, a], [, b]) => b.count - a.count)
                .map(([endpoint, stats]) => (
                  <tr key={endpoint} className="hover:bg-muted/30">
                    <td className="p-3 font-mono text-sm">{endpoint}</td>
                    <td className="p-3 text-right">{stats.count}</td>
                    <td className="p-3 text-right">
                      {stats.errors > 0 ? (
                        <span className="text-destructive">{stats.errors}</span>
                      ) : (
                        stats.errors
                      )}
                    </td>
                    <td className="p-3 text-right">{stats.avg_duration_ms.toFixed(2)}ms</td>
                    <td className="p-3 text-right">${stats.total_cost.toFixed(4)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* By Model */}
      {Object.keys(data.by_model).length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4">By Model</h2>
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-semibold">Model</th>
                  <th className="text-right p-3 font-semibold">Requests</th>
                  <th className="text-right p-3 font-semibold">Tokens</th>
                  <th className="text-right p-3 font-semibold">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Object.entries(data.by_model)
                  .sort(([, a], [, b]) => b.count - a.count)
                  .map(([model, stats]) => (
                    <tr key={model} className="hover:bg-muted/30">
                      <td className="p-3 font-mono text-sm">{model}</td>
                      <td className="p-3 text-right">{stats.count}</td>
                      <td className="p-3 text-right">{stats.tokens.toLocaleString()}</td>
                      <td className="p-3 text-right">${stats.cost.toFixed(4)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Export Button */}
      <div className="flex gap-3">
        <button
          onClick={() => window.open("/api/export?format=json", "_blank")}
          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
        >
          Export JSON
        </button>
        <button
          onClick={() => window.open("/api/export?format=jsonl", "_blank")}
          className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/90"
        >
          Export JSONL
        </button>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
}

function StatCard({ title, value, subtitle }: StatCardProps) {
  return (
    <div className="p-4 border border-border rounded bg-muted/30">
      <div className="text-sm text-muted-foreground mb-1">{title}</div>
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </div>
  );
}
