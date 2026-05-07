import { beforeAll, describe, expect, it } from "vitest";
import {
    GATEWAY_API_KEY,
    LIVE_RUN,
    assertDoneFrame,
    extractChatText,
    extractMessagesText,
    extractResponseText,
    extractStreamText,
    hasStreamToolSignal,
    parseJsonLoose,
    postJson,
    postStream,
    requireGatewayApiKey,
    streamUsagePayload,
    usageFromPayload,
    usageTotal,
} from "./live-gateway.helpers";

type Endpoint = "/responses" | "/chat/completions" | "/messages";

type Scenario = {
    id: string;
    endpoint: Endpoint;
    stream: boolean;
    buildBody: () => Record<string, unknown>;
    validateJson?: (json: any) => void;
    validateStream?: (frames: Awaited<ReturnType<typeof postStream>>) => void;
};

const MODEL = (process.env.LIVE_GPT54_NANO_TEXT_MODEL ?? "openai/gpt-5.4-nano").trim();
const LIVE_GPT54_NANO_TEXT_RUN = (process.env.LIVE_GPT54_NANO_TEXT_RUN ?? "0").trim() === "1";
const MAX_OUTPUT_TOKENS = Number(process.env.LIVE_GPT54_NANO_TEXT_MAX_OUTPUT_TOKENS ?? "128");
const MESSAGES_MAX_TOKENS = Number(process.env.LIVE_GPT54_NANO_MESSAGES_MAX_TOKENS ?? "256");
const describeLive = LIVE_RUN && LIVE_GPT54_NANO_TEXT_RUN ? describe : describe.skip;

const FUNCTION_TOOL = {
    type: "function",
    function: {
        name: "get_weather",
        description: "Get weather for a city",
        parameters: {
            type: "object",
            properties: {
                city: { type: "string" },
            },
            required: ["city"],
        },
    },
} as const;

const ANTHROPIC_TOOL = {
    name: "get_weather",
    description: "Get weather for a city",
    input_schema: {
        type: "object",
        properties: {
            city: { type: "string" },
        },
        required: ["city"],
    },
} as const;

function assertUsage(payload: any, label: string) {
    const usage = usageFromPayload(payload);
    expect(usage, `${label} missing usage`).toBeTruthy();
    expect(usageTotal(usage), `${label} usage should be non-zero`).toBeGreaterThan(0);
}

function assertStreamUsage(frames: Awaited<ReturnType<typeof postStream>>, label: string) {
    const usage = usageFromPayload(streamUsagePayload(frames));
    expect(usage, `${label} missing stream usage`).toBeTruthy();
    expect(usageTotal(usage), `${label} stream usage should be non-zero`).toBeGreaterThan(0);
}

