export const ALL_PARAMETERS_DOCS_HREF =
	"https://docs.phaseo.app/v1/api-reference/parameters";

export type ParameterReference = {
	type: string;
	defaultValue: string;
	description: string;
};

const PARAMETER_REFERENCE: Record<string, ParameterReference> = {
	reasoning: {
		type: "object",
		defaultValue: "-",
		description:
			"Provider-specific reasoning configuration for reasoning-capable APIs.",
	},
	temperature: {
		type: "number",
		defaultValue: "Provider specific",
		description: "Controls how random token selection can be.",
	},
	top_p: {
		type: "number",
		defaultValue: "Provider specific",
		description:
			"Applies nucleus sampling by limiting candidates to a probability mass threshold.",
	},
	top_k: {
		type: "integer",
		defaultValue: "Provider specific",
		description:
			"Restricts sampling to the top-k candidate tokens on providers that expose it.",
	},
	min_p: {
		type: "number",
		defaultValue: "Provider specific",
		description:
			"Narrows sampling by discarding tokens below a minimum probability threshold.",
	},
	max_tokens: {
		type: "integer",
		defaultValue: "Provider specific",
		description:
			"Caps output length on endpoints and providers that use the max_tokens field name.",
	},
	max_output_tokens: {
		type: "integer",
		defaultValue: "Provider specific",
		description:
			"Caps output length on routes that use max_output_tokens instead of max_tokens.",
	},
	max_completion_tokens: {
		type: "integer",
		defaultValue: "Provider specific",
		description:
			"Caps output length on newer OpenAI-style text APIs that use max_completion_tokens.",
	},
	seed: {
		type: "integer",
		defaultValue: "Unset",
		description:
			"Requests deterministic sampling when the upstream provider supports seeded generation.",
	},
	stop: {
		type: "string or string[]",
		defaultValue: "-",
		description: "Defines one or more sequences that terminate generation early.",
	},
	logprobs: {
		type: "boolean",
		defaultValue: "false",
		description: "Requests token-level probability data in the response.",
	},
	top_logprobs: {
		type: "integer",
		defaultValue: "-",
		description:
			"Limits how many alternative token probabilities are returned per position.",
	},
	logit_bias: {
		type: "object",
		defaultValue: "-",
		description:
			"Adjusts token selection bias directly when a provider exposes logit control.",
	},
	tools: {
		type: "array",
		defaultValue: "-",
		description: "Defines callable tools or functions the model can invoke.",
	},
	tool_choice: {
		type: "string or object",
		defaultValue: "auto",
		description: "Controls which tool, if any, the model should call.",
	},
	parallel_tool_calls: {
		type: "boolean",
		defaultValue: "Provider specific",
		description: "Allows or restricts concurrent tool execution where supported.",
	},
	response_format: {
		type: "string or object",
		defaultValue: "-",
		description:
			"Requests plain text, JSON, or schema-constrained output formats.",
	},
	structured_outputs: {
		type: "boolean",
		defaultValue: "false",
		description:
			"Capability signal for reliable schema-constrained output workflows.",
	},
	json_schema: {
		type: "object",
		defaultValue: "-",
		description: "Defines the schema to enforce for structured output workflows.",
	},
	frequency_penalty: {
		type: "number",
		defaultValue: "0",
		description:
			"Discourages repeated tokens in proportion to how often they already appeared.",
	},
	presence_penalty: {
		type: "number",
		defaultValue: "0",
		description:
			"Encourages the model to explore new wording or topics after they first appear.",
	},
	repetition_penalty: {
		type: "number",
		defaultValue: "Provider specific",
		description:
			"Applies provider-specific anti-repetition behavior outside the classic penalty fields.",
	},
	include_reasoning: {
		type: "boolean",
		defaultValue: "false",
		description:
			"Requests reasoning content or reasoning summaries in responses where supported.",
	},
	reasoning_effort: {
		type: "string",
		defaultValue: "Provider specific",
		description:
			"Requests a lower or higher reasoning budget when the endpoint exposes that control.",
	},
	reasoning_tokens: {
		type: "integer",
		defaultValue: "Provider specific",
		description:
			"Represents a reasoning-specific token budget or accounting field where supported.",
	},
	service_tier: {
		type: "string",
		defaultValue: "standard",
		description:
			"Chooses a supported request tier such as priority or flex when the route supports it.",
	},
	stream: {
		type: "boolean",
		defaultValue: "false",
		description:
			"Returns output incrementally over Server-Sent Events instead of one final response body.",
	},
};

export function getParameterDocsHref(paramId: string): string {
	return `${ALL_PARAMETERS_DOCS_HREF}#parameter-${paramId}`;
}

export function getParameterReference(paramId: string): ParameterReference {
	return (
		PARAMETER_REFERENCE[paramId] ?? {
			type: "-",
			defaultValue: "-",
			description:
				"See the full parameter reference for endpoint-specific semantics and provider caveats.",
		}
	);
}
