import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createAPIProviderAction } from "../../actions";
import {
	PROVIDER_PROMPT_TRAINING_POLICY_VALUES,
} from "@/lib/providers/promptTrainingPolicy";

export default async function NewAPIProviderPage() {
	const t = await getTranslations("Product.internalTools.dataEditor");
	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">{t("providerCreateTitle")}</h1>
			</div>
			<form action={createAPIProviderAction} className="space-y-4 rounded-lg border p-4">
				<div className="grid gap-4 lg:grid-cols-2">
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("providerId")}</div>
						<input name="api_provider_id" required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("providerName")}</div>
						<input name="api_provider_name" required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">{t("description")}</div>
						<textarea name="description" className="w-full rounded-md border px-3 py-2 text-sm min-h-24" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("websiteLink")}</div>
						<input name="link" type="url" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("countryCode")}</div>
						<input name="country_code" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("dataCenters")}</div>
						<input name="default_execution_regions" placeholder="US, EU, APAC" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="flex items-center gap-2 self-end pb-2 text-sm">
						<input name="byok_available" type="checkbox" className="size-4 rounded border" />
						<span>{t("byokAvailable")}</span>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("promptTrainingPolicy")}</div>
						<select
							name="prompt_training_policy"
							defaultValue="unknown"
							className="w-full rounded-md border px-3 py-2 text-sm"
						>
							{PROVIDER_PROMPT_TRAINING_POLICY_VALUES.map((value) => (
								<option key={value} value={value}>
									{t(`policy${value.replace(/(^|_)([a-z])/g, (_, __, letter: string) => letter.toUpperCase())}` as never)}
								</option>
							))}
						</select>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("policySourceUrl")}</div>
						<input
							name="prompt_training_source_url"
							type="url"
							placeholder="https://..."
							className="w-full rounded-md border px-3 py-2 text-sm"
						/>
					</label>
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">{t("policyNotes")}</div>
						<textarea
							name="prompt_training_notes"
							className="w-full rounded-md border px-3 py-2 text-sm min-h-20"
						/>
					</label>
				</div>
				<div className="flex gap-2">
					<button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
						{t("actionCreate")}
					</button>
					<Link href="/internal/data/api-providers" className="rounded-md border px-3 py-2 text-sm">
						{t("actionCancel")}
					</Link>
				</div>
			</form>
		</div>
	);
}
