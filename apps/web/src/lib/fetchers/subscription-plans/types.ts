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
	prices: Array<{
		frequency: string;
		price: number;
		currency: string;
		plan_uuid: string;
	}>;
}

export interface SubscriptionPlanFeature {
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
	features: SubscriptionPlanFeature[];
	models: SubscriptionPlanModel[];
	prices: Array<{
		price: number;
		currency: string;
		frequency: string;
		plan_uuid: string;
	}>;
}
