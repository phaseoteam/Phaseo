import type { ChatCompletionsRequest } from "@/lib/schemas";
import type { CoreContentPart, CoreRequest, CoreResponse, CoreTurn } from "@/core/types";

function partFromOpenAI(part: any): CoreContentPart | null {
    if (!part || typeof part !== "object") return null;
    if (part.type === "text" && typeof part.text === "string") {
        return { type: "text", text: part.text };
    }
    if (part.type === "image_url" && part.image_url?.url) {
        return { type: "image", url: part.image_url.url, detail: part.image_url.detail };
    }
    if (part.type === "input_audio" && part.input_audio?.data) {
        return { type: "input_audio", data: part.input_audio.data, format: part.input_audio.format ?? "wav" };
    }
    if (part.type === "input_video" && part.video_url) {
        return { type: "input_video", url: part.video_url };
    }
    if (part.type === "tool_call" && part.id && part.function?.name) {
        return {
            type: "tool_call",
            id: part.id,
            name: part.function.name,
            arguments: part.function.arguments ?? "",
        };
    }
    return null;
}

function normalizeContent(content: any): CoreContentPart[] {
    if (Array.isArray(content)) {
        return content.map(partFromOpenAI).filter(Boolean) as CoreContentPart[];
    }
    if (typeof content === "string") {
        return [{ type: "text", text: content }];
    }
    return [];
}

export function openAiChatToCore(
    body: ChatCompletionsRequest,
    opts: { strictness?: CoreRequest["strictness"] } = {}
): CoreRequest {
    const turns: CoreTurn[] = [];
    const messages = Array.isArray(body.messages) ? body.messages : [];
    for (const message of messages) {
        const role = message?.role;
        const content = normalizeContent(message?.content);
        if (!role) continue;
        if (role === "tool" && typeof message?.content === "string") {
            const id = message.tool_call_id ?? "tool";
            turns.push({
                role: "tool",
                content: [{ type: "tool_result", id, content: message.content }],
            });
            continue;
        }
        turns.push({
            role,
            content,
        });
    }

    return {
        model: body.model,
        input: turns,
        tools: body.tools?.map((tool) => ({
            name: tool.function?.name ?? "",
            description: tool.function?.description,
            schema: tool.function?.parameters,
        })),
        tool_choice: body.tool_choice as CoreRequest["tool_choice"],
        sampling: {
            temperature: body.temperature,
            top_p: body.top_p,
            top_k: body.top_k as number | undefined,
            seed: body.seed as number | undefined,
            presence_penalty: body.presence_penalty as number | undefined,
            frequency_penalty: body.frequency_penalty as number | undefined,
        },
        limits: {
            max_output_tokens: body.max_output_tokens ?? body.max_tokens,
            stop: Array.isArray(body.stop) ? body.stop : body.stop ? [body.stop] : undefined,
        },
        response: body.response_format
            ? {
                type: body.response_format.type === "json_schema" ? "json_schema" : "json_object",
                schema: (body.response_format as any).schema,
            }
            : undefined,
        stream: body.stream,
        metadata: {
            request_id: (body as any)?.metadata?.request_id,
            user_id: body.user,
        },
        strictness: opts.strictness,
    };
}

function splitParts(parts: CoreContentPart[]) {
    const text: string[] = [];
    const toolCalls: CoreContentPart[] = [];
    const toolResults: CoreContentPart[] = [];
    const rich: CoreContentPart[] = [];
    for (const part of parts) {
        if (part.type === "text") {
            text.push(part.text);
        } else if (part.type === "tool_call") {
            toolCalls.push(part);
        } else if (part.type === "tool_result") {
            toolResults.push(part);
        } else {
            rich.push(part);
        }
    }
    return { text, toolCalls, toolResults, rich };
}

function partsToContent(parts: CoreContentPart[]): string | any[] {
    const { text, rich } = splitParts(parts);
    if (!rich.length) return text.join("");
    const content: any[] = [];
    if (text.length) {
        content.push({ type: "text", text: text.join("") });
    }
    for (const part of rich) {
        if (part.type === "image") {
            content.push({
                type: "image_url",
                image_url: { url: part.url, detail: part.detail },
            });
        } else if (part.type === "input_audio") {
            content.push({
                type: "input_audio",
                input_audio: { data: part.data, format: part.format },
            });
        } else if (part.type === "input_video") {
            content.push({
                type: "input_video",
                video_url: part.url,
            });
        }
    }
    return content;
}

