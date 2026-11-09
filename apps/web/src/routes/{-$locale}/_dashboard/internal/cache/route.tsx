import { createFileRoute } from "@tanstack/react-router";
import { requireInternalAdminFn } from "@/features/internal/internalAdmin.functions";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/cache")({
	// Internal admins only (requireInternalAdmin("/internal")), checked before anything renders.
	beforeLoad: async () => {
		await requireInternalAdminFn({ data: "/internal" });
	},
});
