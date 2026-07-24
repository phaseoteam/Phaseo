export type AppDetails = {
	id: string;
	slug: string;
	title: string;
	url: string | null;
	image_url: string | null;
	workspace_id: string;
	is_active: boolean;
	is_public: boolean;
	last_seen: string;
	created_at: string;
	updated_at: string;
	total_tokens: number;
	total_requests: number;
};

export type RangeKey = "1h" | "1d" | "1w" | "4w" | "1m" | "1y";

export type AppUsageRow = {
	created_at: string;
	usage: any;
	cost_nanos: number;
	model_id: string;
	provider: string;
	success: boolean;
	requests?: number;
	successful_requests?: number;
};
