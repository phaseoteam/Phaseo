import { connection } from "next/server";

import { buildOAuthAuthorizationServerMetadata } from "@/lib/agent-discovery";

export async function GET() {
	await connection();

	return Response.json(buildOAuthAuthorizationServerMetadata(), {
		headers: {
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
		},
	});
}
