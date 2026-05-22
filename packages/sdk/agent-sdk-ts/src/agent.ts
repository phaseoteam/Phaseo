import {
	continueAgent,
	runAgent,
} from "./runtime/loop";
import type {
	AgentContinueOptions,
	AgentDefinition,
	AgentRunOptions,
	AgentTool,
} from "./types";

export function defineTool<TInput = unknown, TOutput = unknown, TContext = unknown>(
	tool: AgentTool<TInput, TOutput, TContext>,
) {
	return tool;
}

export function createAgent<TInput = unknown, TOutput = string, TContext = unknown>(
	definition: AgentDefinition<TInput, TOutput, TContext>,
) {
	return {
		definition,
		run: (options: AgentRunOptions<TInput, TContext>) => runAgent(definition, options),
		continueRun: (options: AgentContinueOptions<TInput, TOutput, TContext>) =>
			continueAgent(definition, options),
	};
}
