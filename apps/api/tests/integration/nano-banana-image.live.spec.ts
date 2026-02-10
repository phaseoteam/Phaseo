import { beforeAll, describe, expect, it } from "vitest";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1";
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY ?? "";
const LIVE_RUN = (process.env.LIVE_RUN ?? "").trim() === "1";
const DEFAULT_MODELS = [
    "google/gemini-2-5-flash-image",
    "google/gemini-3-pro-image-preview",
    "google/gemini-2-5-flash-image-preview",
] as const;
const MODEL = (process.env.LIVE_NANO_BANANA_MODEL ?? "").trim();

const describeLive = LIVE_RUN ? describe : describe.skip;

function resolveGatewayUrl(path: string): string {
    const base = GATEWAY_URL.endsWith("/") ? GATEWAY_URL.slice(0, -1) : GATEWAY_URL;
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${base}${suffix}`;
}

function getHeaders(): Record<string, string> {
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GATEWAY_API_KEY}`,
    };
}

type ModelsResponse = {
    total?: number;
    models?: Array<{
        model_id?: string;
        providers?: Array<{
            api_provider_id?: string;
            endpoint?: string;
            is_active_gateway?: boolean;
        }>;
    }>;
};

async function discoverNanoBananaModel(): Promise<string> {
    if (MODEL) return MODEL;

    const discovered = new Set<string>();
    let offset = 0;
    const limit = 250;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total) {
        const url = new URL(resolveGatewayUrl("/models"));
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("offset", String(offset));

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: getHeaders(),
        });
        const payload = (await response.json()) as ModelsResponse;
        if (!response.ok) break;

        const models = payload.models ?? [];
        for (const model of models) {
            if (!model?.model_id) continue;
            const hasGoogleTextGenerate = (model.providers ?? []).some((provider) =>
                provider?.api_provider_id === "google-ai-studio" &&
                provider?.endpoint === "text.generate" &&
                provider?.is_active_gateway !== false
            );
            if (hasGoogleTextGenerate) discovered.add(model.model_id);
        }

        total = typeof payload.total === "number" ? payload.total : models.length;
        offset += limit;
        if (!models.length) break;
    }

    for (const candidate of DEFAULT_MODELS) {
        if (discovered.has(candidate)) return candidate;
    }
    return DEFAULT_MODELS[0];
}

function getTotalTokens(usage: any): number {
    if (!usage || typeof usage !== "object") return 0;
    const total = usage.total_tokens ?? usage.totalTokens;
    if (typeof total === "number") return total;
    const input = usage.input_tokens ?? usage.prompt_tokens ?? usage.input_text_tokens ?? 0;
    const output = usage.output_tokens ?? usage.completion_tokens ?? usage.output_text_tokens ?? 0;
    return Number(input) + Number(output);
}

function hasUnsupportedModalitiesError(payload: any): boolean {
    const details = Array.isArray(payload?.details)
        ? payload.details
        : Array.isArray(payload?.error?.details)
            ? payload.error.details
            : [];
    return details.some((detail: any) => {
        const path = Array.isArray(detail?.path) ? detail.path.join(".") : "";
        const param = detail?.params?.param;
        return path === "modalities" || param === "modalities";
    });
}

