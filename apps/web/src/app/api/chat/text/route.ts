import type { NextRequest } from "next/server";
import {
	parseProxyEnvelope,
	proxyGatewayPost,
} from "@/app/api/chat/_shared/gatewayProxy";

export async function POST(request: NextRequest) {
	const payload = await parseProxyEnvelope(request);
	const streamRequested =
		(payload.requestBody as { stream?: unknown } | undefined)?.stream === true;

	return proxyGatewayPost({
		baseUrl: payload.baseUrl,
		path: "/responses",
		requestBody: payload.requestBody ?? {},
		appHeaders: payload.appHeaders,
		debug: payload.debug,
		stream: streamRequested,
	});
}
