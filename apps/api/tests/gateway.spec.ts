import { describe, it, expect } from "vitest";

const BASE_URL = process.env.AI_STATS_BASE_URL
    || process.env.GATEWAY_TEST_BASE_URL
    || "http://localhost:8787";

const API_KEY = process.env.AI_STATS_API_KEY
    || process.env.GATEWAY_TEST_API_KEY
    || "";

const DEFAULT_MODELS = [
    "openai/gpt-5-nano-2025-08-07",
    "xiaomi/mimo-v2-flash",
];
const MODELS = (process.env.GATEWAY_TEST_MODELS || DEFAULT_MODELS.join(","))
    .split(",").map(s => s.trim()).filter(Boolean);
const CASES = (process.env.GATEWAY_TEST_CASES || "text,reasoning,image,tool,stream,structured")
    .split(",").map(s => s.trim()).filter(Boolean);
const PROTOCOLS = (process.env.GATEWAY_TEST_PROTOCOLS || "responses,chat,messages")
    .split(",").map(s => s.trim()).filter(Boolean);
const TRACE = process.env.GATEWAY_TEST_TRACE === "true";

const IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg";

function endpointForProtocol(protocol: string) {
    if (protocol === "responses") return "/v1/responses";
    if (protocol === "chat") return "/v1/chat/completions";
    if (protocol === "messages") return "/v1/messages";
    throw new Error(`Unknown protocol: ${protocol}`);
}

function buildCase(protocol: string, name: string, model: string) {
    if (protocol === "responses") {
        if (name === "text") {
            return {
                model,
                input: [
                    { role: "user", content: [{ type: "input_text", text: "Say hello in one short sentence." }] },
                ],
                stream: false,
                usage: true,
                meta: true,
            };
        }
        if (name === "reasoning") {
            return {
                model,
                input: [
                    { role: "user", content: [{ type: "input_text", text: "Solve 12*13 and explain your reasoning briefly." }] },
                ],
                reasoning: { effort: "medium", summary: "auto" },
                stream: false,
                usage: true,
                meta: true,
            };
        }
        if (name === "image") {
            return {
                model,
                input: [
                    {
                        role: "user",
                        content: [
                            { type: "input_text", text: "What is in this image?" },
                            { type: "input_image", image_url: IMAGE_URL },
                        ],
                    },
                ],
                stream: false,
                usage: true,
                meta: true,
            };
        }
        if (name === "tool") {
            return {
                model,
                input: [
                    { role: "user", content: [{ type: "input_text", text: "Call the weather tool for London." }] },
                ],
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "get_weather",
                            description: "Get weather by city",
                            parameters: {
                                type: "object",
                                properties: {
                                    city: { type: "string" },
                                },
                                required: ["city"],
                            },
                        },
                    },
                ],
                tool_choice: "required",
                stream: false,
                usage: true,
                meta: true,
            };
        }
        if (name === "stream") {
            return {
                model,
                input: [
                    { role: "user", content: [{ type: "input_text", text: "Stream back a short sentence." }] },
                ],
                stream: true,
                usage: true,
                meta: true,
            };
        }
        if (name === "structured") {
            return {
                model,
                input: [
                    { role: "user", content: [{ type: "input_text", text: "Return JSON with fields name and city." }] },
                ],
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "person",
                        schema: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                city: { type: "string" },
                            },
                            required: ["name", "city"],
                        },
                        strict: true,
                    },
                },
                stream: false,
                usage: true,
                meta: true,
            };
        }
    }

    if (protocol === "chat") {
        if (name === "text") {
            return {
                model,
                messages: [
                    { role: "user", content: "Say hello in one short sentence." },
                ],
                stream: false,
                usage: true,
                meta: true,
            };
        }
        if (name === "reasoning") {
            return {
                model,
                messages: [
                    { role: "user", content: "Solve 12*13 and explain your reasoning briefly." },
                ],
                reasoning: { effort: "medium", summary: "auto" },
                stream: false,
                usage: true,
                meta: true,
            };
        }
        if (name === "image") {
            return {
                model,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "What is in this image?" },
                            { type: "image_url", image_url: { url: IMAGE_URL } },
                        ],
                    },
                ],
                stream: false,
                usage: true,
                meta: true,
            };
        }
        if (name === "tool") {
            return {
                model,
                messages: [
                    { role: "user", content: "Call the weather tool for London." },
                ],
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "get_weather",
                            description: "Get weather by city",
                            parameters: {
                                type: "object",
                                properties: {
                                    city: { type: "string" },
                                },
                                required: ["city"],
                            },
                        },
                    },
                ],
                tool_choice: "required",
                stream: false,
                usage: true,
                meta: true,
            };
        }
        if (name === "stream") {
            return {
                model,
                messages: [
                    { role: "user", content: "Stream back a short sentence." },
                ],
                stream: true,
                usage: true,
                meta: true,
            };
        }
        if (name === "structured") {
            return {
                model,
                messages: [
                    { role: "user", content: "Return JSON with fields name and city." },
                ],
                response_format: {
                    type: "json_schema",
                    schema: {
                        name: "person",
                        schema: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                city: { type: "string" },
                            },
                            required: ["name", "city"],
                        },
                        strict: true,
                    },
                },
                stream: false,
                usage: true,
                meta: true,
            };
        }
    }

    if (protocol === "messages") {
        if (name === "text") {
            return {
                model,
                system: "You are a helpful assistant.",
                messages: [
                    { role: "user", content: [{ type: "text", text: "Say hello in one short sentence." }] },
                ],
                stream: false,
                usage: true,
                meta: true,
                max_tokens: 256,
            };
        }
        if (name === "reasoning") {
            return {
                model,
                system: "You are a helpful assistant.",
                messages: [
                    { role: "user", content: [{ type: "text", text: "Solve 12*13 and explain your reasoning briefly." }] },
                ],
                stream: false,
                usage: true,
                meta: true,
                max_tokens: 256,
            };
        }
        if (name === "image") {
            return {
                model,
                system: "You are a helpful assistant.",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "What is in this image?" },
                            { type: "image", source: { type: "url", url: IMAGE_URL } },
                        ],
                    },
                ],
                stream: false,
                usage: true,
                meta: true,
                max_tokens: 256,
            };
        }
        if (name === "tool") {
            return {
                model,
                system: "You are a helpful assistant.",
                messages: [
                    { role: "user", content: [{ type: "text", text: "Call the weather tool for London." }] },
                ],
                tools: [
                    {
                        name: "get_weather",
                        description: "Get weather by city",
                        input_schema: {
                            type: "object",
                            properties: {
                                city: { type: "string" },
                            },
                            required: ["city"],
                        },
                    },
                ],
                tool_choice: { type: "tool", name: "get_weather" },
                stream: false,
                usage: true,
                meta: true,
                max_tokens: 256,
            };
        }
        if (name === "stream") {
            return {
                model,
                system: "You are a helpful assistant.",
                messages: [
                    { role: "user", content: [{ type: "text", text: "Stream back a short sentence." }] },
                ],
                stream: true,
                usage: true,
                meta: true,
                max_tokens: 256,
            };
        }
    }

    throw new Error(`Unknown case: ${name} for protocol: ${protocol}`);
}

