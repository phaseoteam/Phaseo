export interface Provider {
	id: string;
	name: string;
	baseUrl: string;
	envVar: string | string[];
	headers?: Record<string, string>;
	queryParams?: Record<string, string | boolean>;
	body?: Record<string, unknown>;
	method?: "GET" | "POST";
	isAwsService?: boolean;
	transformResponse: (data: unknown) => string[];
}

export interface ProviderResult {
	provider: string;
	models: string[];
	error?: string;
	timestamp: string;
}

export interface TestResult {
	provider: string;
	passed: boolean;
	expectedFormat: boolean;
	hasModels: boolean;
	error?: string;
	responseTime: number;
}
