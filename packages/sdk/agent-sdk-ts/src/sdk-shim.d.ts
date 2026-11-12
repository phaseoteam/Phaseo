declare module "@phaseo/sdk" {
	export type PhaseoOptions = {
		apiKey?: string;
		baseUrl?: string;
		timeoutMs?: number;
		fetchImpl?: typeof fetch;
		headers?: Record<string, string>;
		modelLifecycleChecks?: boolean;
	};

		export type ResponsesRequest = {
		background?: boolean;
		debug?: Record<string, unknown>;
		echo_upstream_request?: boolean;
		image_config?: Record<string, unknown>;
		include?: string[];
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
		modalities?: string[];
		previous_response_id?: string;
		user?: string;
		response_format?: unknown;
		web_search_options?: Record<string, unknown>;
		plugins?: unknown[];
		provider_options?: Record<string, unknown>;
		prompt_cache_key?: string | null;
		safety_identifier?: string | null;
		service_tier?: string;
		session_id?: string;
		store?: boolean;
		stream?: boolean;
		text?: Record<string, unknown>;
		top_p?: number;
		truncation?: string;
		usage?: boolean;
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
			create(request: ResponsesRequest, options?: { signal?: AbortSignal }): Promise<ResponsesResponse | AsyncGenerator<string>>;
		};
	}
}
