import { NextRequest } from "next/server";

type PlaygroundRequest = {
    baseUrl?: string;
    apiKey?: string;
    requestBody?: Record<string, unknown>;
    appHeaders?: Record<string, string>;
    debug?: boolean;
};

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

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

    if (!baseUrl || !apiKey) {
        return new Response(
            JSON.stringify({ error: "Missing baseUrl or apiKey." }),
            {
                status: 400,
                headers: { "Content-Type": "application/json" },
            }
        );
    }

    const upstream = await fetch(`${baseUrl}/responses`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            ...(debug ? { "x-gateway-debug": "true" } : {}),
            ...appHeaders,
        },
        body: JSON.stringify(requestBody),
    });

    if (!upstream.ok) {
        const errorText = await upstream.text();
        return new Response(errorText || "Request failed.", {
            status: upstream.status || 500,
        });
    }

    if (!requestBody.stream || !upstream.body) {
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
