import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Stats } from "@/types";

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

  const { errorRate, avgDuration, endpointRows, modelRows, maxEndpointCount, maxModelCount } =
    useMemo(() => {
      const errorRateValue =
        data.total_requests > 0
          ? (data.total_errors / data.total_requests) * 100
          : 0;
      const avgDurationValue =
        data.total_requests > 0
          ? data.total_duration_ms / data.total_requests
          : 0;
      const endpoints = Object.entries(data.by_endpoint)
        .sort(([, a], [, b]) => b.count - a.count);
      const models = Object.entries(data.by_model)
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 10);
      return {
        errorRate: errorRateValue,
        avgDuration: avgDurationValue,
        endpointRows: endpoints,
        modelRows: models,
        maxEndpointCount: endpoints[0]?.[1].count ?? 0,
        maxModelCount: models[0]?.[1].count ?? 0
      };
    }, [data]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-semibold mb-4">Overview</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total Requests"
            value={data.total_requests.toLocaleString()}
            subtitle={`${data.total_errors} errors (${errorRate.toFixed(2)}%)`}
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
            value={`${avgDuration.toFixed(2)}ms`}
            subtitle={`Total: ${(data.total_duration_ms / 1000).toFixed(2)}s`}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">By Endpoint</h2>
            <span className="text-xs text-muted-foreground">
              {endpointRows.length} endpoints
            </span>
          </div>
          <div className="space-y-4">
            {endpointRows.map(([endpoint, stats]) => {
              const width = maxEndpointCount
                ? Math.round((stats.count / maxEndpointCount) * 100)
                : 0;
              return (
                <div key={endpoint} className="rounded-xl border border-border/60 bg-background/80 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{endpoint}</div>
                    <div className="text-xs text-muted-foreground">
                      {stats.count} requests • {stats.errors} errors
                    </div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-muted/60">
                    <div
                      className="h-2 rounded-full bg-primary/80"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{stats.avg_duration_ms.toFixed(2)}ms avg</span>
                    <span>${stats.total_cost.toFixed(4)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Top Models</h2>
            <span className="text-xs text-muted-foreground">
              {modelRows.length} shown
            </span>
          </div>
          <div className="space-y-4">
            {modelRows.map(([model, stats]) => {
              const width = maxModelCount
                ? Math.round((stats.count / maxModelCount) * 100)
                : 0;
              return (
                <div key={model} className="rounded-xl border border-border/60 bg-background/80 p-4">
                  <div className="text-sm font-medium truncate">{model}</div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{stats.count} requests</span>
                    <span>${stats.cost.toFixed(4)}</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-muted/60">
                    <div
                      className="h-2 rounded-full bg-primary/80"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {modelRows.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No model stats recorded yet.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => window.open("/api/export?format=json", "_blank")}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Export JSON
        </button>
        <button
          onClick={() => window.open("/api/export?format=jsonl", "_blank")}
          className="rounded-full border border-border/60 bg-card/80 px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
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
    <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
      <div className="text-xs text-muted-foreground mt-2">{subtitle}</div>
    </div>
  );
}

