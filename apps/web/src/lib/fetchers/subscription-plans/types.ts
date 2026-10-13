import type { SubscriptionPrice, SubscriptionPriceComponent } from "./pricing";

export interface SubscriptionOffer {
	offer_uuid: string;
	billing_interval: string | null;
	billing_interval_count: number;
	currency: string | null;
	components: SubscriptionPriceComponent[];
	minimum_seats: number | null;
	region_code: string | null;
	tax_treatment: string;
	purchase_url: string | null;
	source_url: string | null;
	verified_at: string | null;
}

export interface SubscriptionAllowance {
	allowance_uuid: string;
	allowance_key: string;
	offer_uuid: string | null;
	feature_key: string;
	allowance_kind: string;
	quantity: number | null;
	quantity_max: number | null;
	quantity_kind: string;
	unit: string;
	currency: string | null;
	window_kind: string;
	window_unit: string | null;
	window_count: number | null;
	allocation_basis: string;
	pool_scope: string;
	grant_condition: string | null;
	display_text: string | null;
	conditions: string | null;
	overage_policy: string;
	overage_price: number | null;
	overage_currency: string | null;
	source_url: string | null;
	verified_at: string | null;
}

export interface SubscriptionPlanSummary {
	plan_uuid: string;
	plan_id: string;
	name: string;
	organisation_id: string | null;
	description: string | null;
	link: string | null;
	other_info: any;
	organisation: {
		organisation_id: string;
		name: string;
		colour: string | null;
	} | null;
	prices: SubscriptionPrice[];
	offers?: SubscriptionOffer[];
	audience?: string;
	source_url?: string | null;
	verified_at?: string | null;
}

export interface SubscriptionPlanFeature {
	feature_key?: string | null;
	availability?: string;
	value_number?: number | null;
	value_text?: string | null;
	conditions?: string | null;
	feature_name: string;
	feature_value: string | null;
	feature_description: string | null;
	other_info: any;
}

export interface SubscriptionPlanModel {
	model_id: string;
	model_info: any;
	rate_limit: any;
	other_info: any;
	model: {
		model_id: string;
		name: string;
		organisation_id: string;
		organisation_name: string | null;
	};
}

export interface SubscriptionPlanDetails extends SubscriptionPlanSummary {
	allowances?: SubscriptionAllowance[];
	features: SubscriptionPlanFeature[];
	models: SubscriptionPlanModel[];
}