function mapTurn(turn: CoreTurn) {
    const { toolCalls, toolResults } = splitParts(turn.content);
    if (turn.role === "tool") {
        const toolResult = toolResults[0] as CoreContentPart | undefined;
        return {
            role: "tool",
            content: toolResult?.content ?? "",
            tool_call_id: toolResult?.id ?? "",
        };
    }

    const message: any = {
        role: turn.role,
        content: partsToContent(turn.content),
    };

    if (toolCalls.length) {
        message.tool_calls = toolCalls.map((part) => ({
            id: part.id,
            type: "function",
            function: {
                name: part.name,
                arguments: part.arguments,
            },
        }));
    }

    return message;
}

export function coreToOpenAiChat(body: CoreRequest): ChatCompletionsRequest {
    const messages = body.input.map(mapTurn);
    return {
        model: body.model,
        messages,
        temperature: body.sampling?.temperature,
        top_p: body.sampling?.top_p,
        top_k: body.sampling?.top_k as any,
        seed: body.sampling?.seed as any,
        presence_penalty: body.sampling?.presence_penalty as any,
        frequency_penalty: body.sampling?.frequency_penalty as any,
        max_output_tokens: body.limits?.max_output_tokens,
        stop: body.limits?.stop,
        tools: body.tools?.map((tool) => ({
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.schema,
            },
        })),
        tool_choice: body.tool_choice as any,
        response_format: body.response
            ? body.response.type === "json_schema"
                ? { type: "json_schema", schema: body.response.schema }
                : { type: "json_object" }
            : undefined,
        stream: body.stream,
        user: body.metadata?.user_id,
    };
}

export function openAiChatResponseToCore(payload: any): CoreResponse {
    const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
    const message = choice?.message ?? {};
    const contentParts: CoreContentPart[] = [];

    if (typeof message?.content === "string") {
        contentParts.push({ type: "text", text: message.content });
    }

    if (Array.isArray(message?.tool_calls)) {
        for (const call of message.tool_calls) {
            if (call?.id && call.function?.name) {
                contentParts.push({
                    type: "tool_call",
                    id: call.id,
                    name: call.function.name,
                    arguments: call.function.arguments ?? "",
                });
            }
        }
    }

    const output: CoreTurn[] = [{
        role: "assistant",
        content: contentParts,
    }];

    return {
        output,
        usage: payload?.usage ? {
            input_tokens: payload.usage.input_tokens ?? payload.usage.prompt_tokens,
            output_tokens: payload.usage.output_tokens ?? payload.usage.completion_tokens,
            total_tokens: payload.usage.total_tokens,
        } : undefined,
    };
}

export function coreToOpenAiChatResponse(
    core: CoreResponse,
    opts: { requestId: string; model: string; created?: number }
): Record<string, any> {
    const created = opts.created ?? Math.floor(Date.now() / 1000);
    const output = Array.isArray(core.output) ? core.output : [];
    const assistant = output.find((turn) => turn.role === "assistant") ?? output[0];
    const contentParts = assistant?.content ?? [];
    const { toolCalls } = splitParts(contentParts);
    const content = partsToContent(contentParts);

    const message: any = {
        role: "assistant",
        content,
    };
    if (toolCalls.length) {
        message.tool_calls = toolCalls.map((part) => ({
            id: part.id,
            type: "function",
            function: {
                name: part.name,
                arguments: part.arguments,
            },
        }));
    }

    return {
        id: opts.requestId,
        object: "chat.completion",
        created,
        model: opts.model,
        choices: [{
            index: 0,
            message,
            finish_reason: null,
        }],
        usage: core.usage ? {
            prompt_tokens: core.usage.input_tokens,
            completion_tokens: core.usage.output_tokens,
            total_tokens: core.usage.total_tokens,
        } : undefined,
    };
}
