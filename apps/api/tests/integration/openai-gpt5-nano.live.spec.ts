import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readSseFrames, parseSseJson } from "../helpers/sse";
import { imageToBase64 } from "../helpers/image";

const MODEL = "openai/gpt-5-nano-2025-08-07";
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1";
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY ?? "";
const IMAGE_URL = "https://th.bing.com/th/id/R.b72dfea01bd45b862fa3c43228acc6ec?rik=KPkihyX9%2bIBwtA&riu=http%3a%2f%2ffoundtheworld.com%2fwp-content%2fuploads%2f2015%2f12%2fGolden-Gate-Bridge-4.jpg&ehk=mtwSRtfSVm9rpOZrEwBTNC%2fySKmIQekLMD2opw%2b71zs%3d&risl=&pid=ImgRaw&r=0";
const VALID_IMAGE_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const TOOL_DEF = {
    type: "function",
    function: {
        name: "get_weather",
        description: "Get weather",
        parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
        },
    },
};

const TOOL_DEF_ANTHROPIC = {
    name: "get_weather",
    description: "Get weather",
    input_schema: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
    },
};

// Track total tokens and cost across all tests
let totalTokensUsed = 0;
let totalCostCents = 0;

function resolveGatewayUrl(path: string) {
    const base = GATEWAY_URL.endsWith("/") ? GATEWAY_URL.slice(0, -1) : GATEWAY_URL;
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${base}${suffix}`;
}

async function runProtocol(
    path: string,
    body: any,
    opts?: { stream?: boolean }
) {
    const requestBody = (body && typeof body === "object")
        ? { ...body, stream: Boolean(opts?.stream), usage: true, meta: true }
        : body;
    const res = await fetch(resolveGatewayUrl(path), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GATEWAY_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Gateway ${res.status} ${res.statusText}: ${text}`);
    }

    if (opts?.stream) {
        const frames = parseSseJson(await readSseFrames(res));
        return { frames };
    }

    return await res.json();
}

function getTotalTokens(usage: any): number {
    if (!usage || typeof usage !== "object") return 0;
    const total = usage.total_tokens;
    if (typeof total === "number") return total;
    const input = usage.input_tokens ?? usage.prompt_tokens ?? usage.input_text_tokens ?? 0;
    const output = usage.output_tokens ?? usage.completion_tokens ?? usage.output_text_tokens ?? 0;
    return Number(input) + Number(output);
}

function getCostCents(response: any): number {
    if (!response || typeof response !== "object") return 0;

    // Check various possible locations for cost information
    // Most likely in usage object
    const usage = response.usage;
    if (usage && typeof usage === "object") {
        // Check for pricing object in usage (gateway format)
        if (usage.pricing && typeof usage.pricing === "object") {
            // Prefer total_nanos (most accurate, converts to cents)
            // 1 cent = 10,000,000 nanos
            if (typeof usage.pricing.total_nanos === "number") {
                return usage.pricing.total_nanos / 10_000_000;
            }

            // Fallback to total_cents if available
            if (typeof usage.pricing.total_cents === "number") {
                return usage.pricing.total_cents;
            }

            // Parse from total_usd_str as last resort
            if (typeof usage.pricing.total_usd_str === "string") {
                const dollars = parseFloat(usage.pricing.total_usd_str);
                if (!isNaN(dollars)) return dollars * 100;
            }
        }

        // Check for cost_cents directly in usage
        if (typeof usage.cost_cents === "number") return usage.cost_cents;

        // Check for nested cost object in usage
        if (usage.cost && typeof usage.cost === "object") {
            if (typeof usage.cost.cost_cents === "number") return usage.cost.cost_cents;
            if (typeof usage.cost.total_cents === "number") return usage.cost.total_cents;
        }
    }

    // Check root-level fields as fallback
    if (typeof response.cost_cents === "number") return response.cost_cents;
    if (response.cost?.cost_cents) return Number(response.cost.cost_cents);
    if (response.pricing?.cost_cents) return Number(response.pricing.cost_cents);

    return 0;
}

function expectUsageTokens(response: any) {
    const totalTokens = getTotalTokens(response?.usage ?? {});
    expect(totalTokens).toBeGreaterThan(0);
    // Accumulate total tokens and cost for final report
    totalTokensUsed += totalTokens;
    totalCostCents += getCostCents(response);
}

