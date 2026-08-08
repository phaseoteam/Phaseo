"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { DialogClose, DialogHeader } from "@/components/ui/dialog";
import { Logo } from "@/components/Logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type RestrictedModel = {
	id: string;
	name: string;
	logoId: string | null;
	organisationName: string;
};
export type LocationPreview = {
	countryCode: string;
	restrictedModels: RestrictedModel[];
	regionRestrictedModels: RestrictedModel[];
};

type PurchaseLocationStepProps = {
	countryCode: string;
	countryName: string;
	error: string | null;
	isAcknowledged: boolean;
	isReviewing: boolean;
	onAcknowledgedChange: (value: boolean) => void;
	onContinue: () => void;
	onCountryChange: (value: string) => void;
	onReview: () => void;
	preview: LocationPreview | null;
};

type ModelGroup = {
	key: string;
	logoId: string | null;
	name: string;
	models: RestrictedModel[];
};

function groupModelsByOrganisation(models: RestrictedModel[]): ModelGroup[] {
	const groups = new Map<string, ModelGroup>();
	for (const model of models) {
		const name = model.organisationName?.trim() || model.logoId || "Other";
		const key = model.logoId || name.toLowerCase();
		const group = groups.get(key) ?? { key, logoId: model.logoId, name, models: [] };
		group.models.push(model);
		groups.set(key, group);
	}
	return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function ModelList({ models, tone }: { models: RestrictedModel[]; tone: "warning" | "neutral" }) {
	const groups = groupModelsByOrganisation(models);

	return (
		<ScrollArea
			className={`mt-2.5 rounded-md border bg-background/65 ${tone === "warning" ? "h-44" : "h-36"}`}
			viewportClassName="pr-2"
		>
			<div className="divide-y" aria-label="Affected models">
				{groups.map((group) => (
					<section key={group.key} className="px-3 py-2.5" aria-label={group.name}>
						<div className="flex items-center gap-2">
							<div className="relative size-6 shrink-0 rounded border bg-background shadow-sm">
							<Logo
								id={group.logoId ?? group.key}
								alt=""
								variant="color"
								fill
								sizes="24px"
								className="object-contain p-1"
							/>
							</div>
							<div className="min-w-0 flex-1 truncate text-xs font-semibold">{group.name}</div>
							<div className="text-[11px] tabular-nums text-muted-foreground">{group.models.length}</div>
						</div>
						<ul className="mt-1 ml-8 space-y-0.5">
							{group.models.map((model) => (
								<li
									key={model.id}
									className={tone === "warning"
										? "truncate py-0.5 text-xs text-amber-950/80 dark:text-amber-100/80"
										: "truncate py-0.5 text-xs text-muted-foreground"}
								>
									{model.name}
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</ScrollArea>
	);
}

export function PurchaseLocationStep({
	countryCode,
	countryName,
	error,
	isAcknowledged,
	isReviewing,
	onAcknowledgedChange,
	onContinue,
	onCountryChange,
	onReview,
	preview,
}: PurchaseLocationStepProps) {
	const [acknowledgementAttempts, setAcknowledgementAttempts] = useState(0);
	const acknowledgementRef = useRef<HTMLDivElement>(null);
	const shouldReduceMotion = useReducedMotion();
	const showAcknowledgementError = acknowledgementAttempts > 0 && !isAcknowledged;

	function handleContinue() {
		if (!isAcknowledged) {
			setAcknowledgementAttempts((attempts) => attempts + 1);
			if (!shouldReduceMotion) {
				const element = acknowledgementRef.current;
				element?.getAnimations().forEach((animation) => animation.cancel());
				element?.animate(
					[
						{ transform: "translateX(0)", easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
						{ transform: "translateX(-16px)", easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
						{ transform: "translateX(14px)", easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
						{ transform: "translateX(-11px)", easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
						{ transform: "translateX(8px)", easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
						{ transform: "translateX(-4px)", easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
						{ transform: "translateX(0)" },
					],
					{ duration: 520 },
				);
			}
			return;
		}
		onContinue();
	}

	return (
		<>
			<div className="px-6 pt-6">
				<DialogHeader className="space-y-1">
					<h2 aria-hidden="true" className="font-heading text-xl leading-none font-medium">Confirm your location</h2>
					<p aria-hidden="true" className="text-sm text-muted-foreground">
						Provider rules mean some models are unavailable in certain countries or regions. Review what applies before purchasing credits.
					</p>
				</DialogHeader>
			</div>
			<div className="space-y-3.5 px-6 pb-4">
				<div className="space-y-2">
					<label htmlFor="purchase-country" className="text-sm font-medium">Country or region</label>
					<CountryCombobox
						id="purchase-country"
						value={countryCode}
						onValueChange={onCountryChange}
						disabled={isReviewing}
					/>
					<p className="text-xs leading-5 text-muted-foreground">
						Choose where you live. New-card checkout will separately collect your billing address. Model access is enforced from each API request&apos;s network location.
					</p>
				</div>

				{preview ? (
					<div className="space-y-2.5" aria-live="polite">
						{preview.restrictedModels.length === 0 && preview.regionRestrictedModels.length === 0 ? (
							<div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
								<CheckCircle2 className="mt-0.5 size-4 shrink-0" />
								<span>No current model restrictions were found for {countryName}.</span>
							</div>
						) : null}
						{preview.restrictedModels.length > 0 ? (
							<section className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-950/25">
								<div className="flex gap-2 text-sm font-medium text-amber-950 dark:text-amber-100">
									<AlertTriangle className="mt-0.5 size-4 shrink-0" />
									<span>{preview.restrictedModels.length} {preview.restrictedModels.length === 1 ? "model is" : "models are"} unavailable in {countryName}</span>
								</div>
								<ModelList models={preview.restrictedModels} tone="warning" />
							</section>
						) : null}
						{preview.regionRestrictedModels.length > 0 ? (
							<section className="rounded-lg border bg-muted/40 p-2.5 text-sm">
								<div className="font-medium">Restricted in parts of {countryName}</div>
								<p className="mt-1 text-xs leading-5 text-muted-foreground">These models remain available nationally, but every current route has provider restrictions in particular subdivisions.</p>
								<ModelList models={preview.regionRestrictedModels} tone="neutral" />
							</section>
						) : null}
						<p className="text-xs leading-5 text-muted-foreground">Availability can change when upstream provider policies change. Credits are shared across the models that remain available to your workspace.</p>
						<div ref={acknowledgementRef}>
							<label className={cn(
								"flex cursor-pointer items-start gap-2.5 rounded-lg border bg-muted/35 p-2.5 text-sm leading-5 transition-colors",
								showAcknowledgementError && "border-destructive/60 bg-destructive/8",
							)}>
								<Checkbox
									checked={isAcknowledged}
									onCheckedChange={(checked) => onAcknowledgedChange(checked === true)}
									aria-label="Acknowledge model availability restrictions"
									className="mt-0.5"
								/>
								<span>I have reviewed this information and understand that model access depends on my location.</span>
							</label>
						</div>
					</div>
				) : null}

				{error ? <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}
			</div>
			<div className="border-t bg-background/95 px-6 py-3 backdrop-blur supports-backdrop-filter:bg-background/90">
				<div className="flex justify-end gap-2">
					<DialogClose asChild><Button className="rounded-md" variant="secondary">Cancel</Button></DialogClose>
					{preview ? (
						<Button
							className={cn(
								"rounded-md",
								!isAcknowledged && "cursor-not-allowed opacity-50 hover:bg-primary",
							)}
							aria-disabled={!isAcknowledged}
							onClick={handleContinue}
						>
							Continue to top-up
						</Button>
					) : (
						<Button className="rounded-md" onClick={onReview} disabled={!countryCode || isReviewing}>
							{isReviewing ? <><Spinner className="mr-2 size-4" />Reviewing...</> : "Review availability"}
						</Button>
					)}
				</div>
			</div>
		</>
	);
}
