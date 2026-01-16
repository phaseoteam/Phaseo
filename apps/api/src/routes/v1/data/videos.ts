// src/routes/v1/generation/videos.ts
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
    return proxyOpenAIVideoRequest(req, auth.value, `/videos/${encodeURIComponent(id)}`, "DELETE");
}));
