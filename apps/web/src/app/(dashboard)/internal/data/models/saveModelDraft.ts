import { updateModel, type ModelUpdatePayload } from "@/app/(dashboard)/models/actions";

export async function saveModelDraft(payload: ModelUpdatePayload) {
	const result = await updateModel(payload);
	if (!result.ok) throw new Error(result.error || "Failed to save model changes.");
}
