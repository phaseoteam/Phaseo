/** Signed-in accounts with a loaded workspace but no onboarding access go back to /settings/credits. */
export function shouldRedirectFromOnboarding(initialData: { signedIn: boolean; workspaceId: string | null; team: unknown; canAccessOnboarding: boolean }): boolean {
	return initialData.signedIn && Boolean(initialData.workspaceId) && Boolean(initialData.team) && !initialData.canAccessOnboarding;
}
