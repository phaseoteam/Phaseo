import type { CoreContentPart, CoreRequest, CoreResponse, CoreTurn } from "@/core/types";
import type { AnthropicMessagesRequest } from "./anthropic_messages_schema";

function contentParts(content: any): CoreContentPart[] {
    if (typeof content === "string") return [{ type: "text", text: content }];
    if (!Array.isArray(content)) return [];
    return content
        .map((part) => {
            if (part?.type === "text" && typeof part.text === "string") {
                return { type: "text", text: part.text };
            }
            if (part?.type === "image" && part.source?.url) {
                return { type: "image", url: part.source.url };
            }
            if (part?.type === "tool_use" && part.id && part.name) {
                return {
                    type: "tool_call",
                    id: part.id,
                    name: part.name,
                    arguments: JSON.stringify(part.input ?? {}),
                };
            }
            if (part?.type === "tool_result" && part.tool_use_id) {
                return { type: "tool_result", id: part.tool_use_id, content: part.content ?? "" };
            }
            return null;
        })
        .filter(Boolean) as CoreContentPart[];
}

export function anthropicMessagesToCore(
    body: AnthropicMessagesRequest,
    opts: { strictness?: CoreRequest["strictness"] } = {}
): CoreRequest {
    const turns: CoreTurn[] = body.messages.map((message) => ({
        role: message.role,
        content: contentParts(message.content),
    }));

    return {
        model: body.model,
        input: turns,
        system: typeof body.system === "string" ? body.system : undefined,
        tools: body.tools?.map((tool) => ({
            name: tool.name,
            description: tool.description,
            schema: tool.input_schema,
        })),
        tool_choice: body.tool_choice as CoreRequest["tool_choice"],
        sampling: {
            temperature: body.temperature,
            top_p: body.top_p,
            top_k: body.top_k,
        },
        limits: {
            max_output_tokens: body.max_tokens,
        },
        stream: body.stream,
        strictness: opts.strictness,
        metadata: {
            user_id: body.metadata?.user_id,
        },
    };
}

function renderContent(turns: CoreTurn[]): any[] {
    const content: any[] = [];
    for (const turn of turns) {
        if (turn.role !== "assistant") continue;
        for (const part of turn.content) {
            if (part.type === "text") {
                content.push({ type: "text", text: part.text });
            } else if (part.type === "tool_call") {
                content.push({
                    type: "tool_use",
                    id: part.id,
                    name: part.name,
                    input: safeJson(part.arguments),
                });
            }
        }
    }
    return content;
}

function safeJson(value: string) {
    try {
        return JSON.parse(value);
    } catch {
        return { raw: value };
    }
}

export function coreToAnthropicMessageResponse(
    core: CoreResponse,
    opts: { requestId: string; model?: string }
) {
    const content = renderContent(core.output ?? []);
    return {
        id: opts.requestId,
        type: "message",
        role: "assistant",
        model: opts.model,
        content,
        stop_reason: null,
        stop_sequence: null,
        usage: core.usage
            ? {
                input_tokens: core.usage.input_tokens ?? 0,
                output_tokens: core.usage.output_tokens ?? 0,
            }
            : undefined,
    };
}

type OpenAiStreamOpts = {
    upstream: Response;
    requestId: string;
    model?: string;
};

type ToolState = {
    id: string;
    name: string;
    index: number;
};

function mapFinishReason(reason: string | null | undefined) {
    switch (reason) {
        case "tool_calls":
            return "tool_use";
        case "length":
            return "max_tokens";
        case "stop":
        default:
            return "end_turn";
    }
}

