import { updateModel, type ModelUpdatePayload } from "@/app/(dashboard)/models/actions";
import { revalidateSingleModelAllAction } from "@/app/(dashboard)/internal/data/actions";

export async function saveModelDraft(payload: ModelUpdatePayload) {
	const result = await updateModel(payload);
	if (!result.ok) throw new Error(result.error || "Failed to save model changes.");
	try {
		await revalidateSingleModelAllAction(payload.modelId);
	} catch (error) {
		throw new Error("Model changes were saved, but the public cache refresh failed. Retry from Cache controls.", { cause: error });
	}
}
