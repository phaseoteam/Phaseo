import { describe, expect, it, vi } from "vite-plus/test";
import { discoverPhaseoModels, PhaseoModelCache } from "./PhaseoModels.ts";

const model = (id: string) => ({
  id,
  name: id,
  organization: { name: "Example lab" },
  capabilities: { endpoints: ["text.generate"] },
  offers: [{ routable: true }],
});
const page = (models: unknown[], offset: number, total: number) =>
  new Response(JSON.stringify({ ok: true, models, offset, total }));
const signal = () => new AbortController().signal;

describe("Phaseo model discovery", () => {
  it("loads every catalog page and drops unroutable or retired models", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page([model("lab/one"), { ...model("retired"), lifecycle: { status: "retired" } }], 0, 4),
      )
      .mockResolvedValueOnce(page([model("lab/two"), { ...model("offline"), offers: [] }], 2, 4));
    const models = await discoverPhaseoModels("fixture-token", signal(), fetcher);
    expect(models.map((value) => value.slug)).toEqual(["lab/one", "lab/two"]);
    expect(models[0]).toMatchObject({
      subProvider: "Example lab",
      capabilities: { optionDescriptors: [] },
    });
    expect(new URL(String(fetcher.mock.calls[1]![0])).searchParams.get("offset")).toBe("2");
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      redirect: "error",
      headers: { Authorization: "Bearer fixture-token" },
    });
    expect(models.some((value) => value.isDefault)).toBe(false);
  });
  it("deduplicates concurrent requests, caches for ten minutes and isolates accounts", async () => {
    let now = 1;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => page([model("lab/model")], 0, 1));
    const cache = new PhaseoModelCache(fetcher, () => now);
    await Promise.all([cache.get("first", signal()), cache.get("first", signal())]);
    await cache.get("first", signal());
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 600_001;
    await cache.get("first", signal());
    expect(fetcher).toHaveBeenCalledTimes(2);
    await cache.get("second", signal());
    expect(fetcher).toHaveBeenCalledTimes(3);
    cache.clear();
    expect(cache.stale()).toEqual([]);
  });
  it("keeps the previous catalog during a failed background refresh", async () => {
    let now = 1;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([model("old")], 0, 1))
      .mockRejectedValueOnce(new Error("Network unavailable"));
    const cache = new PhaseoModelCache(fetcher, () => now);
    await cache.get("account", signal());
    now += 600_001;
    await expect(cache.get("account", signal())).rejects.toThrow();
    expect(cache.stale().map((value) => value.slug)).toEqual(["old"]);
  });
  it("rejects repeated pages and hides upstream auth error bodies", async () => {
    const repeated = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([model("one")], 0, 3))
      .mockResolvedValueOnce(page([model("one")], 1, 3));
    await expect(discoverPhaseoModels("token", signal(), repeated)).rejects.toThrow(
      "repeated or omitted",
    );
    await expect(
      discoverPhaseoModels(
        "token",
        signal(),
        vi.fn<typeof fetch>().mockResolvedValue(new Response("secret-token", { status: 401 })),
      ),
    ).rejects.toThrow("Sign in to Phaseo again.");
  });
});
