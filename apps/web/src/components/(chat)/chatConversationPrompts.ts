export function shouldShowEvaluationPrompts(
	messageCount: number,
	hasSubmittedMessage: boolean,
) {
	return messageCount === 0 && !hasSubmittedMessage;
}
