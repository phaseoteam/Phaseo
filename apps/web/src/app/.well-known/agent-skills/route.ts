import { connection } from "next/server";

import { getAgentSkillsIndex } from "@/lib/agent-discovery";

export async function GET() {
	await connection();

	return Response.json(getAgentSkillsIndex(), {
		headers: {
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
		},
	});
}
