import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
    const gatewayUrl = "http://127.0.0.1:8787/v1"
    const gatewayKey = process.env.GATEWAY_KEY;

    if (!gatewayUrl || !gatewayKey) {
        return new Response(
            JSON.stringify({ error: "Missing OPENAI_GATEWAY_URL or GATEWAY_KEY" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }

    let prompt = "";
    try {
        const body = await request.json();
        if (typeof body?.prompt === "string") {
            prompt = body.prompt;
        }
    } catch {
        prompt = "";
    }

    if (!prompt.trim()) {
        return new Response(
            JSON.stringify({ error: "Prompt is required" }),
            {
                status: 400,
                headers: { "Content-Type": "application/json" },
            }
        );
    }

    const upstream = await fetch(`${gatewayUrl}/responses`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${gatewayKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "openai/gpt-5-nano-2025-08-07",
            input: prompt,
            stream: true,
        }),
    });

    if (!upstream.ok || !upstream.body) {
        const errorText = await upstream.text();
        return new Response(errorText || "Gateway streaming failed.", {
            status: upstream.status || 500,
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
