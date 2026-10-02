import { useState } from "react";
import type { CallTool } from "./workflows";
import * as z from "zod/v4";

const creditsSchema = z.object({
  availableNanos: z.number().finite(),
  reservedNanos: z.number().finite(),
  thirtyDayUsageNanos: z.number().finite().nullable(),
  thirtyDayRequests: z.number().finite(),
});
const analyticsSchema = z.array(
  z.object({
    model: z.string(),
    requests: z.number().finite(),
    costUsd: z.number().finite(),
  }),
);
const logsSchema = z.array(
  z.object({
    requestId: z.string().nullable(),
    model: z.string().nullable(),
    provider: z.string().nullable(),
    timestamp: z.string().nullable(),
    success: z.boolean().nullable(),
    costUsd: z.number().finite().nullable(),
    latencyMs: z.number().finite().nullable(),
  }),
);

type RequestRow = {
  requestId: string | null;
  model: string | null;
  provider: string | null;
  timestamp: string | null;
  success: boolean | null;
  costUsd: number | null;
  latencyMs: number | null;
};
type AnalyticsRow = { model: string; requests: number; costUsd: number };
type Credits = {
  availableNanos: number;
  reservedNanos: number;
  thirtyDayUsageNanos: number | null;
  thirtyDayRequests: number;
};
const usd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value);

export function UsageDashboard({ callTool }: { callTool: CallTool }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [credits, setCredits] = useState<Credits | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [logs, setLogs] = useState<RequestRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadedDate, setLoadedDate] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [analyticsAvailable, setAnalyticsAvailable] = useState(false);
  const [logsAvailable, setLogsAvailable] = useState(false);
  async function refresh() {
    setBusy(true);
    setErrors([]);
    setCredits(null);
    setAnalytics([]);
    setLogs([]);
    setAnalyticsAvailable(false);
    setLogsAvailable(false);
    setLoaded(false);
    const results = await Promise.allSettled([
      callTool("credits_get"),
      callTool("analytics_get", { date }),
      callTool("logs_list", { since: "24h", limit: 20 }),
    ]);
    const nextErrors: string[] = [];
    const parsedCredits = creditsSchema.safeParse(
      results[0].status === "fulfilled" ? results[0].value.credits : undefined,
    );
    const parsedAnalytics = analyticsSchema.safeParse(
      results[1].status === "fulfilled"
        ? results[1].value.analytics
        : undefined,
    );
    const parsedLogs = logsSchema.safeParse(
      results[2].status === "fulfilled" ? results[2].value.logs : undefined,
    );
    setAnalyticsAvailable(parsedAnalytics.success);
    setLogsAvailable(parsedLogs.success);
    if (parsedCredits.success) setCredits(parsedCredits.data);
    else
      nextErrors.push(
        "Credits unavailable. Check credits:read permission and retry.",
      );
    if (parsedAnalytics.success) setAnalytics(parsedAnalytics.data);
    else
      nextErrors.push(
        "Analytics unavailable. Check analytics:read permission and retry.",
      );
    if (parsedLogs.success) setLogs(parsedLogs.data);
    else
      nextErrors.push(
        "Request health unavailable. Check activity:read permission and retry.",
      );
    setLoadedDate(date);
    setLoaded(true);
    setErrors(nextErrors);
    setBusy(false);
  }
  const total = analytics.reduce((sum, row) => sum + row.costUsd, 0);
  return (
    <section className="workflow-panel">
      <h2>Usage and request health</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void refresh();
        }}
      >
        <label>
          Analytics date (UTC)
          <input
            type="date"
            value={date}
            required
            disabled={busy}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <button disabled={busy}>
          {busy ? "Refreshing…" : "Refresh usage"}
        </button>
      </form>
      {errors.map((error) => (
        <p key={error} role="alert" className="error">
          {error}
        </p>
      ))}
      {credits && (
        <dl className="usage-metrics">
          <div>
            <dt>Available credits</dt>
            <dd>{usd(credits.availableNanos / 1e9)}</dd>
          </div>
          <div>
            <dt>Reserved</dt>
            <dd>{usd(credits.reservedNanos / 1e9)}</dd>
          </div>
          <div>
            <dt>30-day spend</dt>
            <dd>
              {credits.thirtyDayUsageNanos === null
                ? "Not listed"
                : usd(credits.thirtyDayUsageNanos / 1e9)}
            </dd>
          </div>
          <div>
            <dt>30-day requests</dt>
            <dd>{credits.thirtyDayRequests.toLocaleString()}</dd>
          </div>
        </dl>
      )}
      {loaded && (
        <>
          {analyticsAvailable && <h3>Model spend · {loadedDate}</h3>}
          {analyticsAvailable && !analytics.length && (
            <p className="note">No analytics returned for this date.</p>
          )}
          <ul className="spend-list">
            {analytics.map((row, index) => (
              <li key={`${row.model}-${index}`}>
                <span>
                  {row.model} · {row.requests} requests
                </span>
                <strong>{usd(row.costUsd)}</strong>
                <span
                  className="spend-bar"
                  style={{
                    width: `${total > 0 ? (row.costUsd / total) * 100 : 0}%`,
                  }}
                />
              </li>
            ))}
          </ul>
          {logsAvailable && <h3>Recent requests · last 24 hours</h3>}
          {!logsAvailable ? null : !logs.length ? (
            <p className="note">No recent requests returned.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Model / request</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row, index) => (
                    <tr key={row.requestId ?? index}>
                      <td>
                        {row.model ?? "Not listed"}
                        <small>
                          {row.requestId} · {row.provider} · {row.timestamp}
                        </small>
                      </td>
                      <td>
                        {row.success === null
                          ? "Unknown"
                          : row.success
                            ? "Success"
                            : "Failed"}
                      </td>
                      <td>
                        {row.latencyMs === null
                          ? "Not listed"
                          : `${row.latencyMs} ms`}
                      </td>
                      <td>
                        {row.costUsd === null ? "Not listed" : usd(row.costUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {logsAvailable && (
            <p className="note">
              Showing up to 20 recent requests. Refresh to update.
            </p>
          )}
        </>
      )}
    </section>
  );
}
