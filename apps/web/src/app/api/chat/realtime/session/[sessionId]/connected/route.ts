import type { NextRequest } from "next/server";
import { proxyRealtimeSessionAction } from "../../_shared";

export async function POST(
	_request: NextRequest,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	const { sessionId } = await params;
	return proxyRealtimeSessionAction({ sessionId, action: "connected" });
}
