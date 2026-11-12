const mockData = new Map<string, string>();
const mockClients: { sending: boolean; capture: jest.Mock; options: { before_send: (event: object) => unknown }; fetch: (...args: unknown[]) => Promise<unknown> }[] = [];
const mockNetwork = jest.fn(async () => ({ status: 200 }));
const mockWrite = jest.fn((key: string, value: string) => mockData.set(key, value));
const mockRead = jest.fn((key: string) => mockData.get(key) ?? null);
jest.mock("posthog-react-native", () => ({ PostHog: class {
  capture = jest.fn(); captureException = jest.fn(); on = jest.fn();
  optOut = jest.fn(async () => {}); shutdown = jest.fn(async () => {});
  fetch() { return mockNetwork(); }
  options: typeof mockClients[number]["options"];
  constructor(_key: string, mockOptions: typeof mockClients[number]["options"]) { this.options = mockOptions; mockClients.push(this as unknown as typeof mockClients[number]); }
} }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.2.3", extra: { posthogKey: "public-key", buildCommit: "abc123" } } } }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "anonymous-installation" }));
jest.mock("./storage", () => ({ kv: { getItemSync: (key: string) => mockRead(key), setItemSync: (...args: [string, string]) => mockWrite(...args) } }));
jest.mock("./store", () => ({ createStore: (initial: boolean) => { let value = initial; return { get: () => value, set: (next: boolean) => { value = next; } }; } }));

// Jest runs in development by default; exercise the release-build consent path.
Object.defineProperty(globalThis, "__DEV__", { value: false, configurable: true });
const analytics = jest.requireActual<typeof import("./appAnalytics")>("./appAnalytics");

afterEach(() => { analytics.setAppAnalyticsEnabled(false); mockClients.length = 0; mockData.clear(); mockNetwork.mockClear(); });

test("new installations create no SDK or tracking identifier before opt-in", () => {
  expect(analytics.analyticsStore.get()).toBe(false);
  analytics.startAppAnalytics();
  analytics.trackAppScreen(["(app)", "chat", "[id]"]);
  analytics.trackAppError(new Error("private error"));
  expect(mockClients).toHaveLength(0);
  expect(mockData.size).toBe(0);
});

test.each<[string, boolean]>([ ["true", true], ["false", false], ["invalid", false] ])("a saved %s preference is respected after restart", (saved, expected) => {
  mockData.set("phaseo.analytics.enabled", saved);
  jest.isolateModules(() => {
    const restarted = jest.requireActual<typeof import("./appAnalytics")>("./appAnalytics");
    expect(restarted.analyticsStore.get()).toBe(expected);
  });
});

test("unreadable preferences keep analytics off", () => {
  mockRead.mockImplementationOnce(() => { throw new Error("storage unavailable"); });
  jest.isolateModules(() => {
    const restarted = jest.requireActual<typeof import("./appAnalytics")>("./appAnalytics");
    expect(restarted.analyticsStore.get()).toBe(false);
  });
});

test("no SDK is constructed while opted out", () => {
  analytics.setAppAnalyticsEnabled(false);
  analytics.startAppAnalytics(); analytics.trackAppScreen(["(app)", "chat", "[id]"]);
  expect(mockClients).toHaveLength(0);
  analytics.setAppAnalyticsEnabled(true);
  expect(mockClients).toHaveLength(1);
  expect(mockClients[0]!.capture).toHaveBeenCalledWith("app_opened", expect.objectContaining({ app_surface: "mobile", app_version: "1.2.3" }));
});

test("opting back in cannot flush a previously revoked instance", async () => {
  analytics.setAppAnalyticsEnabled(true);
  const previous = mockClients[0]!;
  analytics.setAppAnalyticsEnabled(false); analytics.setAppAnalyticsEnabled(true);
  await previous.fetch("https://eu.i.posthog.com/batch", {});
  expect(mockNetwork).not.toHaveBeenCalled();
  expect(previous.options.before_send({ event: "app_opened" })).toBeNull();
  await mockClients[1]!.fetch("https://eu.i.posthog.com/batch", {});
  expect(mockNetwork).toHaveBeenCalledTimes(1);
});

test("only screen categories leave the app, never IDs or arbitrary routes", () => {
  expect(analytics.mobileScreen(["(app)", "chat", "[id]"])).toBe("chat/detail");
  expect(analytics.mobileScreen(["(app)", "models", "[...id]"])).toBe("models/detail");
  expect(analytics.mobileScreen(["(app)", "account", "analytics"])).toBe("account/analytics");
  expect(analytics.mobileScreen(["auth", "callback"])).toBeUndefined();
  expect(analytics.mobileScreen(["secret-title"])).toBeUndefined();
});

test("a failed preference write revokes the current queue and reports the failure", async () => {
  analytics.setAppAnalyticsEnabled(true);
  const previous = mockClients[0]!;
  mockWrite.mockImplementationOnce(() => { throw new Error("disk full"); });
  expect(analytics.setAppAnalyticsEnabled(false)).toBe(false);
  expect(analytics.analyticsStore.get()).toBe(false);
  await previous.fetch("https://eu.i.posthog.com/batch", {});
  expect(mockNetwork).not.toHaveBeenCalled();
});

test("the SDK hook sanitizes errors and enforces the persisted budget", () => {
  analytics.setAppAnalyticsEnabled(true);
  const hook = mockClients[0]!.options.before_send;
  const safe = hook({ event: "$exception", properties: { token: "public-key", $device_name: "private name", $exception_list: [{ type: "Error", value: "private prompt", stacktrace: { frames: [{ filename: "/private/index.android.bundle", lineno: 1, colno: 20 }] } }] } });
  expect(JSON.stringify(safe)).not.toMatch(/private/);
  expect(safe).toMatchObject({ properties: { app_surface: "mobile", $exception_list: [{ value: "Unhandled Error" }] } });
  expect(hook({ event: "$autocapture", properties: {} })).toBeNull();
  mockData.set("phaseo.analytics.budget", JSON.stringify({ day: new Date().toISOString().slice(0, 10), events: 200, errors: 20 }));
  expect(hook({ event: "app_opened", properties: {} })).toBeNull();
});
