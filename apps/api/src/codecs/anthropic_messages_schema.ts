import { z } from "zod";

const TextPartSchema = z.object({
    type: z.literal("text"),
    text: z.string(),
});

const ImagePartSchema = z.object({
    type: z.literal("image"),
    source: z.object({
        type: z.string(),
        media_type: z.string().optional(),
        data: z.string().optional(),
        url: z.string().optional(),
    }).optional(),
});

const ToolUsePartSchema = z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.record(z.any()).optional(),
});

const ToolResultPartSchema = z.object({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    content: z.string().optional(),
});

const ContentPartSchema = z.union([
    TextPartSchema,
    ImagePartSchema,
    ToolUsePartSchema,
    ToolResultPartSchema,
]);

export const AnthropicMessagesSchema = z.object({
    model: z.string().min(1),
    messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.union([z.string(), z.array(ContentPartSchema)]),
    })).min(1),
    system: z.union([z.string(), z.array(z.any())]).optional(),
    max_tokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    top_k: z.number().int().positive().optional(),
    tools: z.array(z.object({
        name: z.string(),
        description: z.string().optional(),
        input_schema: z.any().optional(),
    })).optional(),
    tool_choice: z.union([z.string(), z.record(z.any())]).optional(),
    stream: z.boolean().optional(),
    metadata: z.record(z.any()).optional(),
}).passthrough();

export type AnthropicMessagesRequest = z.infer<typeof AnthropicMessagesSchema>;
