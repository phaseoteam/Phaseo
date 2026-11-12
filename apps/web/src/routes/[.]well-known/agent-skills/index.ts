import { createFileRoute } from "@tanstack/react-router";
import { getAgentSkillsIndex } from "@/lib/agent-discovery";

export const Route = createFileRoute("/.well-known/agent-skills/")({
	server: {
		handlers: {
			GET: () =>
				Response.json(getAgentSkillsIndex(), {
					headers: {
						"Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
					},
				}),
		},
	},
});
