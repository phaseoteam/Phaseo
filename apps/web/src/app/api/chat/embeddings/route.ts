import type { NextRequest } from "next/server";
import {
	parseProxyEnvelope,
	proxyGatewayPost,
} from "@/app/api/chat/_shared/gatewayProxy";

export async function POST(request: NextRequest) {
	const payload = await parseProxyEnvelope(request);

	return proxyGatewayPost({
		baseUrl: payload.baseUrl,
		path: "/embeddings",
		requestBody: payload.requestBody ?? {},
		appHeaders: payload.appHeaders,
		debug: payload.debug,
	});
}
