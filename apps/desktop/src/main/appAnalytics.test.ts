import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desktopScreen } from "../shared/analytics";

const clients = vi.hoisted(() => [] as { options: { fetch: (url: string, options: object) => Promise<unknown>; before_send: (event: object) => unknown }; capture: ReturnType<typeof vi.fn>; optOut: ReturnType<typeof vi.fn> }[]);
vi.mock("posthog-node", () => ({ PostHog: class {
  capture = vi.fn(); optOut = vi.fn(); shutdown = vi.fn(async () => {}); on = vi.fn(); captureException = vi.fn();
  constructor(_key: string, public options: typeof clients[number]["options"]) { clients.push(this); }
} }));
import { createDesktopAnalytics } from "./appAnalytics";

const directories: string[] = [];
const create = (packaged = true) => {
  const directory = mkdtempSync(join(tmpdir(), "phaseo-analytics-")); directories.push(directory);
  vi.stubGlobal("__PHASEO_ANALYTICS__", { key: "public-key", host: "https://eu.i.posthog.com" });
  return createDesktopAnalytics(directory, packaged);
};
beforeEach(() => { vi.stubEnv("CI", ""); });
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); clients.length = 0; vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("desktop app analytics", () => {
  it.each(["true", "1"])("never collects in packaged CI smoke tests with CI=%s", ci => {
    vi.stubEnv("CI", ci);
    create().configure(true);
    expect(clients).toHaveLength(0);
  });
  it("creates no SDK or traffic without consent, or in a development build", () => {
    const analytics = create(); analytics.configure(false); analytics.screen("chat");
    create(false).configure(true);
    expect(clients).toHaveLength(0);
  });
  it("keeps old queues revoked after opting back in", async () => {
    const network = vi.fn(async () => new Response("{}")); vi.stubGlobal("fetch", network);
    const analytics = create(); analytics.configure(true);
    const previous = clients[0]!;
    analytics.configure(false); analytics.configure(true);
    expect(previous.optOut).toHaveBeenCalledOnce();
    await previous.options.fetch("https://eu.i.posthog.com/batch", {});
    expect(previous.options.before_send({ event: "app_opened" })).toBeNull();
    expect(network).not.toHaveBeenCalled();
    await clients[1]!.options.fetch("https://eu.i.posthog.com/batch", {});
    expect(network).toHaveBeenCalledOnce();
    await analytics.close();
  });
  it("accepts only named screens, never IDs, URLs or chat titles", () => {
    expect(desktopScreen("settings/general")).toBe("settings/general");
    for (const value of ["chat/private-id", "https://secret", "private chat", null]) expect(desktopScreen(value)).toBeUndefined();
  });
  it("attaches the current safe screen to errors and clears it after unknown screens or withdrawal", () => {
    const analytics = create(); analytics.configure(true); analytics.screen("settings/general");
    const event = (type: string) => ({ event: "$exception", properties: { $exception_list: [{ type }] } });
    expect(clients[0]!.options.before_send(event("TypeError"))).toMatchObject({ properties: { screen_name: "settings/general" } });
    expect(clients[0]!.options.before_send(event("RangeError"))).toMatchObject({ properties: { screen_name: "settings/general" } });
    expect(clients[0]!.options.before_send(event("TypeError"))).toBeNull();
    analytics.screen("chat/private-id");
    expect(clients[0]!.options.before_send(event("SyntaxError"))).not.toHaveProperty("properties.screen_name");
    analytics.screen("settings/general"); analytics.configure(false); analytics.configure(true);
    expect(clients[1]!.options.before_send(event("ReferenceError"))).not.toHaveProperty("properties.screen_name");
  });
});
