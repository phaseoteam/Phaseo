import type { NextRequest } from "next/server";
import {
	parseProxyEnvelope,
	proxyGatewayGet,
	proxyGatewayPost,
} from "@/app/api/chat/_shared/gatewayProxy";

type VideoRoutePayload = {
	requestBody?: Record<string, unknown>;
	appHeaders?: Record<string, string>;
	debug?: boolean;
	poll?: {
		resourceId?: string;
		content?: boolean;
	};
};

export async function POST(request: NextRequest) {
	const payload = (await parseProxyEnvelope(request)) as VideoRoutePayload;

	if (payload.poll) {
		const resourceId = String(payload.poll.resourceId ?? "").trim();
		if (!resourceId) {
			return new Response(
				JSON.stringify({ error: "Missing poll.resourceId." }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const suffix = payload.poll.content ? "/content" : "";
		return proxyGatewayGet({
			path: `/videos/${encodeURIComponent(resourceId)}${suffix}`,
			appHeaders: payload.appHeaders,
			debug: payload.debug,
		});
	}

	return proxyGatewayPost({
		path: "/videos",
		requestBody: payload.requestBody ?? {},
		appHeaders: payload.appHeaders,
		debug: payload.debug,
	});
}
