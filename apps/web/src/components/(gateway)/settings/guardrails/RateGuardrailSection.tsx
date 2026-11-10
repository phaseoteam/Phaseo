import { useTranslations } from "@/i18n/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import type { RateCounting } from "@/features/settings/guardrails/actions";
import { parseRateLimit, type GuardrailWizardForm } from "./guardrailWizard";

type RateFields = Pick<GuardrailWizardForm, "rateRequestsPerMinute" | "rateTokensPerMinute" | "rateConcurrentRequests" | "rateFailClosed" | "rateCounting">;
type LimitField = "rateRequestsPerMinute" | "rateTokensPerMinute" | "rateConcurrentRequests";

const LIMITS: Array<{ field: LimitField; copy: string }> = [
	{ field: "rateRequestsPerMinute", copy: "requests" },
	{ field: "rateTokensPerMinute", copy: "tokens" },
	{ field: "rateConcurrentRequests", copy: "concurrent" },
];

const COUNTINGS: RateCounting[] = ["shared", "each_key", "each_end_user"];

/**
 * A rate guardrail's settings: the limits (blank for none), how they count, and whether requests are
 * refused when the counters cannot be checked. Counting has no default and must be chosen.
 */
export default function RateGuardrailSection(props: {
	value: RateFields;
	onChange: (patch: Partial<RateFields>) => void;
	/** Set when the guardrail was made through the rate limits API, which has no counting field. */
	legacyCounting?: boolean;
}) {
	const t = useTranslations("SettingsUI.rateGuardrail");
	const tx = (key: string, values?: Record<string, unknown>) => t(key as never, values as never);
	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<div>
					<h3 className="text-sm font-semibold">{t("limitsTitle")}</h3>
					<p className="mt-1 text-sm text-muted-foreground">{t("limitsBody")}</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-3">
					{LIMITS.map(({ field, copy }) => {
						const invalid = parseRateLimit(props.value[field], field) === "invalid";
						const id = `rate-guardrail-${copy}`;
						return (
							<div key={field} className="space-y-2">
								<Label htmlFor={id}>{tx(`${copy}.label`)}</Label>
								<Input
									id={id}
									inputMode="numeric"
									value={props.value[field]}
									placeholder={t("noLimit")}
									aria-invalid={invalid || undefined}
									aria-describedby={`${id}-help`}
									onChange={(event) => props.onChange({ [field]: event.target.value } as Partial<RateFields>)}
								/>
								<p id={`${id}-help`} className={invalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
									{invalid ? t("invalidLimit") : tx(`${copy}.help`)}
								</p>
							</div>
						);
					})}
				</div>
			</section>

			<section className="space-y-4">
				<div>
					<h3 className="text-sm font-semibold">
						{t("countingTitle")} <span className="text-destructive">*</span>
					</h3>
					<p className="mt-1 text-sm text-muted-foreground">{t("countingBody")}</p>
				</div>
				{props.legacyCounting && !props.value.rateCounting ? (
					<p className="text-sm text-muted-foreground">{t("legacyCounting")}</p>
				) : null}
				<RadioGroup
					value={props.value.rateCounting ?? ""}
					onValueChange={(value) => props.onChange({ rateCounting: value as RateCounting })}
					aria-label={t("countingTitle")}
					className="divide-y rounded-md border"
				>
					{COUNTINGS.map((counting) => (
						<label key={counting} htmlFor={`rate-counting-${counting}`} className="flex cursor-pointer items-start gap-3 p-4 hover:bg-muted/20">
							<RadioGroupItem id={`rate-counting-${counting}`} value={counting} className="mt-0.5" />
							<span className="min-w-0">
								<span className="block text-sm font-medium">{tx(`counting.${counting}.name`)}</span>
								<span className="mt-1 block text-sm text-muted-foreground">{tx(`counting.${counting}.body`)}</span>
							</span>
						</label>
					))}
				</RadioGroup>
			</section>

			<section className="flex items-start justify-between gap-4 rounded-md border p-4">
				<div className="min-w-0">
					<Label htmlFor="rate-guardrail-fail-closed" className="text-sm font-medium">{t("failClosedTitle")}</Label>
					<p className="mt-1 text-sm text-muted-foreground">{t("failClosedBody")}</p>
				</div>
				<Switch
					id="rate-guardrail-fail-closed"
					checked={props.value.rateFailClosed}
					onCheckedChange={(checked) => props.onChange({ rateFailClosed: checked })}
				/>
			</section>
		</div>
	);
}
