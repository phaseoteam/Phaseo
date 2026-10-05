import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { executeOpenAIWire } from "@executors/_shared/text-generate/openai-compat";
import { cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { REFLECTION_REASONING_EFFORTS } from "@providers/reflection/config";

export const executor: ProviderExecutor = async (args: ExecutorExecuteArgs): Promise<ExecutorResult> => {
	const ir = args.ir as IRChatRequest;
	const effort = ir.reasoning?.effort;
	const invalidReasoning = ir.reasoning?.enabled === false ||
		(effort !== undefined && !REFLECTION_REASONING_EFFORTS.some((value) => value === effort));
	const param = invalidReasoning ? "reasoning_effort" : ir.stop !== undefined ? "stop" : null;
	if (param) {
		return {
			kind: "completed",
			terminal: true,
			localClientError: true,
			bill: { cost_cents: 0, currency: "USD" },
			upstream: Response.json({ error: {
				type: "invalid_request_error",
				code: "unsupported_parameter",
				param,
				message: invalidReasoning
					? "Reflection requires reasoning with effort low, medium, high, xhigh, or max."
					: "Reflection does not enforce stop sequences.",
			} }, { status: 400 }),
		};
	}
	return executeOpenAIWire({ ...args, ir: cherryPickIRParams(ir, args.capabilityParams) }, {
		forceChat: true,
		transientRetries: 1,
	});
};