async function postJson(path: string, body: Record<string, unknown>) {
    const res = await fetch(resolveGatewayUrl(path), {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let jsonBody: any = null;
    try {
        jsonBody = text ? JSON.parse(text) : null;
    } catch {
        jsonBody = { raw: text };
    }
    return { res, jsonBody, text };
}

async function postWithModalitiesFallback(path: "/responses" | "/chat/completions" | "/messages", model: string) {
    const prompt = "Generate a tiny blue square image and include it in your response.";
    const baseBody =
        path === "/responses"
            ? {
                model,
                input: prompt,
                temperature: 0,
                max_output_tokens: 24,
                usage: true,
                meta: true,
            }
            : path === "/chat/completions"
                ? {
                    model,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0,
                    max_output_tokens: 24,
                    usage: true,
                    meta: true,
                }
                : {
                    model,
                    max_tokens: 64,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0,
                    usage: true,
                    meta: true,
                };

    const withModalities = await postJson(path, {
        ...baseBody,
        modalities: ["text", "image"],
    });
    if (withModalities.res.ok) return withModalities;

    if (withModalities.res.status !== 400 || !hasUnsupportedModalitiesError(withModalities.jsonBody)) {
        throw new Error(`${path} failed (${withModalities.res.status}): ${withModalities.text}`);
    }

    console.warn(`[nano-banana-live] ${path}: modalities unsupported for ${model}, retrying without modalities`);
    const withoutModalities = await postJson(path, baseBody);
    if (!withoutModalities.res.ok) {
        throw new Error(`${path} retry failed (${withoutModalities.res.status}): ${withoutModalities.text}`);
    }
    return withoutModalities;
}

function extractResponsesImages(payload: any): any[] {
    const output = Array.isArray(payload?.output) ? payload.output : [];
    const images: any[] = [];
    for (const item of output) {
        if (item?.type === "output_image") {
            images.push(item);
            continue;
        }
        if (item?.type !== "message" || !Array.isArray(item.content)) continue;
        for (const block of item.content) {
            if (block?.type === "output_image") {
                images.push(block);
            }
        }
    }
    return images;
}

function extractChatImages(payload: any): any[] {
    const message = payload?.choices?.[0]?.message;
    return Array.isArray(message?.images) ? message.images : [];
}

function extractMessagesImages(payload: any): any[] {
    const blocks = Array.isArray(payload?.content) ? payload.content : [];
    return blocks.filter((block: any) => block?.type === "image");
}

describeLive("Nano Banana image output on text.generate surfaces", () => {
    let selectedModel = MODEL || DEFAULT_MODELS[0];

    beforeAll(async () => {
        if (!GATEWAY_API_KEY) {
            throw new Error("GATEWAY_API_KEY is required when LIVE_RUN=1");
        }
        selectedModel = await discoverNanoBananaModel();
        console.log(`[nano-banana-live] using model=${selectedModel}`);
    });

    it("returns output_image content on /responses", async () => {
        const { jsonBody } = await postWithModalitiesFallback("/responses", selectedModel);
        const images = extractResponsesImages(jsonBody);
        expect(images.length, "expected at least one output_image on /responses").toBeGreaterThan(0);
        const first = images[0];
        const hasImageData =
            typeof first?.b64_json === "string" ||
            typeof first?.image_url?.url === "string";
        expect(hasImageData, "output_image should contain b64_json or image_url.url").toBe(true);
        expect(getTotalTokens(jsonBody?.usage), "/responses should include non-zero usage").toBeGreaterThan(0);
    }, 120_000);

    it("returns image blocks on /chat/completions", async () => {
        const { jsonBody } = await postWithModalitiesFallback("/chat/completions", selectedModel);
        const images = extractChatImages(jsonBody);
        expect(images.length, "expected at least one image in choices[0].message.images").toBeGreaterThan(0);
        const first = images[0];
        expect(typeof first?.image_url?.url, "image block should contain image_url.url").toBe("string");
        expect(getTotalTokens(jsonBody?.usage), "/chat/completions should include non-zero usage").toBeGreaterThan(0);
    }, 120_000);

    it("returns Anthropic-style image blocks on /messages", async () => {
        const { jsonBody } = await postWithModalitiesFallback("/messages", selectedModel);
        const images = extractMessagesImages(jsonBody);
        expect(images.length, "expected at least one image block in messages content").toBeGreaterThan(0);
        const first = images[0];
        const sourceType = first?.source?.type;
        expect(
            sourceType === "base64" || sourceType === "url",
            "image block source.type should be base64 or url"
        ).toBe(true);
        expect(getTotalTokens(jsonBody?.usage), "/messages should include non-zero usage").toBeGreaterThan(0);
    }, 120_000);
});
