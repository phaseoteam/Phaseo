import { getAgentSkillDocument } from "@/lib/agent-discovery";

type RouteContext = {
	params: Promise<{
		slug: string;
	}>;
};

export async function GET(_request: Request, context: RouteContext) {
	const params = await context.params;
	const skill = getAgentSkillDocument(params.slug);

	if (!skill) {
		return new Response("Not Found", { status: 404 });
	}

	return Response.json(skill, {
		headers: {
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
		},
	});
}
