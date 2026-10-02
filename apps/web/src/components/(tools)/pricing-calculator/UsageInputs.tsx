"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Clock3,
	DatabaseZap,
	Hash,
	Image as ImageIcon,
	Layers3,
	MessageSquareText,
	MousePointerClick,
	Music2,
	Video,
} from "lucide-react";
import {
	formatMeterName,
	getMeterInputConfig,
	parseMeter,
	type PricingMeter,
} from "@/components/(data)/model/pricing/pricingHelpers";
import { sanitizeRequestMultiplier } from "./calculatorState";
import { formatSentenceLabel } from "./PricingTableVisuals";
import { useTranslations } from "next-intl";

interface UsageInputsProps {
	meters: PricingMeter[];
	meterInputs: Record<string, string>;
	requestMultiplier: number;
	pricingTimeUtc: string;
	onMeterInputChange: (meter: string, value: string) => void;
	onRequestMultiplierChange: (value: number) => void;
	onPricingTimeUtcChange: (value: string) => void;
}

function MeterInputIcon({ meterName }: { meterName: string }) {
	const name = meterName.toLowerCase();
	if (name.includes("cached")) return <DatabaseZap className="size-4" />;
	if (name.includes("image")) return <ImageIcon className="size-4" />;
	if (name.includes("video")) return <Video className="size-4" />;
	if (name.includes("music") || name.includes("audio")) return <Music2 className="size-4" />;
	if (name.includes("request")) return <MousePointerClick className="size-4" />;
	if (name.includes("text")) return <MessageSquareText className="size-4" />;
	if (name.includes("token")) return <Hash className="size-4" />;
	return <Layers3 className="size-4" />;
}

export function UsageInputs({
	meters,
	meterInputs,
	requestMultiplier,
	pricingTimeUtc,
	onMeterInputChange,
	onRequestMultiplierChange,
	onPricingTimeUtcChange,
}: UsageInputsProps) {
	const t = useTranslations("Product.tools.pricing");
	const translateMeter = useTranslations("Catalogue.modelDetail.pricing.meters");
	const getMeterLabel = (meter: string) =>
		translateMeter.has(meter as never)
			? translateMeter(meter as never)
			: formatSentenceLabel(formatMeterName(meter));
	const uniqueMeters = useMemo(() => {
		const map = new Map<string, PricingMeter>();
		for (const meter of meters) {
			if (!map.has(meter.meter)) map.set(meter.meter, meter);
		}
		return Array.from(map.values());
	}, [meters]);

	return (
		<Card>
			<CardHeader className="border-b bg-muted/10">
				<CardTitle className="space-y-1">
					<span>{t("usageInputs")}</span>
					<p className="text-xs font-normal text-muted-foreground">
						{t("usageInputsDescription")}
					</p>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4 pt-5">
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{uniqueMeters.map((meter) => {
						const inputConfig = getMeterInputConfig(meter.unit, meter.meter);
						const derivedUnit = parseMeter(meter.meter).unit;
						const unitLabel = derivedUnit !== "unknown" ? derivedUnit : meter.unit;
						return (
							<div key={meter.meter} className="rounded-xl border bg-muted/10 p-3">
								<Label htmlFor={meter.meter} className="mb-2 flex items-center gap-2">
									<span className="flex size-7 items-center justify-center rounded-lg bg-background text-muted-foreground shadow-xs">
										<MeterInputIcon meterName={meter.meter} />
									</span>
									<span className="min-w-0">
										<span className="block truncate text-xs font-medium">{getMeterLabel(meter.meter)}</span>
										<span className="block text-[10px] font-normal text-muted-foreground">{t("perRequest", { unit: unitLabel })}</span>
									</span>
								</Label>
								<Input
									id={meter.meter}
									type={inputConfig.type}
									min="0"
									step={inputConfig.step}
									value={meterInputs[meter.meter] || ""}
									onChange={(event) => onMeterInputChange(meter.meter, event.target.value)}
									placeholder={inputConfig.placeholder ? t("inputExample", { example: inputConfig.placeholder }) : t("inputValuePlaceholder")}
									className="h-10 rounded-lg bg-background"
								/>
							</div>
						);
					})}
				</div>

				<div className="grid gap-3 border-t pt-4 md:grid-cols-2">
					<div className="rounded-xl border bg-muted/10 p-3">
						<Label htmlFor="request-multiplier" className="mb-2 flex items-center gap-2 text-xs">
							<MousePointerClick className="size-4 text-muted-foreground" />
							{t("numberOfRequests")}
						</Label>
						<Input
							id="request-multiplier"
							type="number"
							min="1"
							step="1"
							value={requestMultiplier}
							onChange={(event) => onRequestMultiplierChange(sanitizeRequestMultiplier(Number(event.target.value)))}
							className="h-10 rounded-lg bg-background"
						/>
						<p className="mt-2 text-[11px] text-muted-foreground">{t("requestMultiplierDescription")}</p>
					</div>

					<div className="rounded-xl border bg-muted/10 p-3">
						<Label htmlFor="pricing-time-utc" className="mb-2 flex items-center gap-2 text-xs">
							<Clock3 className="size-4 text-muted-foreground" />
							{t("pricingTimeUtc")}
						</Label>
						<div className="flex gap-2">
							<Input
								id="pricing-time-utc"
								type="time"
								step="60"
								value={pricingTimeUtc}
								onChange={(event) => onPricingTimeUtcChange(event.target.value)}
								className="h-10 rounded-lg bg-background"
							/>
							<Button
								type="button"
								variant="outline"
								size="icon"
								className="size-10 rounded-lg bg-background"
								onClick={() => onPricingTimeUtcChange(new Date().toISOString().slice(11, 16))}
								aria-label={t("useCurrentUtcTime")}
							>
								<Clock3 className="size-4" />
							</Button>
						</div>
						<p className="mt-2 text-[11px] text-muted-foreground">{t("timeWindowPricingHelp")}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
