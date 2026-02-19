import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import { getModelPricingCached } from "@/lib/fetchers/models/getModelPricing";
import type { PricingRule } from "@/lib/fetchers/models/getModelPricing";

interface PricingProps {
	metadata: ModelGatewayMetadata;
	includeHidden: boolean;
}

type Condition = {
	path: string;
	op: string;
	value?: any;
};

function parseConditionDescription(conditions: Condition[]): string {
	if (!conditions || conditions.length === 0) return "";

	const descriptions: string[] = [];

	for (const cond of conditions) {
		switch (cond.path) {
			case "usage.context.max_tokens":
				if (cond.op === "lte") {
					descriptions.push(`up to ${cond.value?.toLocaleString()} tokens`);
				} else if (cond.op === "gt") {
					descriptions.push(`over ${cond.value?.toLocaleString()} tokens`);
				}
				break;
			case "usage.cache_hit":
				if (cond.op === "eq" && cond.value === true) {
					descriptions.push("cached");
				}
				break;
			case "usage.cache_write":
				if (cond.op === "eq" && cond.value === true) {
					descriptions.push("cache write");
				}
				break;
			case "usage.cache_read":
				if (cond.op === "eq" && cond.value === true) {
					descriptions.push("cache read");
				}
				break;
			default:
				// Generic fallback
				descriptions.push(`${cond.path} ${cond.op} ${cond.value}`);
		}
	}

	return descriptions.join(", ");
}

function groupRulesByType(rules: PricingRule[]): Record<string, PricingRule[]> {
	const groups: Record<string, PricingRule[]> = {};

	for (const rule of rules) {
		let type = "other";

		if (rule.meter.includes("text")) {
			if (rule.meter.includes("cached")) {
				type = "cached_text";
			} else {
				type = "text";
			}
		} else if (rule.meter.includes("image")) {
			type = "image";
		} else if (rule.meter.includes("audio")) {
			type = "audio";
		} else if (rule.meter.includes("video")) {
			type = "video";
		} else if (rule.meter.includes("embedding")) {
			type = "embedding";
		}

		if (!groups[type]) groups[type] = [];
		groups[type].push(rule);
	}

	return groups;
}

function formatPrice(price: number, unit: string, unitSize: number): string {
	const perUnit = unitSize > 1 ? `${unitSize} ${unit}s` : unit;
	return `$${price.toFixed(price < 0.01 ? 4 : 2)} per ${perUnit}`;
}

export default async function Pricing({ metadata, includeHidden }: PricingProps) {
	const pricingData = await getModelPricingCached(metadata.modelId, includeHidden);

	if (!pricingData || pricingData.length === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Pricing</CardTitle>
				<CardDescription>
					Pricing details for this model across different providers and modalities.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{pricingData.map((providerPricing) => {
					const typeGroups = groupRulesByType(providerPricing.pricing_rules);
					return (
						<div key={providerPricing.provider.api_provider_id} className="space-y-4">
							<h3 className="text-lg font-semibold">
								{providerPricing.provider.api_provider_name}
							</h3>
							{Object.entries(typeGroups).map(([type, rules]) => {
								const typeLabel = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
								return (
									<div key={type} className="space-y-2">
										<h4 className="text-md font-medium">{typeLabel}</h4>
										<div className="space-y-2">
											{rules
												.sort((a, b) => b.priority - a.priority) // Higher priority first
												.map((rule) => {
													const conditionDesc = parseConditionDescription(rule.match as Condition[]);
													const priceStr = formatPrice(rule.price_per_unit, rule.unit, rule.unit_size);
													const note = rule.note || conditionDesc;

													return (
														<div key={rule.id} className="rounded-lg border p-3 bg-muted/20">
															<div className="flex justify-between items-start">
																<div>
																	<h5 className="font-medium">{rule.meter.replace(/_/g, ' ')}</h5>
																	<p className="text-sm text-muted-foreground">{priceStr}</p>
																</div>
															</div>
															{note && (
																<p className="text-xs text-muted-foreground mt-1">{note}</p>
															)}
														</div>
													);
												})}
										</div>
									</div>
								);
							})}
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}
