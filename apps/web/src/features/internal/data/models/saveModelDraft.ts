import { updateModel, type ModelUpdatePayload } from "@/features/models/actions";
import { revalidateSingleModelAllAction } from "@/features/internal/data/actions";

export async function saveModelDraft(payload: ModelUpdatePayload) {
	const result = await updateModel({ data: payload });
	if (!result.ok) throw new Error(result.error || "Failed to save model changes.");
	try {
		await revalidateSingleModelAllAction({ data: payload.modelId });
	} catch (error) {
		throw new Error("Model changes were saved, but the public cache refresh failed. Retry from Cache controls.", { cause: error });
	}
}
