// src/routes/v1/generation/videos.ts
// Purpose: Data-plane route handler for videos requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { VideoGenerationSchema } from "@core/schemas";
import { guardAuth } from "@pipeline/before/guards";
import { err } from "@pipeline/before/http";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatConfig } from "@providers/openai-compatible/config";
import { getBindings } from "@/runtime/env";
import { withRuntime } from "../../utils";

const videoHandler = makeEndpointHandler({ endpoint: "video.generation", schema: VideoGenerationSchema });

export const videosRoutes = new Hono<Env>();

videosRoutes.post("/", withRuntime(videoHandler));

const OPENAI_PROVIDER_ID = "openai";
const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com";
const GOOGLE_OPERATION_PREFIX = "gaiop_";

async function proxyOpenAIVideoRequest(
    req: Request,
    auth: { requestId: string; teamId: string },
    path: string,
    method: string
) {
    const bindings = getBindings() as Record<string, string | undefined>;
    const config = resolveOpenAICompatConfig(OPENAI_PROVIDER_ID);
    const key = bindings[config.apiKeyEnv ?? "OPENAI_API_KEY"];
    if (!key) {
        return err("upstream_error", {
            reason: "openai_key_missing",
            request_id: auth.requestId,
            team_id: auth.teamId,
        });
    }

    const requestUrl = new URL(req.url);
    const url = openAICompatUrl(OPENAI_PROVIDER_ID, path) + requestUrl.search;
    const res = await fetch(url, {
        method,
        headers: {
            ...openAICompatHeaders(OPENAI_PROVIDER_ID, key),
            "Accept": req.headers.get("accept") ?? "*/*",
        },
    });

    return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
    });
}

function decodeGoogleOperationId(videoId: string): string | null {
    if (!videoId.startsWith(GOOGLE_OPERATION_PREFIX)) return null;
    const b64 = videoId.slice(GOOGLE_OPERATION_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    try {
        return atob(padded);
    } catch {
        return null;
    }
}

async function fetchGoogleOperation(operationName: string) {
    const bindings = getBindings() as Record<string, string | undefined>;
    const key = bindings.GOOGLE_AI_STUDIO_API_KEY;
    if (!key) {
        return err("upstream_error", {
            reason: "google_key_missing",
        });
    }
    const res = await fetch(`${GOOGLE_BASE_URL}/v1beta/${operationName}?key=${key}`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    });
    return res;
}

videosRoutes.get("/:videoId", withRuntime(async (req) => {
    const auth = await guardAuth(req);
    if (!auth.ok) return (auth as { ok: false; response: Response }).response;
    const id = decodeURIComponent(new URL(req.url).pathname.split("/").pop() ?? "");
    if (!id) {
        return err("validation_error", {
            reason: "missing_video_id",
            request_id: auth.value.requestId,
            team_id: auth.value.teamId,
        });
    }
    const operationName = decodeGoogleOperationId(id);
    if (operationName) {
        const res = await fetchGoogleOperation(operationName);
        if (res instanceof Response && res.headers?.get("content-type")?.includes("application/json")) {
            const json = await res.clone().json().catch(() => null);
            if (!res.ok) return res;
            const done = Boolean(json?.done);
            const output = done
                ? (json?.response?.generateVideoResponse?.generatedSamples ?? []).map((sample: any, index: number) => ({
                    index,
                    uri: sample?.video?.uri ?? null,
                    mime_type: sample?.video?.mimeType ?? null,
                }))
                : [];
            const body = {
                id,
                object: "video",
                status: done ? "completed" : "in_progress",
                provider: "google-ai-studio",
                nativeResponseId: operationName,
                result: json,
                output,
            };
            return new Response(JSON.stringify(body), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }
        return res;
    }
    return proxyOpenAIVideoRequest(req, auth.value, `/videos/${encodeURIComponent(id)}`, "GET");
}));

videosRoutes.get("/:videoId/content", withRuntime(async (req) => {
    const auth = await guardAuth(req);
    if (!auth.ok) return (auth as { ok: false; response: Response }).response;
    const path = new URL(req.url).pathname;
    const parts = path.split("/");
    const id = parts[parts.length - 2] ?? "";
    if (!id) {
        return err("validation_error", {
            reason: "missing_video_id",
            request_id: auth.value.requestId,
            team_id: auth.value.teamId,
        });
    }
    const operationName = decodeGoogleOperationId(id);
    if (operationName) {
        const res = await fetchGoogleOperation(operationName);
        if (!res.ok) return res;
        const json = await res.clone().json().catch(() => null);
        const done = Boolean(json?.done);
        if (!done) {
            return err("not_ready", {
                reason: "video_not_ready",
                request_id: auth.value.requestId,
                team_id: auth.value.teamId,
            });
        }
        const uri = json?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (!uri) {
            return err("upstream_error", {
                reason: "missing_video_uri",
                request_id: auth.value.requestId,
                team_id: auth.value.teamId,
            });
        }
        const videoRes = await fetch(uri, {
            method: "GET",
        });
        return new Response(videoRes.body, {
            status: videoRes.status,
            headers: videoRes.headers,
        });
    }
    return proxyOpenAIVideoRequest(req, auth.value, `/videos/${encodeURIComponent(id)}/content`, "GET");
}));

videosRoutes.delete("/:videoId", withRuntime(async (req) => {
    const auth = await guardAuth(req);
    if (!auth.ok) return (auth as { ok: false; response: Response }).response;
    const id = decodeURIComponent(new URL(req.url).pathname.split("/").pop() ?? "");
    if (!id) {
        return err("validation_error", {
            reason: "missing_video_id",
            request_id: auth.value.requestId,
            team_id: auth.value.teamId,
        });
    }
    const operationName = decodeGoogleOperationId(id);
    if (operationName) {
        return err("not_supported", {
            reason: "google_video_delete_unsupported",
            request_id: auth.value.requestId,
            team_id: auth.value.teamId,
        });
    }
    return proxyOpenAIVideoRequest(req, auth.value, `/videos/${encodeURIComponent(id)}`, "DELETE");
}));









