import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mockInitialize = vi.fn();
const mockPause = vi.fn();
const mockUnpause = vi.fn();
const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockPushError = vi.fn();
const mockNetworkEnable = vi.fn();
const mockNetworkDisable = vi.fn();
const mockTracingInitialize = vi.fn();
const mockNetworkOptions = vi.fn();
let mockPaused = false;
vi.mock("@grafana/faro-web-sdk", () => ({
  initializeFaro: (...args: unknown[]) => mockInitialize(...args),
  getWebInstrumentations: () => [{ name: "@grafana/faro-web-sdk:instrumentation-errors" }, { name: "@grafana/faro-web-sdk:instrumentation-session" }],
  FetchTransport: class {},
}));
vi.mock("@grafana/faro-web-tracing", () => ({
  TracingInstrumentation: class { initialize() { mockTracingInitialize(); } },
  getDefaultOTELInstrumentations: (options: unknown) => { mockNetworkOptions(options); return [{ enable: mockNetworkEnable, disable: mockNetworkDisable }]; },
}));
vi.mock("../../../../packages/shared/observability/browser.mjs", () => ({
  browserCollector: (url: string) => url || null,
  sanitizeFaroItem: (item: unknown) => item,
}));

const flush = () => new Promise(resolve => setImmediate(resolve));
const originalEnv = { ...process.env };
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockPaused = false;
  mockPause.mockImplementation(() => { mockPaused = true; });
  mockUnpause.mockImplementation(() => { mockPaused = false; });
  mockAdd.mockImplementation((...instrumentations) => instrumentations.forEach(instrumentation => instrumentation.initialize?.()));
  mockRemove.mockImplementation((...instrumentations) => instrumentations.forEach(instrumentation => instrumentation.destroy?.()));
  mockInitialize.mockImplementation(config => {
    config.instrumentations.forEach((instrumentation: { initialize?: () => void }) => instrumentation.initialize?.());
    return {
    pause: mockPause, unpause: mockUnpause, transports: { isPaused: () => mockPaused },
    instrumentations: { instrumentations: config.instrumentations, add: mockAdd, remove: mockRemove }, api: { pushError: mockPushError },
  }; });
  let consent: string | null = null;
  const target = new EventTarget();
  Object.defineProperty(globalThis, "window", { configurable: true, value: Object.assign(target, {
    location: { origin: "https://phaseo.app" }, localStorage: { getItem: () => consent, setItem: (_key: string, value: string) => { consent = value; } },
  }) });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "" } });
  process.env.PUBLIC_FARO_ENABLED = "true";
  process.env.PUBLIC_OBSERVABILITY_ENV = "staging";
  process.env.PUBLIC_FARO_URL = "https://faro-collector-prod-eu-west-0.grafana.net/collect/test";
});
afterEach(() => {
  process.env = { ...originalEnv };
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});
function consent(value: string) {
  window.localStorage.setItem("phaseo_analytics_consent", value);
  window.dispatchEvent(new Event("phaseo:analytics-consent"));
}
it("does not initialize before consent; revocation stops transport and removes instrumentation; reacceptance resumes once", async () => {
  const { startGrafanaMonitoring } = await import("./grafana");
  startGrafanaMonitoring({ enabled: true, url: "https://faro-collector-prod-eu-west-0.grafana.net/collect/test", environment: "staging", sampleRate: 0.1 });
  await flush();
  expect(mockInitialize).not.toHaveBeenCalled();
  consent("accepted");
  await flush();
  expect(mockInitialize).toHaveBeenCalledTimes(1);
  const ignoreExternal = mockNetworkOptions.mock.calls[0][0].ignoreUrls[1] as RegExp;
  expect(ignoreExternal.test("https://phaseo.app/api/chat")).toBe(false);
  expect(ignoreExternal.test("https://phaseoxapp/api/chat")).toBe(true);
  expect(ignoreExternal.test("https://external.example/api/chat")).toBe(true);
  consent("denied");
  expect(mockPause).toHaveBeenCalledTimes(1);
  expect(mockRemove).toHaveBeenCalledTimes(1);
  expect(mockNetworkDisable).toHaveBeenCalledTimes(1);
  consent("accepted");
  expect(mockAdd).toHaveBeenCalledTimes(1);
  expect(mockUnpause).toHaveBeenCalledTimes(1);
  expect(mockNetworkEnable).toHaveBeenCalledTimes(1);
  expect(mockTracingInitialize).toHaveBeenCalledTimes(1);
  consent("accepted");
  expect(mockUnpause).toHaveBeenCalledTimes(1);
});
it("does not initialize after consent is revoked during the lazy import", async () => {
  const { startGrafanaMonitoring } = await import("./grafana");
  startGrafanaMonitoring({ enabled: true, url: "https://faro-collector-prod-eu-west-0.grafana.net/collect/test", environment: "staging", sampleRate: 0.1 });
  consent("accepted");
  consent("denied");
  await flush();
  expect(mockInitialize).not.toHaveBeenCalled();
});
it("preserves the caught exception type for browser diagnostics after consent", async () => {
  consent("accepted");
  const { startGrafanaMonitoring } = await import("./grafana");
  startGrafanaMonitoring({ enabled: true, url: "https://faro-collector-prod-eu-west-0.grafana.net/collect/test", environment: "staging", sampleRate: 0.1 });
  await flush();
  const error = new TypeError("private-render-content");
  window.dispatchEvent(new CustomEvent("phaseo:client-error", { detail: { source: "manual", error, stack: error.stack, fatal: false } }));
  expect(mockPushError).toHaveBeenCalledWith(error, { fatal: false });
  expect(mockPushError.mock.calls[0]![0].name).toBe("TypeError");
});
it("drops signals after consent withdrawal and limits collection to 60 signals per minute", async () => {
  consent("accepted");
  const { startGrafanaMonitoring } = await import("./grafana");
  startGrafanaMonitoring({ enabled: true, url: "https://faro-collector-prod-eu-west-0.grafana.net/collect/test", environment: "staging", sampleRate: 0.1 });
  await flush();
  const hook = mockInitialize.mock.calls[0][0].beforeSend;
  for (let index = 0; index < 60; index++) expect(hook({ type: "measurement" })).not.toBeNull();
  expect(hook({ type: "measurement" })).toBeNull();
  consent("denied");
  expect(hook({ type: "measurement" })).toBeNull();
});
