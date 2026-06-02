import { connection } from "next/server";

import { buildOpenIdConfiguration } from "@/lib/agent-discovery";

export async function GET() {
	await connection();

	return Response.json(buildOpenIdConfiguration(), {
		headers: {
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
		},
	});
}
