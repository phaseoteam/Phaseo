import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/_web/status", () => {
	const monitoringIncident = {
		id: "incident-1", name: "API disruption", status: "monitoring",
		current_worst_impact: "full_outage",
		last_update_at: "2026-10-03T09:33:04.331Z",
		last_update_message: "A fix has been applied. We are monitoring recovery.",
		affected_components: [
			{ id: "models", name: "Models API (/v1/models)", current_status: "full_outage" },
			{ id: "generations", name: "Generations API", current_status: "full_outage" },
		],
	};

	it("shows recovery progress while preserving reported impact and the latest update", async () => {
		vi.stubGlobal("fetch", vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ ongoing_incidents: [monitoringIncident] })))
			.mockResolvedValueOnce(new Response("", { status: 503 })));
		const response = await app.request("https://phaseo.app/api/_web/status", {}, { ENV: "development" });
		await expect(response.json()).resolves.toMatchObject({
			state: "monitoring", label: "Monitoring recovery",
			components: [
				{ name: "Models API (/v1/models)", state: "major_outage" },
				{ name: "Generations API", state: "major_outage" },
			],
			incidents: [{ id: "incident-1", status: "monitoring", impact: "Major outage", message: monitoringIncident.last_update_message, updatedAt: monitoringIncident.last_update_at }],
		});
	});

	it.each(["investigating", "identified", undefined])("keeps outage status when another incident is %s", async (status) => {
		vi.stubGlobal("fetch", vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ ongoing_incidents: [monitoringIncident, { ...monitoringIncident, id: "incident-2", status }] })))
			.mockResolvedValueOnce(new Response("", { status: 503 })));
		const response = await app.request("https://phaseo.app/api/_web/status", {}, { ENV: "development" });
		await expect(response.json()).resolves.toMatchObject({ state: "major_outage", label: "2 services affected" });
	});

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

  it("uses affected components when the widget has no page structure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        affected_components: [{ name: "API health (/v1/health)", status: "degraded" }],
        ongoing_incidents: [],
        in_progress_maintenances: [],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("https://phaseo.app/api/_web/status", {}, { ENV: "development" });

    await expect(response.json()).resolves.toMatchObject({
      state: "degraded",
      components: [{ name: "API health (/v1/health)", state: "degraded" }],
    });
  });
});
