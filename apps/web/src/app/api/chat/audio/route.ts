import type { NextRequest } from "next/server";
import {
	parseProxyEnvelope,
	proxyGatewayGet,
	proxyGatewayPost,
} from "@/app/api/chat/_shared/gatewayProxy";

type AudioAction = "speech" | "transcription" | "translation" | "music";
type AudioRoutePayload = {
	baseUrl?: string;
	requestBody?: Record<string, unknown>;
	appHeaders?: Record<string, string>;
	debug?: boolean;
	action?: AudioAction;
};

const ACTION_TO_PATH: Record<AudioAction, string> = {
	speech: "/audio/speech",
	transcription: "/audio/transcriptions",
	translation: "/audio/translations",
	music: "/music/generations",
};

function resolveMusicPollPath(resourceId: string): string {
	return `/music/generations/${encodeURIComponent(resourceId)}`;
}

function isAudioAction(value: unknown): value is AudioAction {
	return (
		value === "speech" ||
		value === "transcription" ||
		value === "translation" ||
		value === "music"
	);
}

export async function POST(request: NextRequest) {
	const payload = (await parseProxyEnvelope(request)) as AudioRoutePayload;
	const action = isAudioAction(payload.action) ? payload.action : "speech";

	return proxyGatewayPost({
		path: ACTION_TO_PATH[action],
		requestBody: payload.requestBody ?? {},
		appHeaders: payload.appHeaders,
		debug: payload.debug,
		baseUrl: payload.baseUrl,
	});
}

export async function GET(request: NextRequest) {
	const actionParam = request.nextUrl.searchParams.get("action");
	const action = isAudioAction(actionParam) ? actionParam : "music";
	if (action !== "music") {
		return new Response(
			JSON.stringify({ error: "Polling is only supported for music action." }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const resourceId =
		request.nextUrl.searchParams.get("resourceId")?.trim() ||
		request.nextUrl.searchParams.get("musicId")?.trim() ||
		"";

	if (!resourceId) {
		return new Response(
			JSON.stringify({ error: "Missing resourceId for music polling." }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	return proxyGatewayGet({
		path: resolveMusicPollPath(resourceId),
		debug: request.nextUrl.searchParams.get("debug") === "1",
	});
}