export function openAiStreamToAnthropic(opts: OpenAiStreamOpts): Response {
    const reader = opts.upstream.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    let buf = "";
    let messageStarted = false;
    let nextIndex = 0;
    let textIndex: number | null = null;
    const toolBlocks = new Map<string, ToolState>();
    let finishReason: string | null = null;
    let usageIn: number | null = null;
    let usageOut: number | null = null;
    let resolvedModel = opts.model ?? null;

    const writeEvent = async (eventType: string, data: any) => {
        const chunk = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
        await writer.write(encoder.encode(chunk));
    };

    const ensureMessageStart = async () => {
        if (messageStarted) return;
        messageStarted = true;
        await writeEvent("message_start", {
            type: "message_start",
            message: {
                id: opts.requestId,
                type: "message",
                role: "assistant",
                model: resolvedModel,
                content: [],
                stop_reason: null,
                stop_sequence: null,
                usage: {
                    input_tokens: usageIn ?? 0,
                    output_tokens: 0,
                },
            },
        });
    };

    const ensureTextBlock = async () => {
        if (textIndex !== null) return textIndex;
        textIndex = nextIndex++;
        await writeEvent("content_block_start", {
            type: "content_block_start",
            index: textIndex,
            content_block: {
                type: "text",
                text: "",
            },
        });
        return textIndex;
    };

    const ensureToolBlock = async (id: string, name: string) => {
        let tool = toolBlocks.get(id);
        if (!tool) {
            tool = { id, name, index: nextIndex++ };
            toolBlocks.set(id, tool);
            await writeEvent("content_block_start", {
                type: "content_block_start",
                index: tool.index,
                content_block: {
                    type: "tool_use",
                    id,
                    name,
                    input: {},
                },
            });
        } else if (!tool.name && name) {
            tool.name = name;
        }
        return tool;
    };

    const handleUsage = (usage: any) => {
        if (!usage || typeof usage !== "object") return;
        usageIn = typeof usage.input_tokens === "number"
            ? usage.input_tokens
            : (typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : usageIn);
        usageOut = typeof usage.output_tokens === "number"
            ? usage.output_tokens
            : (typeof usage.completion_tokens === "number" ? usage.completion_tokens : usageOut);
    };

    const handleChatChunk = async (payload: any) => {
        if (payload?.model) resolvedModel = payload.model;
        const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
        if (!choice) return;
        if (choice.finish_reason) finishReason = mapFinishReason(choice.finish_reason);
        const delta = choice.delta ?? {};
        if (delta?.content) {
            await ensureMessageStart();
            const idx = await ensureTextBlock();
            await writeEvent("content_block_delta", {
                type: "content_block_delta",
                index: idx,
                delta: {
                    type: "text_delta",
                    text: delta.content,
                },
            });
        }
        if (Array.isArray(delta?.tool_calls)) {
            for (const toolCall of delta.tool_calls) {
                const tool = await ensureToolBlock(toolCall?.id ?? "tool", toolCall?.function?.name ?? "");
                if (toolCall?.function?.name && !tool.name) {
                    tool.name = toolCall.function.name;
                }
                if (toolCall?.function?.arguments) {
                    await writeEvent("content_block_delta", {
                        type: "content_block_delta",
                        index: tool.index,
                        delta: {
                            type: "input_json_delta",
                            partial_json: toolCall.function.arguments,
                        },
                    });
                }
            }
        }
        if (payload?.usage) handleUsage(payload.usage);
    };

    const handleResponsesStream = async (payload: any) => {
        if (payload?.response?.model) resolvedModel = payload.response.model;
        if (payload?.model) resolvedModel = payload.model;
        if (typeof payload?.delta === "string" && payload?.type?.includes("output_text.delta")) {
            await ensureMessageStart();
            const idx = await ensureTextBlock();
            await writeEvent("content_block_delta", {
                type: "content_block_delta",
                index: idx,
                delta: {
                    type: "text_delta",
                    text: payload.delta,
                },
            });
        }
        if (payload?.response?.usage) handleUsage(payload.response.usage);
        if (payload?.usage) handleUsage(payload.usage);
    };

    const finalize = async () => {
        await ensureMessageStart();
        if (textIndex !== null) {
            await writeEvent("content_block_stop", { type: "content_block_stop", index: textIndex });
        }
        for (const tool of toolBlocks.values()) {
            await writeEvent("content_block_stop", { type: "content_block_stop", index: tool.index });
        }
        await writeEvent("message_delta", {
            type: "message_delta",
            delta: {
                stop_reason: finishReason ?? "end_turn",
                stop_sequence: null,
            },
            usage: usageOut != null ? { output_tokens: usageOut } : undefined,
        });
        await writeEvent("message_stop", { type: "message_stop" });
    };

    (async () => {
        if (!reader) {
            await finalize();
            try { await writer.close(); } catch { }
            return;
        }

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const frames = buf.split(/\n\n/);
                buf = frames.pop() ?? "";
                for (const raw of frames) {
                    let dataStr = "";
                    for (const line of raw.split(/\n/)) {
                        const l = line.replace(/\r$/, "");
                        if (l.startsWith("data:")) dataStr += l.slice(5).trimStart();
                    }
                    if (!dataStr || dataStr === "[DONE]") continue;
                    let payload: any;
                    try {
                        payload = JSON.parse(dataStr);
                    } catch {
                        continue;
                    }
                    if (payload?.object === "chat.completion.chunk") {
                        await handleChatChunk(payload);
                        continue;
                    }
                    if (payload?.type) {
                        await handleResponsesStream(payload);
                        continue;
                    }
                    if (payload?.object === "response" || payload?.object === "chat.completion") {
                        if (payload?.usage) handleUsage(payload.usage);
                        if (payload?.model) resolvedModel = payload.model;
                    }
                }
            }
        } finally {
            await finalize();
            try { await writer.close(); } catch { }
        }
    })().catch(async (err) => {
        console.error("[gateway] anthropic stream transform error", err);
        try {
            await finalize();
        } finally {
            try { await writer.close(); } catch { }
        }
    });

    const headers = new Headers(opts.upstream.headers);
    headers.set("Content-Type", "text/event-stream");
    headers.set("Cache-Control", "no-store");
    return new Response(stream.readable, { status: opts.upstream.status, headers });
}
