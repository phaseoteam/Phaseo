import type { NextRequest } from "next/server";
import {
	parseProxyEnvelope,
	proxyGatewayPost,
} from "@/app/api/chat/_shared/gatewayProxy";

type AudioAction = "speech" | "transcription" | "translation";
type AudioRoutePayload = {
	requestBody?: Record<string, unknown>;
	appHeaders?: Record<string, string>;
	debug?: boolean;
	action?: AudioAction;
};

const ACTION_TO_PATH: Record<AudioAction, string> = {
	speech: "/audio/speech",
	transcription: "/audio/transcriptions",
	translation: "/audio/translations",
};

function isAudioAction(value: unknown): value is AudioAction {
	return value === "speech" || value === "transcription" || value === "translation";
}

export async function POST(request: NextRequest) {
	const payload = (await parseProxyEnvelope(request)) as AudioRoutePayload;
	const action = isAudioAction(payload.action) ? payload.action : "speech";

	return proxyGatewayPost({
		path: ACTION_TO_PATH[action],
		requestBody: payload.requestBody ?? {},
		appHeaders: payload.appHeaders,
		debug: payload.debug,
	});
}
