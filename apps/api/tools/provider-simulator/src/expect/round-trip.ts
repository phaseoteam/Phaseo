// Purpose: Tool-loop round trip: the client's own output, sent back as the next step, must restore provider state.
// Why: Reasoning signatures and encrypted reasoning are opaque to clients; the only real test is whether they
//      come back to the provider that issued them, together with the tool call and its id.
// How: Runs the probe with the "max" response for a buffered client, builds the next request from the client JSON
//      exactly as an SDK would, runs it on the same route and checks the captured upstream body.

import type { ClientScenario, Surface } from "../client-requests";
import { detectDialect, type Dialect } from "../dialects";
import { runRequest, type RouteUnderTest } from "../request-pipeline";
import { deliverToClient } from "../response-pipeline";
import { BASIC, UPSTREAM_ENCRYPTED, UPSTREAM_REDACTED, UPSTREAM_SIGNATURE, maxVariant } from "../response-variants";
import { resolveSource, upstreamReturnsState } from "./text";
import type { Mismatch, Source } from "./types";

const FC_SIGNATURE = "SIM-UPSTREAM-FC-SIGNATURE-0001";

function nextRequestBody(surface: Surface, probe: any, client: any): any | null {
	if (surface === "chat") {
		const message = client?.choices?.[0]?.message;
		if (!message) return null;
		const assistant: Record<string, unknown> = { role: "assistant" };
		for (const key of ["content", "tool_calls", "reasoning_content", "reasoning_details"]) {
			if (message[key] !== undefined && message[key] !== null) assistant[key] = message[key];
		}
		const tools = (message.tool_calls ?? []).map((call: any) => ({ role: "tool", tool_call_id: call.id, content: `SIM-ROUNDTRIP-RESULT ${call.function?.name}` }));
		return { ...probe, messages: [...probe.messages, assistant, ...tools] };
	}
	if (surface === "responses") {
		const output = Array.isArray(client?.output) ? client.output : null;
		if (!output) return null;
		const input = typeof probe.input === "string" ? [{ type: "message", role: "user", content: probe.input }] : probe.input;
		const results = output.filter((item: any) => item?.type === "function_call").map((item: any) => ({ type: "function_call_output", call_id: item.call_id, output: `SIM-ROUNDTRIP-RESULT ${item.name}` }));
		return { ...probe, input: [...input, ...output, ...results] };
	}
	const content = Array.isArray(client?.content) ? client.content : null;
	if (!content) return null;
	const results = content.filter((block: any) => block?.type === "tool_use").map((block: any) => ({ type: "tool_result", tool_use_id: block.id, content: `SIM-ROUNDTRIP-RESULT ${block.name}` }));
	return { ...probe, messages: [...probe.messages, { role: "assistant", content }, { role: "user", content: results }] };
}

type Want = { needle: string; path: string; source: Source };

function expectedState(provider: string, dialect: Dialect, surface: Surface): Want[] {
	const reasoningDoc: Source = surface === "chat"
		? { kind: "gateway-docs", page: "apps/docs/v1/api-reference/endpoint/chat-completions.mdx", note: "## Reasoning in tool loops" }
		: surface === "responses"
			? { kind: "gateway-docs", page: "apps/docs/v1/api-reference/endpoint/responses.mdx", note: "## Reasoning in tool loops" }
			: { kind: "ref", ref: "anthropic-thinking" };
	const toolSource: Source = { kind: "ref", ref: "gemini-function-calling" };
	const wants: Want[] = [
		{ needle: "SIM-UP-ARG-Lyon", path: "roundtrip.upstream.assistant_tool_call", source: dialect.startsWith("gemini") ? toolSource : { kind: "ref", ref: "openai-chat-object" } },
	];
	if (!dialect.startsWith("gemini")) wants.push({ needle: "call_SIM_UP_0001", path: "roundtrip.upstream.tool_call_id", source: { kind: "ref", ref: "openai-chat-object" } });
	if (dialect === "anthropic-messages") {
		wants.push({ needle: UPSTREAM_SIGNATURE, path: "roundtrip.upstream.thinking_signature", source: reasoningDoc });
		wants.push({ needle: UPSTREAM_REDACTED, path: "roundtrip.upstream.redacted_thinking", source: reasoningDoc });
	}
	if (dialect === "openai-responses" && upstreamReturnsState(provider, dialect)) wants.push({ needle: UPSTREAM_ENCRYPTED, path: "roundtrip.upstream.encrypted_reasoning", source: reasoningDoc });
	if (dialect === "gemini") wants.push({ needle: FC_SIGNATURE, path: "roundtrip.upstream.function_call_thought_signature", source: reasoningDoc });
	if (dialect === "gemini-interactions") wants.push({ needle: UPSTREAM_SIGNATURE, path: "roundtrip.upstream.thought_signature", source: reasoningDoc });
	return wants;
}

export async function roundTripMismatches(provider: string, route: RouteUnderTest, scenarios: ClientScenario[]): Promise<Mismatch[]> {
	const out: Mismatch[] = [];
	for (const surface of ["chat", "responses", "messages"] as Surface[]) {
		const probe = scenarios.find((entry) => entry.id === `${surface}.tools.probe`);
		if (!probe) continue;
		const ctx = { layer: "executor" as const, provider, family: "text", model: route.route.apiModelId, surface, mode: "buffered" as const, caseId: `roundtrip:${surface}` };
		try {
			const first = await runRequest({ scenario: probe, route, requestId: `req_sim_rt1_${surface}`, variant: maxVariant(), clientStream: false });
			if (!first.result || !first.providerCall) continue;
			const dialect = detectDialect(first.providerCall.url);
			const delivered = await deliverToClient({ result: first.result, mode: "buffered", surface, body: first.parsedBody ?? first.clientBody, requestId: `req_sim_rt1_${surface}`, route });
			const body = nextRequestBody(surface, probe.body, delivered.clientJson);
			if (!body) continue;
			const next = await runRequest({
				scenario: { id: `roundtrip:${surface}`, surface, kind: "agent", body },
				route,
				requestId: `req_sim_rt2_${surface}`,
				variant: BASIC,
				clientStream: false,
			});
			if (!next.providerCall) {
				out.push({ ...ctx, kind: "error_mapping", path: "roundtrip.client.status", expected: 200, actual: next.zod.ok ? next.validation.errorDetail ?? next.executorError : next.zod.issues?.join("; "), source: resolveSource({ kind: "assumed", reason: "Sending a response back unchanged as the next step is the documented tool-loop pattern and must be accepted." }) });
				continue;
			}
			const text = next.providerCall.bodyText ?? "";
			for (const want of expectedState(provider, dialect, surface)) {
				if (!text.includes(want.needle)) out.push({ ...ctx, kind: "dropped", path: want.path, expected: want.needle, actual: undefined, source: resolveSource(want.source), note: `upstream ${dialect}` });
			}
			if (next.result?.kind === "stream" && !next.result.stream.locked) void next.result.stream.cancel().catch(() => {});
		} catch (error) {
			out.push({ ...ctx, kind: "error_mapping", path: "roundtrip.harness", expected: "completed", actual: error instanceof Error ? error.message : String(error), source: { kind: "assumed", reason: "harness error" } });
		}
	}
	return out;
}
