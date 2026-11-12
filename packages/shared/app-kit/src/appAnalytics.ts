export type AppErrorSource = "renderer" | "main" | "renderer-crash" | "mobile" | "render";
export type AppAnalyticsEvent = "app_opened" | "screen_viewed" | "$exception";
export type AnalyticsStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

const errorNames = new Set(["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "URIError", "EvalError", "AggregateError", "AbortError", "TimeoutError"]);

// Error messages can contain prompts, credentials and local paths. Keep code locations, never the message or source context.
export function privateException(value: unknown): Error {
  try { return sanitizeException(value, new Set()); }
  catch {
    const error = new Error("Unhandled Error");
    error.stack = "Error: Unhandled Error";
    return error;
  }
}

function sanitizeException(value: unknown, seen: Set<unknown>): Error {
  seen.add(value);
  const source = value instanceof Error ? value : undefined;
  const name = source && errorNames.has(source.name) ? source.name : "Error";
  const error = new Error(`Unhandled ${name}`);
  error.name = name;
  const frames = (source?.stack ?? "").slice(0, 16000).split("\n").slice(1, 21).flatMap(line => {
    const location = /([^/\\\s():]+\.(?:[cm]?js|tsx?|bundle|jsbundle)):(\d+):(\d+)\)?$/.exec(line.trim());
    if (!location) return [];
    return [`    at app:///${location[1]}:${location[2]}:${location[3]}`];
  });
  error.stack = `${name}: ${error.message}\n${frames.join("\n")}`;
  if (source?.cause && !seen.has(source.cause) && seen.size < 3) error.cause = sanitizeException(source.cause, seen);
  return error;
}

const properties = new Set(["token", "distinct_id", "$session_id", "$lib", "$lib_version", "$geoip_disable", "$process_person_profile", "app_surface", "app_version", "app_build", "app_os", "screen_name", "error_source"]);

/** Discard SDK-enriched URLs, device names, person properties and other unreviewed fields. */
export function filterAppEvent<T extends { event: string; properties?: Record<string, unknown> }>(event: T | null): T | null {
  if (!event) return null;
  if (!["app_opened", "screen_viewed", "$exception"].includes(event.event)) return null;
  const safe = Object.fromEntries(Object.entries(event.properties ?? {}).filter(([key]) => properties.has(key)));
  if (event.event === "$exception") {
    const list = event.properties?.$exception_list;
    if (!Array.isArray(list)) return null;
    safe.$exception_list = list.slice(0, 3).flatMap(value => {
      if (!value || typeof value !== "object") return [];
      const item = value as { type?: unknown; stacktrace?: { frames?: unknown } };
      const type = typeof item.type === "string" && errorNames.has(item.type) ? item.type : "Error";
      const frames = Array.isArray(item.stacktrace?.frames) ? item.stacktrace.frames : [];
      return [{ type, value: `Unhandled ${type}`, stacktrace: { frames: frames.slice(-20).flatMap(value => {
        if (!value || typeof value !== "object") return [];
        const frame = value as { filename?: unknown; lineno?: unknown; colno?: unknown };
        const filename = typeof frame.filename === "string" ? frame.filename.split(/[\\/]/).pop()?.split(/[?#]/)[0] : undefined;
        return filename && /^[\w.-]+\.(?:[cm]?js|tsx?|bundle|jsbundle)$/.test(filename) ? [{ filename: `app:///${filename}`, lineno: typeof frame.lineno === "number" ? frame.lineno : undefined, colno: typeof frame.colno === "number" ? frame.colno : undefined, in_app: true }] : [];
      }) } }];
    });
    if (!(safe.$exception_list as unknown[]).length) return null;
  }
  return { ...event, $set: undefined, $set_once: undefined, properties: safe };
}

/** One installation's persisted daily budget; collection fails closed when preferences cannot be read or saved. */
export function createAppBudget(storage: AnalyticsStorage, now = Date.now) {
  const seen = new Set<string>();
  let previousScreen: string | undefined;
  let lastDay: string | undefined;
  return {
    take(event: AppAnalyticsEvent, fingerprint?: string) {
      const day = new Date(now()).toISOString().slice(0, 10);
      if (day !== lastDay) { seen.clear(); previousScreen = undefined; lastDay = day; }
      if (event === "screen_viewed" && fingerprint === previousScreen) return false;
      const duplicate = `${day}:${fingerprint}`;
      if (event === "$exception" && seen.has(duplicate)) return false;
      try {
        const raw = storage.getItem("phaseo.analytics.budget");
        const saved = raw ? JSON.parse(raw) as { day: string; events: number; errors: number } : undefined;
        const budget = saved?.day === day ? saved : { day, events: 0, errors: 0 };
        if (!Number.isInteger(budget.events) || !Number.isInteger(budget.errors) || budget.events < 0 || budget.errors < 0) return false;
        if (budget.events >= 200 || (event === "$exception" && budget.errors >= 20)) return false;
        storage.setItem("phaseo.analytics.budget", JSON.stringify({ ...budget, events: budget.events + 1, errors: budget.errors + Number(event === "$exception") }));
        if (event === "$exception") seen.add(duplicate);
        if (event === "screen_viewed") previousScreen = fingerprint;
        return true;
      } catch { return false; }
    },
  };
}
