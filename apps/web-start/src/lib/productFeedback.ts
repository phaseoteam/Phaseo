import { isAnalyticsCaptureAllowed } from "@/lib/clientErrorReporting";

export const PRODUCT_FEEDBACK_EVENT = "phaseo:product-feedback";
export const PRODUCT_FEEDBACK_SURVEY_ID = "019feb07-e87f-0000-fb18-153c4ed8cdbe";
export const PRODUCT_FEEDBACK_CATEGORY_QUESTION_ID = "b5eddb1d-b98d-4fc6-8e71-8ee04bcb7700";
export const PRODUCT_FEEDBACK_MESSAGE_QUESTION_ID = "6d6219b6-04d8-4ba3-bdab-0ca78af8f53a";

export type ProductFeedbackCategory = "issue" | "idea" | "other";
export type ProductFeedbackReason =
	| "usability"
	| "missing_capability"
	| "incorrect_data"
	| "reliability"
	| "performance"
	| "documentation"
	| "other";

export type ProductFeedbackPayload = {
	action: "shown" | "dismissed" | "sent";
	surface: string;
	category?: ProductFeedbackCategory;
	reason?: ProductFeedbackReason;
	message?: string;
	path: string;
	context?: Record<string, string | number | boolean | null>;
};

function dispatchProductFeedback(
	input: Omit<ProductFeedbackPayload, "path">,
) {
	if (typeof window === "undefined" || !isAnalyticsCaptureAllowed()) return false;

	window.dispatchEvent(
		new CustomEvent<ProductFeedbackPayload>(PRODUCT_FEEDBACK_EVENT, {
			detail: {
				...input,
				path: `${window.location.pathname}${window.location.search}`,
			},
		}),
	);
	return true;
}

export function captureProductFeedback(
	input: Omit<ProductFeedbackPayload, "action" | "path"> & {
		category: ProductFeedbackCategory;
		reason: ProductFeedbackReason;
		message: string;
	},
): boolean {
	const message = input.message.trim().slice(0, 4_000);
	if (!message) return false;
	return dispatchProductFeedback({ ...input, action: "sent", message });
}

export function captureProductFeedbackShown(
	input: Omit<ProductFeedbackPayload, "action" | "path" | "category" | "message">,
) {
	return dispatchProductFeedback({ ...input, action: "shown" });
}

export function captureProductFeedbackDismissed(
	input: Omit<ProductFeedbackPayload, "action" | "path" | "category" | "message">,
) {
	return dispatchProductFeedback({ ...input, action: "dismissed" });
}
