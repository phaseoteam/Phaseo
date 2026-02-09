import { NextRequest } from "next/server";

type PlaygroundRequest = {
    baseUrl?: string;
    apiKey?: string;
    requestBody?: Record<string, unknown>;
    appHeaders?: Record<string, string>;
    debug?: boolean;
};

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

type UpstreamCause = {
    code?: string;
    errno?: number;
    syscall?: string;
    address?: string;
    port?: number;
};

const getUpstreamCause = (error: unknown): UpstreamCause | null => {
    if (!error || typeof error !== "object" || !("cause" in error)) {
        return null;
    }
    const cause = (error as { cause?: unknown }).cause;
    if (!cause || typeof cause !== "object") return null;
    return {
        code:
            typeof (cause as { code?: unknown }).code === "string"
                ? (cause as { code: string }).code
                : undefined,
        errno:
            typeof (cause as { errno?: unknown }).errno === "number"
                ? (cause as { errno: number }).errno
                : undefined,
        syscall:
            typeof (cause as { syscall?: unknown }).syscall === "string"
                ? (cause as { syscall: string }).syscall
                : undefined,
        address:
            typeof (cause as { address?: unknown }).address === "string"
                ? (cause as { address: string }).address
                : undefined,
        port:
            typeof (cause as { port?: unknown }).port === "number"
                ? (cause as { port: number }).port
                : undefined,
    };
};

export async function POST(request: NextRequest) {
    let payload: PlaygroundRequest = {};
    try {
        payload = (await request.json()) as PlaygroundRequest;
    } catch {
        payload = {};
    }

    const baseUrl = payload.baseUrl ? normalizeBaseUrl(payload.baseUrl) : "";
    const apiKey = payload.apiKey?.trim() ?? "";
    const requestBody = payload.requestBody ?? {};
    const appHeaders = payload.appHeaders ?? {};
    const debug = Boolean(payload.debug);
    const streamRequested =
        (requestBody as { stream?: unknown }).stream === true;

    if (!baseUrl || !apiKey) {
        return new Response(
            JSON.stringify({ error: "Missing baseUrl or apiKey." }),
            {
                status: 400,
                headers: { "Content-Type": "application/json" },
            }
        );
    }

    let upstream: Response;
    try {
        upstream = await fetch(`${baseUrl}/responses`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                ...(debug ? { "x-gateway-debug": "true" } : {}),
                ...appHeaders,
                ...(streamRequested ? { Accept: "text/event-stream" } : {}),
            },
            body: JSON.stringify(requestBody),
        });
    } catch (error) {
        const isDevelopment = process.env.NODE_ENV !== "production";
        const cause = getUpstreamCause(error);
        const baseMessage =
            "Could not reach the upstream gateway for this chat request.";
        const devHint =
            "Gateway looks asleep. Start it with `pnpm --filter @ai-stats/gateway-api dev` and retry.";
        const details = [
            cause?.code,
            cause?.address && cause?.port
                ? `${cause.address}:${cause.port}`
                : cause?.address,
        ]
            .filter(Boolean)
            .join(" ");
        const message = isDevelopment
            ? `${baseMessage} ${devHint}${details ? ` (${details})` : ""}`
            : "The chat backend is temporarily unavailable. Please try again shortly.";

        return new Response(
            JSON.stringify({
                error: "gateway_unreachable",
                message,
                ...(isDevelopment
                    ? {
                          base_url: baseUrl,
                          cause: cause ?? undefined,
                      }
                    : {}),
            }),
            {
                status: 502,
                headers: { "Content-Type": "application/json" },
            },
        );
    }

    if (!upstream.ok) {
        const errorText = await upstream.text();
        return new Response(errorText || "Request failed.", {
            status: upstream.status || 500,
        });
    }

    if (!streamRequested || !upstream.body) {
        const responseText = await upstream.text();
        return new Response(responseText, {
            status: upstream.status,
            headers: {
                "Content-Type":
                    upstream.headers.get("content-type") ?? "application/json",
            },
        });
    }

    return new Response(upstream.body, {
        status: upstream.status,
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}
