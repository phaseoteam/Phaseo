export type ComposerConversationState = {
	activeThreadId: string | null;
	temporaryReturnThreadId: string | null;
	temporaryMode: boolean;
};

export function shouldResetComposerForConversationChange(
	previous: ComposerConversationState | null,
	current: ComposerConversationState,
): boolean {
	if (!previous) return true;
	if (!previous.temporaryMode && current.temporaryMode) return false;
	if (previous.temporaryMode && !current.temporaryMode) {
		return current.activeThreadId !== previous.temporaryReturnThreadId;
	}
	return previous.activeThreadId !== current.activeThreadId;
}
