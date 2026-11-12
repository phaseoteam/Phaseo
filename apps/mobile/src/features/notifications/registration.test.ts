import { registerPhone, registrationKey, rejectedField, serverScheme, syncRegistration, type PhoneDevice, type SyncDeps } from "./registration";

const phone: PhoneDevice = { installationId: "install:1", expoPushToken: "ExponentPushToken[abc]", platform: "android", timeZone: "Europe/London", deviceName: "Pixel", appVersion: "0.1.0" };

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Today's server: strict schema, so any unknown field fails the whole registration.
const OLD_SERVER_REJECTION = new HttpError(400, "Unknown field: channelScheme.");

function deps(overrides: Partial<SyncDeps> = {}) {
  const calls: string[] = [];
  const bodies: object[] = [];
  let saved: string | null = null;
  const all: SyncDeps = {
    register: async (device) => { bodies.push(device); calls.push(`register:${"channelScheme" in device ? device.channelScheme : 1}`); },
    keepLegacyChannel: async () => { calls.push("keep-legacy"); },
    removeLegacyChannel: async () => { calls.push("remove-legacy"); },
    permissionGranted: async () => true,
    settings: async () => ({ enabled: true, deviceRegistered: true, categories: { money: true } }),
    device: async () => phone,
    lastKey: async () => saved,
    saveKey: async (key) => { saved = key; calls.push("save"); },
    ...overrides,
  };
  return { deps: all, calls, bodies, saved: () => saved, setSaved: (key: string | null) => { saved = key; } };
}

describe("registerPhone", () => {
  it("asks a push v2 server for scheme 2, then deletes the old channel", async () => {
    const { deps: d, calls, bodies } = deps();
    await expect(registerPhone(phone, true, d)).resolves.toBe(2);
    expect(calls).toEqual(["register:2", "remove-legacy"]);
    expect(bodies[0]).toEqual({ ...phone, channelScheme: 2 });
  });

  it("never sends channelScheme to an older server, and keeps the old channel", async () => {
    const { deps: d, calls, bodies } = deps();
    await expect(registerPhone(phone, false, d)).resolves.toBe(1);
    expect(calls).toEqual(["keep-legacy", "register:1"]);
    expect(bodies[0]).not.toHaveProperty("channelScheme");
  });

  it("falls back to scheme 1 when the server rejects the field, without deleting anything", async () => {
    let attempt = 0;
    const { deps: d, calls } = deps({ register: async () => { attempt += 1; if (attempt === 1) throw OLD_SERVER_REJECTION; } });
    await expect(registerPhone(phone, true, d)).resolves.toBe(1);
    expect(calls).toEqual(["keep-legacy"]);
    expect(attempt).toBe(2);
  });

  it("keeps the old channel when registration fails for another reason", async () => {
    const { deps: d, calls } = deps({ register: async () => { throw new HttpError(503, "Notification settings are unavailable right now."); } });
    await expect(registerPhone(phone, true, d)).rejects.toThrow("unavailable");
    expect(calls).not.toContain("remove-legacy");
  });
});

describe("rejectedField", () => {
  it("matches only a 400 that names the field", () => {
    expect(rejectedField(OLD_SERVER_REJECTION, "channelScheme")).toBe(true);
    expect(rejectedField(new HttpError(400, "timeZone is required."), "channelScheme")).toBe(false);
    expect(rejectedField(new HttpError(500, "channelScheme"), "channelScheme")).toBe(false);
    expect(rejectedField("Unknown field: channelScheme.", "channelScheme")).toBe(false);
  });
});

describe("serverScheme", () => {
  it("is 2 only for servers that return categories", () => {
    expect(serverScheme({ categories: { money: true } })).toBe(2);
    expect(serverScheme({ categories: null })).toBe(1);
    expect(serverScheme({})).toBe(1);
  });
});

describe("syncRegistration", () => {
  it("moves an existing install to scheme 2 and remembers it", async () => {
    const { deps: d, calls, saved } = deps();
    await expect(syncRegistration("user-1", d)).resolves.toBe(2);
    expect(calls).toEqual(["register:2", "remove-legacy", "save"]);
    expect(saved()).toBe(registrationKey("user-1", phone, 2));
  });

  it("sends nothing when nothing changed", async () => {
    const { deps: d, calls, setSaved } = deps();
    setSaved(registrationKey("user-1", phone, 2));
    await expect(syncRegistration("user-1", d)).resolves.toBe("unchanged");
    expect(calls).toEqual([]);
  });

  it("re-registers when the token, time zone or app version changes", async () => {
    for (const change of [{ expoPushToken: "ExponentPushToken[new]" }, { timeZone: "America/New_York" }, { appVersion: "0.2.0" }]) {
      const { deps: d, calls, setSaved } = deps({ device: async () => ({ ...phone, ...change }) });
      setSaved(registrationKey("user-1", phone, 2));
      await syncRegistration("user-1", d);
      expect(calls).toEqual(["register:2", "remove-legacy", "save"]);
    }
  });

  it("re-registers once a scheme-1 phone's server gains scheme 2", async () => {
    const { deps: d, calls, setSaved } = deps();
    setSaved(registrationKey("user-1", phone, 1));
    await expect(syncRegistration("user-1", d)).resolves.toBe(2);
    expect(calls).toEqual(["register:2", "remove-legacy", "save"]);
  });

  it("registers the old way against today's server, once", async () => {
    const { deps: d, calls } = deps({ settings: async () => ({ enabled: true, deviceRegistered: true }) });
    await expect(syncRegistration("user-1", d)).resolves.toBe(1);
    await expect(syncRegistration("user-1", d)).resolves.toBe("unchanged");
    expect(calls).toEqual(["keep-legacy", "register:1", "save"]);
  });

  it("leaves phones alone that aren't registered, are off, or lack permission", async () => {
    for (const overrides of [
      { settings: async () => ({ enabled: true, deviceRegistered: false, categories: {} }) },
      { settings: async () => ({ enabled: false, deviceRegistered: true, categories: {} }) },
      { permissionGranted: async () => false },
    ] satisfies Partial<SyncDeps>[]) {
      const { deps: d, calls } = deps(overrides);
      await expect(syncRegistration("user-1", d)).resolves.toBe("skipped");
      expect(calls).toEqual([]);
    }
  });

  it("doesn't check settings without permission", async () => {
    const settings = jest.fn(async () => ({ enabled: true, deviceRegistered: true }));
    const { deps: d } = deps({ permissionGranted: async () => false, settings });
    await syncRegistration("user-1", d);
    expect(settings).not.toHaveBeenCalled();
  });

  it("tries again next start when the old channel couldn't be deleted", async () => {
    const { deps: d, calls, saved } = deps({ removeLegacyChannel: async () => { throw new Error("channel busy"); } });
    await expect(syncRegistration("user-1", d)).rejects.toThrow("channel busy");
    expect(saved()).toBeNull();
    expect(calls).toEqual(["register:2"]);
  });

  it("re-registers for a different account on the same phone", async () => {
    const { deps: d, calls, setSaved } = deps();
    setSaved(registrationKey("user-1", phone, 2));
    await syncRegistration("user-2", d);
    expect(calls).toEqual(["register:2", "remove-legacy", "save"]);
  });
});
