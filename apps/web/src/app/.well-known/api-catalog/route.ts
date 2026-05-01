import { buildApiCatalog } from "@/lib/agent-discovery";

export async function GET() {
	return Response.json(buildApiCatalog(), {
		headers: {
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
			"Content-Type":
				'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
		},
	});
}
