import { buildOAuthAuthorizationServerMetadata } from "@/lib/agent-discovery";

export async function GET() {
	return Response.json(buildOAuthAuthorizationServerMetadata(), {
		headers: {
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
		},
	});
}
