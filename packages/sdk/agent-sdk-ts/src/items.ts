import type {
	AgentItem,
	AgentModelResponse,
	AgentToolCall,
	AgentToolExecutionResult,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function itemText(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(itemText).filter(Boolean).join("\n");
	if (!isRecord(value)) return "";
	return stringValue(value.text)
		?? stringValue(value.content)
		?? itemText(value.summary)
		?? itemText(value.parts);
}

function parseInput(value: unknown): unknown {
	if (typeof value !== "string") return value ?? {};
	try { return JSON.parse(value); } catch { return { raw: value }; }
}

// Function names the gateway gives the server tools it runs itself: `phaseo:web_search` is
// called as `phaseo_web_search`, a named advisor as `phaseo_advisor_<name>`, and so on.
const GATEWAY_SERVER_TOOL_FUNCTION_NAMES = new Set([
	"gateway_datetime", "phaseo_web_search", "phaseo_web_fetch", "phaseo_advisor", "phaseo_image_generation",
	"phaseo_apply_patch", "phaseo_subagent", "phaseo_fusion", "phaseo_search_models",
]);

/** True for a call to one of the gateway's own server tools, by function name or `phaseo:`/`gateway:` tool type. */
export function isGatewayServerToolName(name: string): boolean {
	return GATEWAY_SERVER_TOOL_FUNCTION_NAMES.has(name) || name.startsWith("phaseo_advisor_") || /^(phaseo|gateway):/.test(name);
}

/** A call item the gateway already ran: it sends server-tool calls back with the result inline (`output`, or `error` on failure). */
export function isExecutedToolCallItem(value: unknown): boolean {
	return isRecord(value) && (value.output != null || value.error != null);
}

/** Convert provider output items into the portable AgentItem contract. */
export function normalizeAgentItems(value: unknown): AgentItem[] {
	if (!isRecord(value)) return [{ type: "output", value, rawProviderItem: value }];
	const providerType = String(value.type ?? "").toLowerCase();
	const id = stringValue(value.id);
	const base = { ...(id ? { id } : {}), rawProviderItem: value };

	if (providerType === "message") {
		const content = itemText(value.content);
		return [{ type: "message", role: "assistant", content, ...base }];
	}
	if (providerType.includes("reasoning")) {
		return [{ type: "reasoning", text: itemText(value), ...base }];
	}
	if (providerType === "function_call" || providerType === "tool_call") {
		const toolCallId = stringValue(value.call_id) ?? stringValue(value.tool_call_id) ?? id ?? "tool_call";
		const name = stringValue(value.name) ?? "tool";
		const call: AgentItem = { type: "tool_call", toolCallId, name, input: parseInput(value.arguments ?? value.input), ...base };
		if (!isExecutedToolCallItem(value)) return [call];
		// Already run by the gateway: keep the call and its result, so nothing runs it again.
		if (value.status === "failed" || value.error != null) {
			const error = isRecord(value.error) ? value.error : undefined;
			return [call, { type: "error", message: stringValue(error?.message) ?? stringValue(value.error) ?? "Server tool failed", toolCallId, toolName: name, ...base }];
		}
		return [call, { type: "tool_result", toolCallId, name, output: value.output, ...base }];
	}
	if (providerType === "function_call_output" || providerType === "tool_result") {
		return [{
			type: "tool_result",
			toolCallId: stringValue(value.call_id) ?? stringValue(value.tool_call_id) ?? id ?? "tool_call",
			name: stringValue(value.name) ?? "tool",
			output: value.output ?? value.result,
			...base,
		}];
	}
	if (providerType.includes("error") || value.error !== undefined) {
		const error = isRecord(value.error) ? value.error : undefined;
		return [{
			type: "error",
			message: stringValue(error?.message) ?? stringValue(value.message) ?? String(value.error ?? "Unknown provider error"),
			code: stringValue(error?.code) ?? stringValue(value.code),
			...base,
		}];
	}
	if (providerType === "output_text") {
		return [{ type: "message", role: "assistant", content: itemText(value), ...base }];
	}
	return [{ type: "output", value, ...base }];
}

export function responseItems(response: AgentModelResponse): AgentItem[] {
	if (response.items?.length) return response.items;
	const items: AgentItem[] = [];
	if (response.message.reasoning) items.push({ type: "reasoning", text: response.message.reasoning });
	if (response.message.content) items.push({ type: "message", role: "assistant", content: response.message.content });
	for (const call of response.message.toolCalls ?? []) items.push(toolCallItem(call));
	return items;
}

export function toolCallItem(call: AgentToolCall): AgentItem {
	return { type: "tool_call", id: call.id, toolCallId: call.id, name: call.name, input: call.input };
}

export function toolResultItem(result: AgentToolExecutionResult): AgentItem {
	if (result.error) return {
		type: "error",
		message: result.error,
		toolCallId: result.toolCallId,
		toolName: result.toolName,
	};
	return {
		type: "tool_result",
		toolCallId: result.toolCallId,
		name: result.toolName,
		output: result.result,
	};
}

export function agentItemKey(item: AgentItem): string {
	switch (item.type) {
		case "message": return `message:${item.id ?? item.content}`;
		case "reasoning": return `reasoning:${item.id ?? item.text}`;
		case "tool_call": return `tool_call:${item.toolCallId}`;
		case "tool_result": return `tool_result:${item.toolCallId}`;
		case "error": return `error:${item.toolCallId ?? item.id ?? item.message}`;
		case "output": return `output:${item.id ?? "final"}`;
	}
}
