import type { Faro } from "@grafana/faro-web-sdk";
import type { GrafanaBrowserConfig } from "./grafanaConfig";
import { ANALYTICS_CONSENT_EVENT, ANALYTICS_CONSENT_STORAGE_KEY, readAnalyticsConsent } from "@/lib/cookieConsent";
import { CLIENT_ERROR_EVENT, type ClientErrorPayload } from "@/lib/clientErrorReporting";
import { browserCollector, sanitizeFaroItem } from "../../../../packages/shared/observability/browser.mjs";

let instance: Faro | undefined;
let suspended: Faro["instrumentations"]["instrumentations"] = [];
let loading = false;
let bound = false;
let consentGeneration = 0;
let settings: GrafanaBrowserConfig;

async function applyConsent() {
  const generation = ++consentGeneration;
  const allowed = readAnalyticsConsent() === "accepted";
  if (!allowed) {
    instance?.pause();
    // Remove patches and listeners as well as stopping transport and propagation.
    if (instance && !suspended.length) {
      suspended = [...instance.instrumentations.instrumentations];
      instance.instrumentations.remove(...[...suspended].reverse());
    }
    return;
  }
  if (instance) {
    instance.instrumentations.add(...suspended);
    suspended = [];
    if (instance.transports.isPaused()) instance.unpause();
    return;
  }
  if (loading) return;
  loading = true;
  try {
    const [{ initializeFaro, getWebInstrumentations, FetchTransport }, { TracingInstrumentation, getDefaultOTELInstrumentations }] = await Promise.all([
      import("@grafana/faro-web-sdk"), import("@grafana/faro-web-tracing"),
    ]);
    if (generation !== consentGeneration || readAnalyticsConsent() !== "accepted") return;
    const collector = browserCollector(settings.url);
    if (!collector) return;
    const ownOrigin = window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const network = getDefaultOTELInstrumentations({ ignoreUrls: [collector, new RegExp(`^(?!${ownOrigin}/)`, "i")], propagateTraceHeaderCorsUrls: [] }).flat();
    // Faro's tracer provider is global and its default instrumentation has no
    // destroy hook. Retain that provider while explicitly unpatching fetch/XHR
    // on withdrawal, then re-enable the same instruments on renewed consent.
    class ConsentTracingInstrumentation extends TracingInstrumentation {
      private initialized = false;
      initialize() {
        if (!this.initialized) { super.initialize(); this.initialized = true; }
        else network.forEach(instrumentation => instrumentation.enable());
      }
      destroy() { network.forEach(instrumentation => instrumentation.disable()); }
    }
    let windowStart = Date.now();
    let signals = 0;
    const rate = settings.sampleRate;
    instance = initializeFaro({
      url: collector,
      transports: [new FetchTransport({ url: collector, bufferSize: 10, concurrency: 1, retry: { maxAttempts: 1 }, requestTimeoutMs: 1500 })],
      app: { name: "phaseo-web", version: process.env.PUBLIC_RELEASE, bundleId: process.env.PUBLIC_RELEASE, environment: settings.environment },
      preventGlobalExposure: true, trackResources: false, trackGeolocation: false,
      sessionTracking: { enabled: true, persistent: false, samplingRate: Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0.1 },
      batching: { enabled: true, itemLimit: 20, sendTimeout: 5000 },
      ignoreUrls: [new RegExp(`^(?!${ownOrigin}/)`, "i")],
      instrumentations: [
        ...getWebInstrumentations({ captureConsole: false, enablePerformanceInstrumentation: false, enableContentSecurityPolicyInstrumentation: false })
          .filter(instrumentation => ["errors", "web-vitals", "session", "view", "navigation"].some(name => instrumentation.name === `@grafana/faro-web-sdk:instrumentation-${name}`)),
        new ConsentTracingInstrumentation({ instrumentations: network, omitTraceContextForUnsampledSessions: true }),
      ],
      beforeSend(item) {
        if (readAnalyticsConsent() !== "accepted") return null;
        const now = Date.now();
        if (now - windowStart >= 60000) { windowStart = now; signals = 0; }
        if (++signals > 60) return null;
        return sanitizeFaroItem(item);
      },
    });
  } catch {
    // Observability must never prevent the application from starting.
  } finally {
    loading = false;
    // Consent can change twice while the lazy imports are pending.
    if (generation !== consentGeneration && !instance && readAnalyticsConsent() === "accepted") void applyConsent();
  }
}

export function startGrafanaMonitoring(config?: GrafanaBrowserConfig) {
  if (typeof window === "undefined" || bound || !config?.enabled
    || !["production", "staging"].includes(config.environment)
    || !browserCollector(config.url)) return;
  settings = config;
  bound = true;
  void applyConsent();
  window.addEventListener(ANALYTICS_CONSENT_EVENT, () => void applyConsent());
  window.addEventListener("storage", event => {
    if (event.key === ANALYTICS_CONSENT_STORAGE_KEY || event.key === null) void applyConsent();
  });
  window.addEventListener(CLIENT_ERROR_EVENT, event => {
    const payload = (event as CustomEvent<ClientErrorPayload>).detail;
    if (!payload || payload.source !== "manual" || readAnalyticsConsent() !== "accepted") return;
    // Faro already captures global errors. This event covers caught React errors.
    const error = new Error("Client error");
    if (payload.stack) error.stack = payload.stack;
    instance?.api.pushError(error, { fatal: Boolean(payload.fatal) });
  });
}
