import Link from "next/link";
import { redirect } from "next/navigation";
import { AuditFiltersWrapper } from "@/components/monitor/AuditFiltersWrapper";
import { getAuditModels } from "@/lib/fetchers/models/table-view/getAuditModels";
import { createClient } from "@/utils/supabase/server";

export const metadata = {
	title: "Data Audit - Internal",
};

export default async function ModelsAuditPage() {
	const supabase = await createClient();

	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();

	if (authError || !user) {
		redirect("/sign-in");
	}

	const { data: userRow, error: userError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.maybeSingle();

	if (userError || (userRow?.role ?? "").toLowerCase() !== "admin") {
		redirect("/internal");
	}

	const data = await getAuditModels(true);

	return (
		<div className="mx-8 py-8 space-y-6">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Internal Data Audit</h1>
					<p className="text-sm text-muted-foreground">
						Audit models, providers, benchmark coverage, and pricing completeness in one place.
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row">
					<Link
						href="/internal/audit/providers"
						className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
					>
						Audit by Provider
					</Link>
					<Link
						href="/internal/data"
						className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
					>
						Open Data Editor
					</Link>
					<Link
						href="/internal/data/models/new"
						className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
					>
						New Model
					</Link>
				</div>
			</div>
			<AuditFiltersWrapper data={data} />
		</div>
	);
}
