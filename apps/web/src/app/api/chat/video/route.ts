import type { NextRequest } from "next/server";
import {
	parseProxyEnvelope,
	proxyGatewayGet,
	proxyGatewayPost,
} from "@/app/api/chat/_shared/gatewayProxy";

const VIDEO_CHAT_API_ENABLED = false;

function notImplementedYetResponse() {
	return new Response(
		JSON.stringify({
			error: "Video generation is coming soon.",
			code: "not_implemented_yet",
		}),
		{
			status: 501,
			headers: { "Content-Type": "application/json" },
		},
	);
}

type VideoRoutePayload = {
	requestBody?: Record<string, unknown>;
	appHeaders?: Record<string, string>;
	debug?: boolean;
	poll?: {
		resourceId?: string;
		content?: boolean;
	};
};

function resolveVideoPollPath(resourceId: string, content: boolean): string {
	const suffix = content ? "/content" : "";
	return `/videos/${encodeURIComponent(resourceId)}${suffix}`;
}

function normalizeStatusFilter(value: string): "queued" | "in_progress" | "completed" | "failed" | null {
	const status = value.trim().toLowerCase();
	if (!status) return null;
	if (status === "queued" || status === "pending") return "queued";
	if (status === "in_progress" || status === "processing" || status === "running") return "in_progress";
	if (status === "completed" || status === "complete" || status === "succeeded" || status === "success") return "completed";
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	return null;
}

function resolveVideoListPath(request: NextRequest): string {
	const limitValue = Number(request.nextUrl.searchParams.get("limit") ?? "");
	const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(200, Math.trunc(limitValue))) : 50;
	const statuses = request.nextUrl.searchParams
		.getAll("status")
		.flatMap((value) => value.split(",").map((part) => part.trim()).filter(Boolean))
		.map((value) => normalizeStatusFilter(value))
		.filter((value): value is "queued" | "in_progress" | "completed" | "failed" => value !== null);
	const uniqueStatuses = Array.from(new Set(statuses));
	const query = new URLSearchParams();
	query.set("limit", String(limit));
	for (const status of uniqueStatuses) {
		query.append("status", status);
	}
	const queryString = query.toString();
	return queryString ? `/videos?${queryString}` : "/videos";
}

function isTruthyQueryValue(value: string | null): boolean {
	if (!value) return false;
	const normalized = value.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes";
}

export async function GET(request: NextRequest) {
	if (!VIDEO_CHAT_API_ENABLED) return notImplementedYetResponse();

	if (isTruthyQueryValue(request.nextUrl.searchParams.get("list"))) {
		return proxyGatewayGet({
			path: resolveVideoListPath(request),
		});
	}

	const resourceId = String(
		request.nextUrl.searchParams.get("resourceId") ?? "",
	).trim();
	if (!resourceId) {
		return new Response(
			JSON.stringify({ error: "Missing resourceId query parameter." }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const content = isTruthyQueryValue(request.nextUrl.searchParams.get("content"));
	return proxyGatewayGet({
		path: resolveVideoPollPath(resourceId, content),
	});
}

export async function POST(request: NextRequest) {
	if (!VIDEO_CHAT_API_ENABLED) return notImplementedYetResponse();

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

		return proxyGatewayGet({
			path: resolveVideoPollPath(resourceId, Boolean(payload.poll.content)),
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