function expectStreamFrames(frames: any[]) {
    const objects = frames.filter((entry) => entry && typeof entry === "object");
    expect(objects.length).toBeGreaterThan(0);
    const hasChoices = objects.some((entry) => Array.isArray(entry?.choices));
    const hasResponse = objects.some((entry) => entry?.response || entry?.object === "response");
    expect(hasChoices || hasResponse).toBe(true);

    // Track tokens and cost from streaming responses (usage typically in final chunk)
    for (const frame of objects) {
        if (frame?.usage) {
            const tokens = getTotalTokens(frame.usage);
            if (tokens > 0) {
                totalTokensUsed += tokens;
                totalCostCents += getCostCents(frame);
                break; // Only count once per stream
            }
        }
    }
}

describe("Live OpenAI gpt-5-nano protocols", () => {
    beforeAll(() => {
        if (!GATEWAY_API_KEY) {
            throw new Error("GATEWAY_API_KEY is required for live tests");
        }
    });

    afterAll(() => {
        console.log("\n" + "=".repeat(60));
        console.log("📊 Test Suite Summary");
        console.log("=".repeat(60));
        console.log(`Total tokens used: ${totalTokensUsed.toLocaleString()}`);

        if (totalCostCents > 0) {
            const costDollars = totalCostCents / 100;
            console.log(`Total cost: $${costDollars.toFixed(4)} (${totalCostCents.toLocaleString()} cents)`);
        } else {
            console.log("Total cost: Not available (enable gateway meta response)");
        }

        console.log("=".repeat(60) + "\n");
    });

    describe("chat.completions", () => {
        it("regular request", async () => {
            const response: any = await runProtocol("/chat/completions", {
                model: MODEL,
                messages: [{ role: "user", content: "Return a short greeting." }],
            });

            expect(response.id).toBeDefined();
            expect(response.object).toBe("chat.completion");
            expectUsageTokens(response);
        });

        it("multimodal (url)", async () => {
            const response: any = await runProtocol("/chat/completions", {
                model: MODEL,
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: "Describe the image." },
                        { type: "image_url", image_url: { url: IMAGE_URL } },
                    ],
                }],
            });

            expect(response.choices?.length ?? 0).toBeGreaterThan(0);
            expectUsageTokens(response);
        });

        it("multimodal (base64)", async () => {
            const response: any = await runProtocol("/chat/completions", {
                model: MODEL,
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: "Describe the image." },
                        { type: "image_url", image_url: { url: VALID_IMAGE_B64 } },
                    ],
                }],
            });

            expect(response.choices?.length ?? 0).toBeGreaterThan(0);
            expectUsageTokens(response);
        });

        it("tool use", async () => {
            const response: any = await runProtocol("/chat/completions", {
                model: MODEL,
                messages: [{ role: "user", content: "Call get_weather for SF." }],
                tools: [TOOL_DEF],
                tool_choice: "required",
            });

            const toolCalls = response.choices?.[0]?.message?.tool_calls ?? [];
            expect(toolCalls.length).toBeGreaterThan(0);
            expect(toolCalls[0]?.function?.name).toBe("get_weather");
            expectUsageTokens(response);
        });

        it("structured output", async () => {
            const response: any = await runProtocol("/chat/completions", {
                model: MODEL,
                messages: [{ role: "user", content: "Return {answer: string} in JSON." }],
                response_format: {
                    type: "json_schema",
                    schema: {
                        type: "object",
                        properties: { answer: { type: "string" } },
                        required: ["answer"],
                    },
                },
            });

            const content = response.choices?.[0]?.message?.content ?? "";
            expect(typeof content).toBe("string");
            expectUsageTokens(response);
        });

        it("streaming", async () => {
            const streamResult: any = await runProtocol("/chat/completions", {
                model: MODEL,
                messages: [{ role: "user", content: "Stream a short greeting." }],
                stream: true,
            }, { stream: true });

            expectStreamFrames(streamResult.frames ?? []);
        });
    });

    describe("responses", () => {
        it("regular request", async () => {
            const response: any = await runProtocol("/responses", {
                model: MODEL,
                input: "Return a short greeting.",
            });

            expect(response.id).toBeDefined();
            expect(response.object).toBe("response");
            expectUsageTokens(response);
        });

        it("multimodal (url)", async () => {
            const response: any = await runProtocol("/responses", {
                model: MODEL,
                input: [{
                    type: "message",
                    role: "user",
                    content: [
                        { type: "input_text", text: "Describe the image." },
                        { type: "input_image", image_url: IMAGE_URL },
                    ],
                }],
            });

            expect(response.output?.length ?? 0).toBeGreaterThan(0);
            expectUsageTokens(response);
        });

        it("multimodal (base64)", async () => {
            const response: any = await runProtocol("/responses", {
                model: MODEL,
                input: [{
                    type: "message",
                    role: "user",
                    content: [
                        { type: "input_text", text: "Describe the image." },
                        { type: "input_image", image_url: VALID_IMAGE_B64 },
                    ],
                }],
            });

            expect(response.output?.length ?? 0).toBeGreaterThan(0);
            expectUsageTokens(response);
        });

        it("tool use", async () => {
            const response: any = await runProtocol("/responses", {
                model: MODEL,
                input: "Call get_weather for SF.",
                tools: [TOOL_DEF],
                tool_choice: "required",
            });

            expect(response.output?.length ?? 0).toBeGreaterThan(0);
            expectUsageTokens(response);
        });

        it("structured output", async () => {
            const response: any = await runProtocol("/responses", {
                model: MODEL,
                input: "Return {answer: string} in JSON.",
                text: {
                    format: {
                        type: "json_schema",
                        schema: {
                            type: "object",
                            properties: { answer: { type: "string" } },
                            required: ["answer"],
                        },
                    },
                },
            });

            expect(response.output?.length ?? 0).toBeGreaterThan(0);
            expectUsageTokens(response);
        });

        it("streaming", async () => {
            const streamResult: any = await runProtocol("/responses", {
                model: MODEL,
                input: "Stream a short greeting.",
                stream: true,
            }, { stream: true });

            expectStreamFrames(streamResult.frames ?? []);
        });
    });

    describe("messages (anthropic protocol)", () => {
        it("regular request", async () => {
            const response: any = await runProtocol("/messages", {
                model: MODEL,
                messages: [{ role: "user", content: "Return a short greeting." }],
                max_tokens: 10000,
            });

            expect(response.id).toBeDefined();
            expect(response.type).toBe("message");
            expectUsageTokens(response);
        });

        it("multimodal (url)", async () => {
            const response: any = await runProtocol("/messages", {
                model: MODEL,
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: "Describe the image." },
                        { type: "image", source: { type: "url", url: IMAGE_URL } },
                    ],
                }],
                max_tokens: 10000,
            });

            expect(response.content?.length ?? 0).toBeGreaterThan(0);
            expectUsageTokens(response);
        });

        it("multimodal (base64)", async () => {
            const response: any = await runProtocol("/messages", {
                model: MODEL,
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: "Describe the image." },
                        { type: "image", source: { type: "base64", media_type: "image/png", data: VALID_IMAGE_B64.split(",")[1] } },
                    ],
                }],
                max_tokens: 10000,
            });

            expect(response.content?.length ?? 0).toBeGreaterThan(0);
            expectUsageTokens(response);
        });

        it("tool use", async () => {
            const response: any = await runProtocol("/messages", {
                model: MODEL,
                messages: [{ role: "user", content: "Call get_weather for SF." }],
                tools: [TOOL_DEF_ANTHROPIC],
                tool_choice: { type: "tool", name: "get_weather" },
                max_tokens: 10000,
            });

            const toolUse = (response.content ?? []).find((item: any) => item.type === "tool_use");
            expect(toolUse?.name).toBe("get_weather");
            expectUsageTokens(response);
        });

        it("structured output", async () => {
            const response: any = await runProtocol("/messages", {
                model: MODEL,
                messages: [{ role: "user", content: "Return only JSON: {answer: string}." }],
                max_tokens: 10000,
            });

            const content = Array.isArray(response.content)
                ? response.content.map((c: any) => c.text ?? "").join("")
                : response.content;
            expect(typeof content).toBe("string");
            expectUsageTokens(response);
        });

        it("streaming", async () => {
            const streamResult: any = await runProtocol("/messages", {
                model: MODEL,
                messages: [{ role: "user", content: "Stream a short greeting." }],
                max_tokens: 10000,
                stream: true,
            }, { stream: true });

            expectStreamFrames(streamResult.frames ?? []);
        });
    });
});
