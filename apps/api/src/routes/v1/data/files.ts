// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { withRuntime } from "../../utils";
import { authenticate } from "@pipeline/before/auth";
import type { AuthFailure } from "@pipeline/before/auth";
import { err } from "@pipeline/before/http";
import { getBindings } from "@/runtime/env";

const BASE_URL = "https://api.openai.com";

async function proxyToOpenAI(req: Request, path: string, method: string) {
    const key = getBindings().OPENAI_API_KEY;
    if (!key) {
        return err("upstream_error", { reason: "openai_key_missing" });
    }

    const headers = new Headers(req.headers);
    headers.set("Authorization", `Bearer ${key}`);
    headers.set("Host", "api.openai.com");

    const upstream = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: method === "GET" ? undefined : req.body,
    });

    return upstream;
}

async function handleUpload(req: Request) {
    const auth = await authenticate(req);
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return err("unauthorised", { reason });
    }
    return proxyToOpenAI(req, "/v1/files", "POST");
}

async function handleList(req: Request) {
    const auth = await authenticate(req);
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return err("unauthorised", { reason });
    }
    return proxyToOpenAI(req, "/v1/files", "GET");
}

async function handleRetrieve(req: Request, id: string) {
    const auth = await authenticate(req);
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return err("unauthorised", { reason });
    }
    return proxyToOpenAI(req, `/v1/files/${encodeURIComponent(id)}`, "GET");
}

export const filesRoutes = new Hono<Env>();

filesRoutes.post("/", withRuntime(handleUpload));
filesRoutes.get("/", withRuntime(handleList));
filesRoutes.get("/:id", withRuntime((req) => handleRetrieve(req, (req as any).param?.("id") ?? req.url.split("/").pop() ?? "")));

