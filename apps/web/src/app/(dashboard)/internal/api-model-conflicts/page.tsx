import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import { buildApiModelConflictsSnapshot } from "@/lib/internal/apiModelConflicts";
import ApiModelConflictsClient from "./ApiModelConflictsClient";

export const metadata = {
	title: "API Model Conflicts - Internal",
	description:
		"Inspect provider API model IDs, detect likely alias conflicts, and find pricing mismatches between model IDs and pricing directories.",
};

export default async function ApiModelConflictsPage() {
	await requireInternalAdmin("/internal");

	const snapshot = buildApiModelConflictsSnapshot();
	return <ApiModelConflictsClient snapshot={snapshot} />;
}
