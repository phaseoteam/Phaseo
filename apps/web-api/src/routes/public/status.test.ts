import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/_web/status", () => {
  it("returns an anonymous, edge-cacheable status summary", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        affected_components: [],
        ongoing_incidents: [],
        in_progress_maintenances: [],
        structure: {
          items: [{
            group: {
              name: "API",
              hidden: false,
              components: [{ component_id: "api-health", name: "API health (/v1/health)" }],
            },
          }],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("https://phaseo.app/api/_web/status", {}, { ENV: "development" });

    expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=30, stale-while-revalidate=60");
    expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=30, stale-while-revalidate=60");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      state: "operational",
      href: "https://status.phaseo.app",
      components: [{ name: "API health (/v1/health)", state: "operational" }],
    });
  });

  it("keeps an active incident above concurrent maintenance", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        affected_components: [],
        ongoing_incidents: [{
          impact: "major_outage",
          affected_components: [{ component_id: "api-health", status: "major_outage" }],
        }],
        in_progress_maintenances: [{
          affected_components: [{ component_id: "api-health", status: "maintenance" }],
        }],
        structure: {
          items: [{
            group: {
              name: "API",
              hidden: false,
              components: [{ component_id: "api-health", name: "API health (/v1/health)" }],
            },
          }],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("https://phaseo.app/api/_web/status", {}, { ENV: "development" });

    await expect(response.json()).resolves.toMatchObject({
      state: "major_outage",
      components: [{ name: "API health (/v1/health)", state: "major_outage" }],
    });
  });
});
