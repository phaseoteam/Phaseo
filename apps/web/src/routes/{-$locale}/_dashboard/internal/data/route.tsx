import { createFileRoute } from "@tanstack/react-router";
import DataLayout from "@/features/internal/data/DataLayout";
import { requireInternalAdminFn } from "@/features/internal/internalAdmin.functions";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data")({
	// Internal admins only (requireInternalAdmin("/internal")), checked before anything renders.
	beforeLoad: async () => {
		await requireInternalAdminFn({ data: "/internal" });
	},
	component: DataLayout,
});
