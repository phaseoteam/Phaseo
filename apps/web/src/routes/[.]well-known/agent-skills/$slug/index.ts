import { createFileRoute } from "@tanstack/react-router";
import { getAgentSkillDocument } from "@/lib/agent-discovery";

export const Route = createFileRoute("/.well-known/agent-skills/$slug/")({
	server: {
		handlers: {
			GET: ({ params }) => {
				const skill = getAgentSkillDocument(params.slug);

				if (!skill) {
					return new Response("Not Found", { status: 404 });
				}

				return Response.json(skill, {
					headers: {
						"Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
					},
				});
			},
		},
	},
});
