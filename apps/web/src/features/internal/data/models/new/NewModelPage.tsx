import Link from "@/components/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { createModelAction } from "../../actions";
import { adminModelFormOptionsQuery } from "../../catalog.functions";
import NewModelForm from "./NewModelForm";

export default function NewModelPage() {
	const t = useTranslations("Product.internalTools.dataEditor");
	const { data: { organisations, providers, families, benchmarks, previousModels, subscriptionPlans } } = useSuspenseQuery(adminModelFormOptionsQuery());

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">{t("modelCreateTitle")}</h1>
			</div>
			<NewModelForm
				organisations={organisations as Array<{ organisation_id: string; name: string | null }>}
				providers={providers as Array<{ api_provider_id: string; api_provider_name: string | null }>}
				families={families as Array<{ family_id: string; family_name: string | null }>}
				benchmarks={benchmarks as Array<{ id: string; name: string | null }>}
				previousModels={previousModels as Array<{ model_id: string; name: string | null }>}
				subscriptionPlans={subscriptionPlans as Array<{
					plan_uuid: string;
					plan_id: string | null;
					name: string | null;
					frequency: string | null;
					price: number | null;
					currency: string | null;
				}>}
				createAction={async (formData) => { await createModelAction({ data: formData }); }}
			/>
			<div className="flex">
				<Link href="/internal/data/models" className="rounded-md border px-3 py-2 text-sm">
					{t("backToModels")}
				</Link>
			</div>
		</div>
	);
}
