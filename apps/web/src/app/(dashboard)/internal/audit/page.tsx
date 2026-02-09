import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getAuditModels } from "@/lib/fetchers/models/table-view/getAuditModels";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";
import { AuditFiltersWrapper } from "@/components/monitor/AuditFiltersWrapper";
import { CreateModelDialog } from "@/components/monitor/CreateModelDialog";

export const metadata = {
	title: "Models Audit - Internal",
	description: "Comprehensive audit view of all models with provider and benchmark information",
};

export default async function ModelsAuditPage() {
	// Admin authentication check
	const supabase = await createClient();

	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();

	if (authError || !user) {
		redirect("/sign-in");
	}

	const { data: userData, error: userError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.single();

	if (userError || userData?.role !== "admin") {
		redirect("/");
	}

	// Fetch audit data
	const includeHidden = await resolveIncludeHidden(undefined, {
		allowAdminOverride: true,
	});
	const auditModels = await getAuditModels(includeHidden);

	return (
		<div className="mx-4 sm:mx-8 py-4 sm:py-8">
			<div className="mb-6 sm:mb-8">
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
					<h1 className="text-2xl sm:text-3xl font-bold">Models Audit</h1>
					<CreateModelDialog />
				</div>
				<p className="text-sm sm:text-base text-muted-foreground">
					Comprehensive view of all models with provider support, benchmark data, and pricing information
				</p>
			</div>

			<Suspense
				fallback={
					<div className="flex items-center justify-center py-8">
						Loading audit data...
					</div>
				}
			>
				<AuditFiltersWrapper data={auditModels} />
			</Suspense>
		</div>
	);
}
