import { BRAND_COLOR, CATEGORIES, categoriesFrom, CHANNELS, createChannels, LEGACY_CHANNEL, type ChannelApi, type ChannelInput } from "./channels";

function fakeApi() {
  const created = new Map<string, ChannelInput>();
  const removed: string[] = [];
  const api: ChannelApi = {
    set: async (id, channel) => { created.set(id, channel); },
    remove: async (id) => { removed.push(id); },
  };
  return { api, created, removed };
}

describe("channel scheme 2", () => {
  it("has the contract's ten channels and importances", () => {
    expect(CHANNELS.map((channel) => [channel.id, channel.name, channel.importance])).toEqual([
      ["new-models", "New models", "default"],
      ["prices-providers", "Prices and providers", "low"],
      ["deprecations", "Deprecations", "default"],
      ["money", "Money", "high"],
      ["traffic", "Your traffic", "high"],
      ["security", "Security", "high"],
      ["jobs", "Jobs", "default"],
      ["account", "Account", "default"],
      ["digest", "Digest", "low"],
      ["tests", "Tests", "default"],
    ]);
  });

  it("makes every channel but tests a category", () => {
    expect(CATEGORIES).toEqual(["new-models", "prices-providers", "deprecations", "money", "traffic", "security", "jobs", "account", "digest"]);
  });

  it("creates all ten in the brand colour, and not the old channel", async () => {
    const { api, created, removed } = fakeApi();
    await createChannels(api);
    expect([...created.keys()]).toEqual(CHANNELS.map((channel) => channel.id));
    expect([...created.values()].every((channel) => channel.lightColor === BRAND_COLOR)).toBe(true);
    expect(created.get("prices-providers")).toMatchObject({ name: "Prices and providers", importance: "low" });
    expect(created.get("money")).toMatchObject({ name: "Money", importance: "high" });
    expect(created.has(LEGACY_CHANNEL.id)).toBe(false);
    expect(removed).toEqual([]);
  });

  it("keeps the scheme-1 id the server and old builds use", () => {
    expect(LEGACY_CHANNEL.id).toBe("model-updates");
  });
});

describe("categoriesFrom", () => {
  it("is null for a server without categories", () => {
    expect(categoriesFrom(undefined)).toBeNull();
    expect(categoriesFrom(null)).toBeNull();
    expect(categoriesFrom([])).toBeNull();
  });

  it("turns every missing category on, digest included", () => {
    expect(categoriesFrom({})).toEqual(Object.fromEntries(CATEGORIES.map((category) => [category, true])));
  });

  it("keeps the user's choices and ignores what it doesn't know", () => {
    const categories = categoriesFrom({ money: false, digest: false, security: "no", tests: false, weather: false });
    expect(categories).toMatchObject({ money: false, digest: false, security: true, "new-models": true });
    expect(categories).not.toHaveProperty("tests");
    expect(categories).not.toHaveProperty("weather");
  });
});
