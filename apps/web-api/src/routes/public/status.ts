import { Hono } from "hono";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

type StatusState = "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance" | "unknown";
type InstatusComponent = { name?: unknown; status?: unknown; children?: InstatusComponent[] };

const STATUS_PAGE_HREF = "https://phaseo.instatus.com/";
const DEFAULT_SUMMARY_URL = "https://phaseo.instatus.com/api/v2/summary.json";
const DEFAULT_COMPONENTS_URL = "https://phaseo.instatus.com/api/v2/components.json";

function normalizeStatus(value: unknown): { state: StatusState; label: string } {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return { state: "unknown", label: "Status unavailable" };
  if (["up", "operational", "all_systems_operational"].includes(normalized)) return { state: "operational", label: "All systems operational" };
  if (normalized === "hasissues" || normalized.includes("degraded")) return { state: "degraded", label: "Service issues reported" };
  if (normalized.includes("maintenance")) return { state: "maintenance", label: "Under maintenance" };
  if (normalized.includes("major") || normalized === "down") return { state: "major_outage", label: "Major outage" };
  if (normalized.includes("partial")) return { state: "partial_outage", label: "Partial outage" };
  return { state: "unknown", label: raw };
}

function statusFromSummary(payload: unknown) {
  const data = payload as { page?: { status?: unknown }; status?: { description?: unknown; indicator?: unknown } };
  return normalizeStatus(data.page?.status ?? data.status?.description ?? data.status?.indicator);
}

function flattenComponents(components: InstatusComponent[] | undefined, parent: string | null = null): Array<{ name: string; status: string; state: StatusState; label: string; parent: string | null }> {
  if (!Array.isArray(components)) return [];
  return components.flatMap((component) => {
    const name = String(component.name ?? "").trim().replace(/\bAI\s+Stats\b/g, "Phaseo").replace(/^Models API \(\/v1\/api\/models\)$/, "API Gateway");
    const status = normalizeStatus(component.status);
    const current = name ? [{ name, status: String(component.status ?? ""), ...status, parent }] : [];
    const childParent = name ? (parent ? `${parent} / ${name}` : name) : parent;
    return [...current, ...flattenComponents(component.children, childParent)];
  });
}

function withCacheBuster(value: string) {
  const url = new URL(value);
  url.searchParams.set("_", Date.now().toString());
  return url.toString();
}

export const publicStatusRouter = new Hono<{ Bindings: Env }>();

publicStatusRouter.get("/status", async (c) => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 3500);
	try {
		const [summaryResult, componentsResult] = await Promise.allSettled([
			fetch(withCacheBuster(c.env.STATUS_PAGE_SUMMARY_URL?.trim() || DEFAULT_SUMMARY_URL), { headers: { accept: "application/json" }, signal: controller.signal }),
			fetch(withCacheBuster(c.env.STATUS_PAGE_COMPONENTS_URL?.trim() || DEFAULT_COMPONENTS_URL), { headers: { accept: "application/json" }, signal: controller.signal }),
		]);
		if (summaryResult.status === "rejected" || !summaryResult.value.ok) throw new Error("status_summary_unavailable");
		const status = statusFromSummary(await summaryResult.value.json());
		const components = componentsResult.status === "fulfilled" && componentsResult.value.ok
			? flattenComponents((await componentsResult.value.json() as { components?: InstatusComponent[] }).components).slice(0, 24)
			: [];
		return withPublicCache(c.json({ ok: true, ...status, components, href: STATUS_PAGE_HREF }), { edgeTtlSeconds: 30, staleWhileRevalidateSeconds: 60 });
	} catch {
		return c.json({ ok: false, state: "unknown" satisfies StatusState, label: "Status unavailable", components: [], href: STATUS_PAGE_HREF });
	} finally {
		clearTimeout(timeout);
	}
});
