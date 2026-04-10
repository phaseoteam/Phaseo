import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createModelAction } from "../../actions";
import NewModelForm from "./NewModelForm";

export default async function NewModelPage() {
	const supabase = await createClient();
	const [
		{ data: organisations },
		{ data: providers },
		{ data: families },
		{ data: benchmarks },
		{ data: previousModels },
		{ data: subscriptionPlans },
	] = await Promise.all([
		supabase
			.from("data_organisations")
			.select("organisation_id, name")
			.order("name", { ascending: true }),
		supabase
			.from("data_api_providers")
			.select("api_provider_id, api_provider_name")
			.order("api_provider_name", { ascending: true }),
		supabase
			.from("data_model_families")
			.select("family_id, family_name")
			.order("family_name", { ascending: true }),
		supabase
			.from("data_benchmarks")
			.select("id, name")
			.order("name", { ascending: true }),
		supabase
			.from("data_models")
			.select("model_id, name")
			.order("name", { ascending: true })
			.limit(500),
		supabase
			.from("data_subscription_plans")
			.select("plan_uuid, plan_id, name, frequency, price, currency")
			.order("name", { ascending: true })
			.order("frequency", { ascending: true })
			.limit(1200),
	]);

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">Create model</h1>
			</div>
			<NewModelForm
				organisations={(organisations ?? []) as Array<{ organisation_id: string; name: string | null }>}
				providers={(providers ?? []) as Array<{ api_provider_id: string; api_provider_name: string | null }>}
				families={(families ?? []) as Array<{ family_id: string; family_name: string | null }>}
				benchmarks={(benchmarks ?? []) as Array<{ id: string; name: string | null }>}
				previousModels={(previousModels ?? []) as Array<{ model_id: string; name: string | null }>}
				subscriptionPlans={(subscriptionPlans ?? []) as Array<{
					plan_uuid: string;
					plan_id: string | null;
					name: string | null;
					frequency: string | null;
					price: number | null;
					currency: string | null;
				}>}
				createAction={createModelAction}
			/>
			<div className="flex">
				<Link href="/internal/data/models" className="rounded-md border px-3 py-2 text-sm">
					Back to models
				</Link>
			</div>
		</div>
	);
}