const SCENARIOS: Scenario[] = [
    {
        id: "responses_nonstream_text",
        endpoint: "/responses",
        stream: false,
        buildBody: () => ({
            model: MODEL,
            input: "Reply with exactly: hello",
            max_output_tokens: MAX_OUTPUT_TOKENS,
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateJson: (json) => {
            expect(extractResponseText(json).trim().length).toBeGreaterThan(0);
            assertUsage(json, "responses_nonstream_text");
        },
    },
    {
        id: "responses_stream_text",
        endpoint: "/responses",
        stream: true,
        buildBody: () => ({
            model: MODEL,
            stream: true,
            input: "Reply with exactly: hello",
            max_output_tokens: MAX_OUTPUT_TOKENS,
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateStream: (frames) => {
            assertDoneFrame(frames);
            expect(extractStreamText(frames).trim().length).toBeGreaterThan(0);
            assertStreamUsage(frames, "responses_stream_text");
        },
    },
    {
        id: "responses_nonstream_tool",
        endpoint: "/responses",
        stream: false,
        buildBody: () => ({
            model: MODEL,
            input: "Call get_weather for London and return a tool call.",
            tools: [FUNCTION_TOOL],
            tool_choice: { type: "function", function: { name: "get_weather" } },
            max_output_tokens: MAX_OUTPUT_TOKENS,
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateJson: (json) => {
            const output = Array.isArray(json?.output) ? json.output : [];
            const hasCall = output.some((item: any) => {
                const type = String(item?.type ?? "").toLowerCase();
                return type === "function_call" || type === "tool_call";
            });
            expect(hasCall || extractResponseText(json).toLowerCase().includes("get_weather")).toBe(true);
            assertUsage(json, "responses_nonstream_tool");
        },
    },
    {
        id: "responses_stream_tool",
        endpoint: "/responses",
        stream: true,
        buildBody: () => ({
            model: MODEL,
            stream: true,
            input: "Call get_weather for London and return a tool call.",
            tools: [FUNCTION_TOOL],
            tool_choice: { type: "function", function: { name: "get_weather" } },
            max_output_tokens: MAX_OUTPUT_TOKENS,
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateStream: (frames) => {
            assertDoneFrame(frames);
            const text = extractStreamText(frames).toLowerCase();
            expect(hasStreamToolSignal(frames) || text.includes("get_weather") || text.includes("<invoke")).toBe(true);
            assertStreamUsage(frames, "responses_stream_tool");
        },
    },
    {
        id: "responses_nonstream_structured",
        endpoint: "/responses",
        stream: false,
        buildBody: () => ({
            model: MODEL,
            input: "Return JSON with exactly keys city and weather. Set city to London.",
            text: {
                format: {
                    type: "json_schema",
                    name: "weather_schema",
                    strict: true,
                    schema: {
                        type: "object",
                        properties: {
                            city: { type: "string" },
                            weather: { type: "string" },
                        },
                        required: ["city", "weather"],
                    },
                },
            },
            max_output_tokens: MAX_OUTPUT_TOKENS,
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateJson: (json) => {
            const parsed = parseJsonLoose(extractResponseText(json));
            expect(parsed?.city).toBe("London");
            expect(typeof parsed?.weather).toBe("string");
            assertUsage(json, "responses_nonstream_structured");
        },
    },
    {
        id: "responses_stream_structured",
        endpoint: "/responses",
        stream: true,
        buildBody: () => ({
            model: MODEL,
            stream: true,
            input: "Return JSON with exactly keys city and weather. Set city to London.",
            text: {
                format: {
                    type: "json_schema",
                    name: "weather_schema",
                    strict: true,
                    schema: {
                        type: "object",
                        properties: {
                            city: { type: "string" },
                            weather: { type: "string" },
                        },
                        required: ["city", "weather"],
                    },
                },
            },
            max_output_tokens: MAX_OUTPUT_TOKENS,
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateStream: (frames) => {
            assertDoneFrame(frames);
            const parsed = parseJsonLoose(extractStreamText(frames));
            expect(parsed?.city).toBe("London");
            expect(typeof parsed?.weather).toBe("string");
            assertStreamUsage(frames, "responses_stream_structured");
        },
    },
    {
        id: "chat_nonstream_text",
        endpoint: "/chat/completions",
        stream: false,
        buildBody: () => ({
            model: MODEL,
            messages: [{ role: "user", content: "Reply with exactly: hello" }],
            max_output_tokens: MAX_OUTPUT_TOKENS,
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateJson: (json) => {
            expect(extractChatText(json).trim().length).toBeGreaterThan(0);
            assertUsage(json, "chat_nonstream_text");
        },
    },
    {
        id: "chat_stream_text",
        endpoint: "/chat/completions",
        stream: true,
        buildBody: () => ({
            model: MODEL,
            stream: true,
            messages: [{ role: "user", content: "Reply with exactly: hello" }],
            max_output_tokens: MAX_OUTPUT_TOKENS,
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateStream: (frames) => {
            assertDoneFrame(frames);
            expect(extractStreamText(frames).trim().length).toBeGreaterThan(0);
            assertStreamUsage(frames, "chat_stream_text");
        },
    },
    {
        id: "chat_nonstream_tool",
        endpoint: "/chat/completions",
        stream: false,
        buildBody: () => ({
            model: MODEL,
            messages: [{ role: "user", content: "Call get_weather for London and return a tool call." }],
            tools: [FUNCTION_TOOL],
            tool_choice: { type: "function", function: { name: "get_weather" } },
            max_output_tokens: MAX_OUTPUT_TOKENS,
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateJson: (json) => {
            const toolCalls = json?.choices?.[0]?.message?.tool_calls;
            expect(Array.isArray(toolCalls) && toolCalls.length > 0).toBe(true);
            assertUsage(json, "chat_nonstream_tool");
        },
    },
    {
        id: "chat_stream_tool",
        endpoint: "/chat/completions",
        stream: true,
        buildBody: () => ({
            model: MODEL,
            stream: true,
            messages: [{ role: "user", content: "Call get_weather for London and return a tool call." }],
            tools: [FUNCTION_TOOL],
            tool_choice: { type: "function", function: { name: "get_weather" } },
            max_output_tokens: MAX_OUTPUT_TOKENS,
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateStream: (frames) => {
            assertDoneFrame(frames);
            const text = extractStreamText(frames).toLowerCase();
            expect(hasStreamToolSignal(frames) || text.includes("get_weather") || text.includes("<invoke")).toBe(true);
            assertStreamUsage(frames, "chat_stream_tool");
        },
    },
    {
        id: "chat_nonstream_structured",
        endpoint: "/chat/completions",
        stream: false,
        buildBody: () => ({
            model: MODEL,
            messages: [{ role: "user", content: "Return JSON with exactly keys city and weather. Set city to London." }],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "weather_schema",
                    strict: true,
                    schema: {
                        type: "object",
                        properties: {
                            city: { type: "string" },
                            weather: { type: "string" },
                        },
                        required: ["city", "weather"],
                    },
                },
            },
            max_output_tokens: MAX_OUTPUT_TOKENS,
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateJson: (json) => {
            const parsed = parseJsonLoose(extractChatText(json));
            expect(parsed?.city).toBe("London");
            expect(typeof parsed?.weather).toBe("string");
            assertUsage(json, "chat_nonstream_structured");
        },
    },
    {
        id: "chat_stream_structured",
        endpoint: "/chat/completions",
        stream: true,
        buildBody: () => ({
            model: MODEL,
            stream: true,
            messages: [{ role: "user", content: "Return JSON with exactly keys city and weather. Set city to London." }],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "weather_schema",
                    strict: true,
                    schema: {
                        type: "object",
                        properties: {
                            city: { type: "string" },
                            weather: { type: "string" },
                        },
                        required: ["city", "weather"],
                    },
                },
            },
            max_output_tokens: MAX_OUTPUT_TOKENS,
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateStream: (frames) => {
            assertDoneFrame(frames);
            const parsed = parseJsonLoose(extractStreamText(frames));
            expect(parsed?.city).toBe("London");
            expect(typeof parsed?.weather).toBe("string");
            assertStreamUsage(frames, "chat_stream_structured");
        },
    },
    {
        id: "messages_nonstream_text",
        endpoint: "/messages",
        stream: false,
        buildBody: () => ({
            model: MODEL,
            max_tokens: MESSAGES_MAX_TOKENS,
            messages: [{ role: "user", content: "Reply with exactly: hello" }],
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateJson: (json) => {
            expect(extractMessagesText(json).trim().length).toBeGreaterThan(0);
            assertUsage(json, "messages_nonstream_text");
        },
    },
    {
        id: "messages_stream_text",
        endpoint: "/messages",
        stream: true,
        buildBody: () => ({
            model: MODEL,
            stream: true,
            max_tokens: MESSAGES_MAX_TOKENS,
            messages: [{ role: "user", content: "Reply with exactly: hello" }],
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateStream: (frames) => {
            assertDoneFrame(frames);
            expect(extractStreamText(frames).trim().length).toBeGreaterThan(0);
            assertStreamUsage(frames, "messages_stream_text");
        },
    },
    {
        id: "messages_nonstream_tool",
        endpoint: "/messages",
        stream: false,
        buildBody: () => ({
            model: MODEL,
            max_tokens: MESSAGES_MAX_TOKENS,
            messages: [{ role: "user", content: "Call get_weather for London and return a tool call." }],
            tools: [ANTHROPIC_TOOL],
            tool_choice: { type: "tool", name: "get_weather" },
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateJson: (json) => {
            const blocks = Array.isArray(json?.content) ? json.content : [];
            const hasToolUse = blocks.some((block: any) => block?.type === "tool_use");
            expect(hasToolUse || extractMessagesText(json).toLowerCase().includes("get_weather")).toBe(true);
            assertUsage(json, "messages_nonstream_tool");
        },
    },
    {
        id: "messages_stream_tool",
        endpoint: "/messages",
        stream: true,
        buildBody: () => ({
            model: MODEL,
            stream: true,
            max_tokens: MESSAGES_MAX_TOKENS,
            messages: [{ role: "user", content: "Call get_weather for London and return a tool call." }],
            tools: [ANTHROPIC_TOOL],
            tool_choice: { type: "tool", name: "get_weather" },
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateStream: (frames) => {
            assertDoneFrame(frames);
            const text = extractStreamText(frames).toLowerCase();
            expect(hasStreamToolSignal(frames) || text.includes("get_weather") || text.includes("tool_use")).toBe(true);
            assertStreamUsage(frames, "messages_stream_tool");
        },
    },
    {
        id: "messages_nonstream_structured",
        endpoint: "/messages",
        stream: false,
        buildBody: () => ({
            model: MODEL,
            max_tokens: MESSAGES_MAX_TOKENS,
            system: "Output only a JSON object. No markdown. No prose.",
            messages: [{ role: "user", content: "Return a JSON object with exactly keys city and weather. Set city to London." }],
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateJson: (json) => {
            const parsed = parseJsonLoose(extractMessagesText(json));
            expect(parsed?.city).toBe("London");
            expect(typeof parsed?.weather).toBe("string");
            assertUsage(json, "messages_nonstream_structured");
        },
    },
    {
        id: "messages_stream_structured",
        endpoint: "/messages",
        stream: true,
        buildBody: () => ({
            model: MODEL,
            stream: true,
            max_tokens: MESSAGES_MAX_TOKENS,
            system: "Output only a JSON object. No markdown. No prose.",
            messages: [{ role: "user", content: "Return a JSON object with exactly keys city and weather. Set city to London." }],
            usage: true,
            meta: true,
            provider: { only: ["openai"] },
        }),
        validateStream: (frames) => {
            assertDoneFrame(frames);
            const parsed = parseJsonLoose(extractStreamText(frames));
            expect(parsed?.city).toBe("London");
            expect(typeof parsed?.weather).toBe("string");
            assertStreamUsage(frames, "messages_stream_structured");
        },
    },
];

describeLive("GPT-5.4 nano text surface compatibility", () => {
    beforeAll(() => {
        requireGatewayApiKey();
        if (!GATEWAY_API_KEY) {
            throw new Error("GATEWAY_API_KEY is required");
        }
    });

    for (const scenario of SCENARIOS) {
        it(scenario.id, async () => {
            if (scenario.stream) {
                const frames = await postStream(scenario.endpoint, scenario.buildBody());
                scenario.validateStream?.(frames);
                return;
            }
            const result = await postJson(scenario.endpoint, scenario.buildBody());
            if (!("json" in result)) {
                throw new Error(`${scenario.id} expected JSON response`);
            }
            scenario.validateJson?.(result.json);
        }, 120_000);
    }
});