function assertResponse(protocol: string, json: any) {
    expect(json).toBeTypeOf("object");
    if (protocol === "responses") {
        expect(json.object).toBe("response");
        expect(Array.isArray(json.output)).toBe(true);
    } else if (protocol === "chat") {
        expect(json.object).toBe("chat.completion");
        expect(Array.isArray(json.choices)).toBe(true);
    } else if (protocol === "messages") {
        expect(json.type).toBe("message");
        expect(Array.isArray(json.content)).toBe(true);
    }
}

async function readStreamAsJsonFrames(res: Response) {
    const reader = res.body?.getReader();
    if (!reader) return [];
    const decoder = new TextDecoder();
    let buf = "";
    const frames: any[] = [];
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split(/\n\n/);
        buf = chunks.pop() ?? "";
        for (const raw of chunks) {
            const lines = raw.split(/\n/);
            let data = "";
            for (const line of lines) {
                const l = line.replace(/\r$/, "");
                if (l.startsWith("data:")) data += l.slice(5).trimStart();
            }
            if (!data || data === "[DONE]") continue;
            try {
                frames.push(JSON.parse(data));
            } catch {
                // ignore invalid frame
            }
        }
    }
    return frames;
}

function isCaseSupported(protocol: string, testCase: string) {
    if (protocol === "messages" && testCase === "structured") return false;
    if (protocol === "messages" && testCase === "stream") return true;
    return true;
}

describe("gateway-api integration", () => {
    const hasConfig = API_KEY.length > 0 && MODELS.length > 0;
    if (!hasConfig) {
        it.skip("missing API key or models; set GATEWAY_TEST_API_KEY and GATEWAY_TEST_MODELS", () => {});
        return;
    }

    for (const protocol of PROTOCOLS) {
        for (const model of MODELS) {
            for (const testCase of CASES) {
                const supported = isCaseSupported(protocol, testCase);
                const testFn = supported ? it : it.skip;
                testFn(`${protocol} ${model} ${testCase}`, async () => {
                    const endpoint = endpointForProtocol(protocol);
                    const url = `${BASE_URL.replace(/\/+$/, "")}${endpoint}`;
                    const body = buildCase(protocol, testCase, model);
                    const headers: Record<string, string> = {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${API_KEY}`,
                    };
                    if (TRACE) headers["x-gateway-trace"] = "true";

                    const res = await fetch(url, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(body),
                    });
                    if (testCase === "stream") {
                        expect(res.ok).toBe(true);
                        const frames = await readStreamAsJsonFrames(res);
                        expect(frames.length).toBeGreaterThan(0);
                    } else {
                        const json = await res.json().catch(() => ({ error: "invalid_json_response" }));
                        expect(res.ok).toBe(true);
                        assertResponse(protocol, json);
                    }
                });
            }
        }
    }
});
