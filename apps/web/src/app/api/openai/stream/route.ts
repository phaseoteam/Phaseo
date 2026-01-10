import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return new Response(
            JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
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

    const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "gpt-5-nano",
            input: prompt,
            stream: true,
        }),
    });

    if (!upstream.ok || !upstream.body) {
        const errorText = await upstream.text();
        return new Response(errorText || "Upstream streaming failed.", {
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
