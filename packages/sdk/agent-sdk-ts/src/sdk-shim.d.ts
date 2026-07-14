declare module "@phaseo/sdk" {
	export type PhaseoOptions = {
		apiKey?: string;
		baseUrl?: string;
		timeoutMs?: number;
		fetchImpl?: typeof fetch;
	};

	export type ResponsesRequest = {
		model: string;
		input: unknown;
		instructions?: string;
		tools?: unknown;
		tool_choice?: unknown;
		parallel_tool_calls?: boolean;
		temperature?: number;
		max_output_tokens?: number;
		provider?: unknown;
		reasoning?: unknown;
		metadata?: Record<string, string>;
		user?: string;
		response_format?: unknown;
		web_search_options?: Record<string, unknown>;
		plugins?: unknown[];
		provider_options?: Record<string, unknown>;
		prompt_cache_key?: string | null;
	};

	export type ResponsesResponse = {
		id?: string;
		model?: string;
		output?: Array<Record<string, any>>;
		output_items?: Array<Record<string, any>>;
		usage?: Record<string, unknown>;
		[key: string]: unknown;
	};

	export default class Phaseo {
		constructor(options?: PhaseoOptions);
		responses: {
			create(request: ResponsesRequest): Promise<ResponsesResponse | AsyncGenerator<string>>;
		};
	}
}
