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

async function proxyBatch(req: Request, path: string, method: string, body?: BodyInit | null) {
    const key = getBindings().OPENAI_API_KEY;
    if (!key) return err("upstream_error", { reason: "openai_key_missing" });

    const headers = new Headers(req.headers);
    headers.set("Authorization", `Bearer ${key}`);
    headers.set("Host", "api.openai.com");

    const upstream = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body,
    });
    return upstream;
}

async function handleCreate(req: Request) {
    const auth = await authenticate(req);
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return err("unauthorised", { reason });
    }
    return proxyBatch(req, "/v1/batches", "POST", req.body);
}

async function handleRetrieve(req: Request, id: string) {
    const auth = await authenticate(req);
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return err("unauthorised", { reason });
    }
    return proxyBatch(req, `/v1/batches/${encodeURIComponent(id)}`, "GET");
}

export const batchRoutes = new Hono<Env>();

batchRoutes.post("/", withRuntime(handleCreate));
batchRoutes.get("/:id", withRuntime((req) => handleRetrieve(req, (req as any).param?.("id") ?? req.url.split("/").pop() ?? "")));

