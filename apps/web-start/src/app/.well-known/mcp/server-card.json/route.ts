import { connection } from "next/server";

import { buildMcpServerCard } from "@/lib/agent-discovery";

export async function GET() {
	await connection();

	return Response.json(buildMcpServerCard(), {
		headers: {
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
		},
	});
}
