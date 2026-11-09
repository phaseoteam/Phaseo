import { useTranslations } from "@/i18n/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { SpendAction, SpendCounting, SpendPeriod } from "@/features/settings/guardrails/actions";
import { parseSpendLimit, type GuardrailWizardForm } from "./guardrailWizard";

type SpendFields = Pick<GuardrailWizardForm, "spendLimit" | "spendPeriod" | "spendAction" | "spendCounting">;

const CHOICES = {
	spendPeriod: ["daily", "weekly", "monthly"] as SpendPeriod[],
	spendAction: ["notify", "block"] as SpendAction[],
	spendCounting: ["shared", "each_key"] as SpendCounting[],
} as const;
const COPY: Record<keyof typeof CHOICES, string> = { spendPeriod: "period", spendAction: "action", spendCounting: "counting" };

/**
 * A spend guardrail's settings: a dollar limit, the UTC period it counts over, what happens at the
 * limit and how it counts. None has a default: each must be chosen.
 */
export default function SpendGuardrailSection(props: {
	value: SpendFields;
	onChange: (patch: Partial<SpendFields>) => void;
}) {
	const t = useTranslations("SettingsUI.spendGuardrail");
	const tx = (key: string, values?: Record<string, unknown>) => t(key as never, values as never);
	const invalid = parseSpendLimit(props.value.spendLimit) === "invalid";
	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<div>
					<h3 className="text-sm font-semibold">
						{t("limitTitle")} <span className="text-destructive">*</span>
					</h3>
					<p className="mt-1 text-sm text-muted-foreground">{t("limitBody")}</p>
				</div>
				<div className="max-w-xs space-y-2">
					<Label htmlFor="spend-guardrail-limit">{t("limitLabel")}</Label>
					<div className="relative">
						<span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
						<Input
							id="spend-guardrail-limit"
							inputMode="decimal"
							className="pl-7"
							value={props.value.spendLimit}
							placeholder="25.00"
							aria-invalid={invalid || undefined}
							aria-describedby="spend-guardrail-limit-help"
							onChange={(event) => props.onChange({ spendLimit: event.target.value })}
						/>
					</div>
					<p id="spend-guardrail-limit-help" className={invalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
						{invalid ? t("invalidLimit") : t("limitHelp")}
					</p>
				</div>
			</section>

			{(Object.keys(CHOICES) as Array<keyof typeof CHOICES>).map((field) => (
				<section key={field} className="space-y-4">
					<div>
						<h3 className="text-sm font-semibold">
							{tx(`${COPY[field]}Title`)} <span className="text-destructive">*</span>
						</h3>
						<p className="mt-1 text-sm text-muted-foreground">{tx(`${COPY[field]}Body`)}</p>
					</div>
					<RadioGroup
						value={props.value[field] ?? ""}
						onValueChange={(value) => props.onChange({ [field]: value } as Partial<SpendFields>)}
						aria-label={tx(`${COPY[field]}Title`)}
						className="divide-y rounded-md border"
					>
						{CHOICES[field].map((choice) => (
							<label key={choice} htmlFor={`spend-${COPY[field]}-${choice}`} className="flex cursor-pointer items-start gap-3 p-4 hover:bg-muted/20">
								<RadioGroupItem id={`spend-${COPY[field]}-${choice}`} value={choice} className="mt-0.5" />
								<span className="min-w-0">
									<span className="block text-sm font-medium">{tx(`${COPY[field]}.${choice}.name`)}</span>
									<span className="mt-1 block text-sm text-muted-foreground">{tx(`${COPY[field]}.${choice}.body`)}</span>
								</span>
							</label>
						))}
					</RadioGroup>
				</section>
			))}
		</div>
	);
}
