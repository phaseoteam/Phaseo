import { executeOpenAIWire } from "@executors/_shared/text-generate/openai-compat";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";

export const executor = buildTextExecutor({
	preprocess: (ir, args) => cherryPickIRParams(ir, args.capabilityParams),
	execute: executeOpenAIWire,
	postprocess: ir => ir,
	transformStream: stream => stream,
});
