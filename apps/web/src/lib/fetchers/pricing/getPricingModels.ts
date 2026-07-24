export interface PricingMeter {
	meter: string;
	unit: string;
	unit_size: number;
	price_per_unit: string;
	currency: string;
	conditions?: any[];
	billing_timestamp_basis?: "request_start" | "provider_accept" | "completion" | "unknown";
	time_windows?: Array<{ label: string; timezone: "UTC"; start_time: string; end_time: string; price_per_unit?: string | number | null; priority?: number | null }>;
}

export interface PricingModel {
	provider: string;
	model: string;
	api_model_id?: string;
	endpoint: string;
	display_name?: string;
	release_date?: string | null;
	announcement_date?: string | null;
	pricing_plan?: string | null;
	meters: PricingMeter[];
}
