import type { AuthMethod } from "@/lib/auth/method";

export type TeamSsoEnforcementContext = {
	teamId: string;
	userId: string;
	authMethod: AuthMethod;
	source: "auth_callback" | "server_action";
};

export type TeamSsoEnforcementResult = {
	allowed: boolean;
	enforced: boolean;
	reason: "scaffold_not_enforced";
};

export async function evaluateTeamSsoEnforcementNoop(
	_context: TeamSsoEnforcementContext,
): Promise<TeamSsoEnforcementResult> {
	// Scaffold only: this hook is intentionally non-blocking until enforcement rollout.
	return {
		allowed: true,
		enforced: false,
		reason: "scaffold_not_enforced",
	};
}
