import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
import type { PricingMeter } from "@/components/(data)/model/pricing/pricingHelpers";
import { useTranslations } from "next-intl";
import {
	Activity,
	AudioLines,
	CircleDollarSign,
	DatabaseZap,
	Gauge,
	Hash,
	Image as ImageIcon,
	MessageSquareText,
	MousePointerClick,
	Video,
} from "lucide-react";

export type ComparisonPricingModel = {
	key: string;
	label: string;
	modelId?: string;
	provider: string;
	pricingPlan: string;
	meters: PricingMeter[];
	allMeters?: PricingMeter[];
};

export function formatSentenceLabel(value: string): string {
	const normalized = value.trim();
	return normalized
		? normalized[0].toUpperCase() + normalized.slice(1).toLowerCase()
		: "";
}

export function formatProviderLabel(providerId: string): string {
	const known: Record<string, string> = {
		openai: "OpenAI",
		anthropic: "Anthropic",
		google: "Google",
		"google-ai-studio": "Google AI Studio",
		"google-vertex": "Google Vertex",
		"x-ai": "xAI",
		aws: "AWS",
		azure: "Azure",
	};
	return known[providerId] ?? providerId
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function modelOrganisationId(model: ComparisonPricingModel) {
	return model.modelId?.split("/")[0] || model.provider;
}

function modelHref(model: ComparisonPricingModel) {
	if (!model.modelId) return null;
	return getModelDetailsHref(modelOrganisationId(model), model.modelId);
}

export function PricingModelHeader({ model }: { model: ComparisonPricingModel }) {
	const t = useTranslations("Product.tools.pricing");
	const href = modelHref(model);
	const tier = getTierFilterMeta(model.pricingPlan);
	const TierIcon = tier.icon;
	const normalizedPlan = model.pricingPlan.replace(/[-_]+/g, " ").trim().toLowerCase();
	const planLabel = normalizedPlan === "standard"
		? t("standardPlan")
		: normalizedPlan
			? normalizedPlan[0].toUpperCase() + normalizedPlan.slice(1)
			: t("standardPlan");
	const label = <span className="truncate text-sm font-semibold">{model.label}</span>;
	return (
		<div className="min-w-[210px] py-1">
			<div className="flex min-w-0 items-center gap-2">
				<Logo
					id={modelOrganisationId(model)}
					width={16}
					height={16}
					className="size-4 shrink-0 rounded-sm"
					fallback={<div className="size-4 rounded-sm bg-muted" />}
				/>
				{href ? <Link href={href} className="min-w-0 hover:underline">{label}</Link> : label}
			</div>
			<div className="mt-1.5 flex min-w-0 items-center gap-2">
					<Logo
						id={model.provider}
						width={16}
						height={16}
						className="size-4 shrink-0 rounded-sm"
						fallback={<div className="size-4 rounded-sm bg-muted" />}
					/>
					<span className="truncate text-xs font-normal text-muted-foreground">
						{formatProviderLabel(model.provider)}
					</span>
					<Badge variant="outline" className="h-5 shrink-0 gap-1 rounded-md px-1.5 text-[9px] font-medium">
						<TierIcon className={`size-3 ${tier.iconClassName}`} />
						{planLabel}
					</Badge>
			</div>
		</div>
	);
}

function MeterGlyph({ meterName, className = "size-4" }: { meterName: string; className?: string }) {
	const normalized = meterName.toLowerCase();
	if (normalized.includes("cache")) return <DatabaseZap className={className} />;
	if (normalized.includes("image")) return <ImageIcon className={className} />;
	if (normalized.includes("audio") || normalized.includes("speech")) return <AudioLines className={className} />;
	if (normalized.includes("video")) return <Video className={className} />;
	if (normalized.includes("request")) return <MousePointerClick className={className} />;
	if (normalized.includes("message") || normalized.includes("text")) return <MessageSquareText className={className} />;
	if (normalized.includes("token")) return <Hash className={className} />;
	if (normalized.includes("cost") || normalized.includes("price")) return <CircleDollarSign className={className} />;
	if (normalized.includes("total")) return <Activity className={className} />;
	return <Gauge className={className} />;
}

export function MeterLabel({
	meterName,
	label,
	description,
}: {
	meterName: string;
	label: string;
	description?: string;
}) {
	return (
		<div className="flex min-w-[190px] items-center gap-2.5">
			<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
				<MeterGlyph meterName={meterName} />
			</span>
			<span className="min-w-0">
				<span className="block text-sm font-medium">{label}</span>
				{description ? <span className="block text-xs font-normal text-muted-foreground">{description}</span> : null}
			</span>
		</div>
	);
}
