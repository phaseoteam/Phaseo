import type { ResponsesRequest } from "@/lib/schemas";
import type { CoreContentPart, CoreRequest, CoreResponse, CoreTurn } from "@/core/types";

function partsFromContent(content: any): CoreContentPart[] {
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (part?.type === "text" && typeof part.text === "string") {
                    return { type: "text", text: part.text };
                }
                if (part?.type === "input_audio" && part.input_audio?.data) {
                    return {
                        type: "input_audio",
                        data: part.input_audio.data,
                        format: part.input_audio.format ?? "wav",
                    };
                }
                if (part?.type === "input_video" && part.video_url) {
                    return { type: "input_video", url: part.video_url };
                }
                if (part?.type === "image_url" && part.image_url?.url) {
                    return { type: "image", url: part.image_url.url };
                }
                if (part?.type === "tool_call" && part.id && part.function?.name) {
                    return {
                        type: "tool_call",
                        id: part.id,
                        name: part.function.name,
                        arguments: part.function.arguments ?? "",
                    };
                }
                return null;
            })
            .filter(Boolean) as CoreContentPart[];
    }
    if (typeof content === "string") return [{ type: "text", text: content }];
    return [];
}

function turnsFromResponses(input: any): CoreTurn[] {
    const turns: CoreTurn[] = [];
    const items = Array.isArray(input) ? input : input ? [input] : [];
    for (const item of items) {
        if (!item) continue;
        if (item.type === "input_text" && typeof item.text === "string") {
            turns.push({ role: "user", content: [{ type: "text", text: item.text }] });
        }
        if (item.type === "input_image" && item.image_url) {
            turns.push({ role: "user", content: [{ type: "image", url: item.image_url }] });
        }
        if (item.type === "message") {
            const role = item.role ?? "user";
            const content = partsFromContent(item.content);
            turns.push({ role, content });
        }
        if (item.type === "tool_result") {
            turns.push({
                role: "tool",
                content: [{
                    type: "tool_result",
                    id: item.tool_call_id ?? "tool",
                    content: item.content ?? "",
                }],
            });
        }
    }
    return turns;
}

export function openAiResponsesToCore(
    body: ResponsesRequest,
    opts: { strictness?: CoreRequest["strictness"] } = {}
): CoreRequest {
    const turns: CoreTurn[] = [];
    if (body.input) turns.push(...turnsFromResponses(body.input));
    if (body.input_items) turns.push(...turnsFromResponses(body.input_items));
    if (body.prompt?.id) {
        turns.push({
            role: "system",
            content: [{ type: "text", text: `prompt:${body.prompt.id}` }],
        });
    }
    return {
        model: body.model,
        input: turns,
        tools: body.tools?.map((tool) => ({
            name: tool?.function?.name ?? tool?.name ?? "",
            description: tool?.function?.description ?? tool?.description,
            schema: tool?.function?.parameters ?? tool?.schema ?? tool?.input_schema,
        })),
        tool_choice: body.tool_choice as CoreRequest["tool_choice"],
        sampling: {
            temperature: body.temperature,
            top_p: body.top_p,
        },
        limits: {
            max_output_tokens: body.max_output_tokens,
        },
        response: body.text
            ? {
                type: body.text?.format === "json_schema" ? "json_schema" : "json_object",
                schema: body.text?.schema,
            }
            : undefined,
        stream: body.stream,
        metadata: {
            request_id: body.metadata?.request_id as string | undefined,
            user_id: body.metadata?.user_id as string | undefined,
        },
        strictness: opts.strictness,
    };
}

function partToResponse(part: CoreContentPart): any | null {
    if (part.type === "text") return { type: "output_text", text: part.text };
    if (part.type === "image") return { type: "output_image", image_url: part.url };
    if (part.type === "tool_call") {
        return {
            type: "tool_call",
            id: part.id,
            function: {
                name: part.name,
                arguments: part.arguments,
            },
        };
    }
    return null;
}

export function coreToOpenAiResponses(body: CoreRequest): ResponsesRequest {
    return {
        model: body.model,
        input: body.input.map((turn) => ({
            type: "message",
            role: turn.role,
            content: turn.content.map(partToResponse).filter(Boolean),
        })),
        max_output_tokens: body.limits?.max_output_tokens,
        temperature: body.sampling?.temperature,
        top_p: body.sampling?.top_p,
        tool_choice: body.tool_choice as any,
        tools: body.tools?.map((tool) => ({
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.schema,
            },
        })),
        stream: body.stream,
        text: body.response
            ? {
                format: body.response.type === "json_schema" ? "json_schema" : "json_object",
                schema: body.response.schema,
            }
            : undefined,
        metadata: body.metadata ?? undefined,
    } as ResponsesRequest;
}

function extractText(payload: any): string | null {
    if (typeof payload?.output_text === "string") return payload.output_text;
    if (typeof payload?.text === "string") return payload.text;
    const output = Array.isArray(payload?.output) ? payload.output : [];
    for (const item of output) {
        const content = item?.content ?? item?.output ?? item?.message?.content;
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
            const textPart = content.find((p: any) => p?.type === "output_text" || p?.type === "text");
            if (textPart?.text) return textPart.text;
        }
    }
    return null;
}

export function openAiResponsesResponseToCore(payload: any): CoreResponse {
    const text = extractText(payload);
    const parts: CoreContentPart[] = text ? [{ type: "text", text }] : [];
    const output: CoreTurn[] = [{
        role: "assistant",
        content: parts,
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

export function coreToOpenAiResponsesResponse(
    core: CoreResponse,
    opts: { requestId: string; model: string; created?: number }
): Record<string, any> {
    const created = opts.created ?? Math.floor(Date.now() / 1000);
    const output = Array.isArray(core.output) ? core.output : [];
    const assistant = output.find((turn) => turn.role === "assistant") ?? output[0];
    const contentParts = assistant?.content ?? [];
    const content = contentParts.map(partToResponse).filter(Boolean);

    return {
        id: opts.requestId,
        object: "response",
        created,
        model: opts.model,
        type: "message",
        role: "assistant",
        content,
        usage: core.usage ? {
            prompt_tokens: core.usage.input_tokens,
            completion_tokens: core.usage.output_tokens,
            total_tokens: core.usage.total_tokens,
        } : undefined,
    };
}
