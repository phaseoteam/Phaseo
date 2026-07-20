import type { NextRequest } from "next/server";
import { proxyRealtimeSessionAction } from "../../_shared";

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	const { sessionId } = await params;
	const body = await request.json().catch(() => ({}));
	return proxyRealtimeSessionAction({
		sessionId,
		action: "finalize",
		body: body && typeof body === "object" ? body : {},
	});
}
