import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { PostHog } from "posthog-node";
import { createAppBudget, filterAppEvent, privateException, type AppAnalyticsEvent, type AppErrorSource } from "@phaseo/app-kit/app-analytics";
import { desktopScreen } from "../shared/analytics";
import { buildStamp } from "./buildInfo";

declare const __PHASEO_ANALYTICS__: { key: string; host: string } | undefined;

export function createDesktopAnalytics(directory: string, packaged: boolean) {
  const config = typeof __PHASEO_ANALYTICS__ === "undefined" ? undefined : __PHASEO_ANALYTICS__;
  let enabled = false;
  let client: PostHog | undefined;
  let revoke: (() => void) | undefined;
  let distinctId: string;
  const stateFile = `${directory}/analytics.json`;
  const storage = {
    getItem(key: string): string | null { try { return (JSON.parse(readFileSync(stateFile, "utf8")) as Record<string, string>)[key] ?? null; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } },
    setItem(key: string, value: string) { const data = readState(); writeFileSync(stateFile, JSON.stringify({ ...data, [key]: value }), { mode: 0o600 }); },
  };
  function readState(): Record<string, string> { try { return JSON.parse(readFileSync(stateFile, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; } }
  const budget = createAppBudget(storage);
  const meta = { app_surface: "desktop", app_version: buildStamp.version ?? "unknown", app_build: buildStamp.commit ?? "unknown", app_os: process.platform, $process_person_profile: false };
  const capture = (event: "app_opened" | "screen_viewed", properties = {}) => { if (enabled) client?.capture({ distinctId, event, properties: { ...meta, ...properties } }); };
  return {
    configure(allowed: boolean) {
      enabled = allowed && packaged && !["true", "1"].includes(process.env.CI ?? "") && Boolean(config?.key) && /^https:\/\/(?:eu|us)\.i\.posthog\.com$/.test(config?.host ?? "");
      if (!enabled) {
        revoke?.(); revoke = undefined;
        const previous = client; client = undefined;
        if (previous) { previous.optOut(); void previous.shutdown(1000).catch(() => {}); }
        return;
      }
      if (client) return;
      try {
        let sending = true;
        revoke = () => { sending = false; };
        distinctId = storage.getItem("id") || randomUUID(); storage.setItem("id", distinctId);
        client = new PostHog(config!.key, {
          host: config!.host, disableGeoip: true, flushAt: 10, flushInterval: 15000, maxQueueSize: 100,
          fetchRetryCount: 1, requestTimeout: 5000, enableExceptionAutocapture: false,
          // Consent is checked at transport time too, so revocation discards already queued events.
          fetch: (url, options) => sending ? fetch(url, options) : Promise.resolve(new Response("{}", { status: 200 })),
          before_send: event => {
            if (!sending) return null;
            const safe = filterAppEvent(event);
            if (!safe || !budget.take(safe.event as AppAnalyticsEvent, String(safe.properties?.screen_name ?? JSON.stringify(safe.properties?.$exception_list)))) return null;
            return safe;
          },
        });
        client.on("error", () => {});
        capture("app_opened");
      } catch { enabled = false; revoke?.(); const previous = client; client = undefined; void previous?.shutdown(1000).catch(() => {}); }
    },
    screen(value: unknown) { const screen = desktopScreen(value); if (screen) capture("screen_viewed", { screen_name: screen }); },
    error(error: unknown, source: AppErrorSource) { if (enabled) client?.captureException(privateException(error), distinctId, { ...meta, error_source: source }); },
    async close() { await client?.shutdown(1000).catch(() => {}); },
  };
}
