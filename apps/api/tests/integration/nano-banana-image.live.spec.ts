import { beforeAll, describe, expect, it } from "vitest";
import { parseSseJson, readSseFrames } from "../helpers/sse";
import { resolveGatewayApiKeyFromEnv } from "../helpers/gatewayKey";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1";
const GATEWAY_API_KEY = resolveGatewayApiKeyFromEnv(process.env);
const LIVE_RUN = (process.env.LIVE_RUN ?? "").trim() === "1";
const DEFAULT_MODELS = [
    "google/gemini-2.5-flash-image",
    "google/gemini-2-5-flash-image-2025-10-02",
    "google/gemini-2-5-flash-image-preview-2025-08-25",
    "google/gemini-3-pro-image-preview-2025-11-20",
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
                max_output_tokens: 24,
                usage: true,
                meta: true,
            }
            : path === "/chat/completions"
                ? {
                    model,
                    messages: [{ role: "user", content: prompt }],
                    max_output_tokens: 24,
                    usage: true,
                    meta: true,
                }
                : {
                    model,
                    max_tokens: 64,
                    messages: [{ role: "user", content: prompt }],
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

async function postStreamWithModalitiesFallback(path: "/responses" | "/chat/completions", model: string) {
    const prompt = "Generate a tiny blue square image and include it in your response.";
    const baseBody =
        path === "/responses"
            ? {
                model,
                input: prompt,
                max_output_tokens: 64,
                usage: true,
                meta: true,
                stream: true,
            }
            : {
                model,
                messages: [{ role: "user", content: prompt }],
                max_output_tokens: 64,
                usage: true,
                meta: true,
                stream: true,
            };

    const withModalities = await fetch(resolveGatewayUrl(path), {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
            ...baseBody,
            modalities: ["text", "image"],
        }),
    });
    if (withModalities.ok) return withModalities;

    const fallbackText = await withModalities.clone().text();
    let fallbackJson: any = null;
    try {
        fallbackJson = fallbackText ? JSON.parse(fallbackText) : null;
    } catch {
        fallbackJson = { raw: fallbackText };
    }

    if (withModalities.status !== 400 || !hasUnsupportedModalitiesError(fallbackJson)) {
        throw new Error(`${path} stream failed (${withModalities.status}): ${fallbackText}`);
    }

    console.warn(`[nano-banana-live] ${path}: modalities unsupported for ${model}, retrying stream without modalities`);
    const withoutModalities = await fetch(resolveGatewayUrl(path), {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(baseBody),
    });
    if (!withoutModalities.ok) {
        const text = await withoutModalities.text();
        throw new Error(`${path} stream retry failed (${withoutModalities.status}): ${text}`);
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

function extractUsage(payload: any): any {
    if (payload?.usage && typeof payload.usage === "object") return payload.usage;
    if (payload?.response?.usage && typeof payload.response.usage === "object") return payload.response.usage;
    return null;
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

    it("streams image output on /responses with non-zero usage", async () => {
        const res = await postStreamWithModalitiesFallback("/responses", selectedModel);
        const frames = await readSseFrames(res);
        const objects = parseSseJson(frames).filter((entry) => entry && typeof entry === "object") as any[];
        const hasImage = objects.some((entry) => extractResponsesImages(entry?.response ?? entry).length > 0);
        expect(hasImage, "expected at least one output_image in /responses stream").toBe(true);

        const usageCarrier = [...objects].reverse().find((entry) => extractUsage(entry));
        expect(getTotalTokens(extractUsage(usageCarrier)), "/responses stream should include non-zero usage").toBeGreaterThan(0);
    }, 120_000);

    it("streams image output on /chat/completions with non-zero usage", async () => {
        const res = await postStreamWithModalitiesFallback("/chat/completions", selectedModel);
        const frames = await readSseFrames(res);
        const objects = parseSseJson(frames).filter((entry) => entry && typeof entry === "object") as any[];
        const hasImage = objects.some((entry) => {
            const fromMessage = extractChatImages(entry).length > 0;
            const fromDelta = Array.isArray(entry?.choices)
                ? entry.choices.some((choice: any) => Array.isArray(choice?.delta?.images) && choice.delta.images.length > 0)
                : false;
            return fromMessage || fromDelta;
        });
        expect(hasImage, "expected at least one image block in /chat/completions stream").toBe(true);

        const usageCarrier = [...objects].reverse().find((entry) => extractUsage(entry));
        expect(getTotalTokens(extractUsage(usageCarrier)), "/chat stream should include non-zero usage").toBeGreaterThan(0);
    }, 120_000);
});
