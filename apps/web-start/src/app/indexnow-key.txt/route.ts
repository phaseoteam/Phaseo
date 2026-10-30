import { INDEXNOW_KEY } from "@/lib/indexnow";

export async function GET() {
	if (!INDEXNOW_KEY) {
		return new Response("Not found", { status: 404 });
	}

	return new Response(INDEXNOW_KEY, {
		status: 200,
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=0, s-maxage=86400",
		},
	});
}
