import { z } from "zod";
import { request, requestText } from "./http";

const str = z.string().nullish();

const componentSchema = z.object({ name: z.string(), state: z.string().default("unknown"), label: str, parent: str }).passthrough();
const incidentSchema = z.object({ id: z.string(), name: z.string(), status: str, impact: str, impactState: str, updatedAt: str, message: str }).passthrough();

const statusSchema = z.object({
  ok: z.boolean().default(false),
  state: z.string().default("unknown"),
  label: z.string().default("Status unavailable"),
  components: z.array(componentSchema).default([]),
  incidents: z.array(incidentSchema).default([]),
  href: z.string().default("https://status.phaseo.app"),
}).passthrough();

export type PhaseoStatus = z.infer<typeof statusSchema>;
export type StatusState = "operational" | "monitoring" | "degraded" | "partial_outage" | "major_outage" | "maintenance" | "unknown";

/** What phaseo.app/status shows: the status page's overall state, its components and open incidents (cached 30 s). */
export async function getStatus(): Promise<PhaseoStatus> {
  return statusSchema.parse(await request("/api/_web/status"));
}

/**
 * The docs changelog as Markdown: the current month's page, then an archived month (`2026-09`). The docs serve every
 * page as Markdown at its address plus `.md`.
 */
export async function getChangelogPage(month?: string): Promise<string> {
  return requestText(month ? `/docs/v1/changelog/${month}.md` : "/docs/v1/changelog.md");
}
