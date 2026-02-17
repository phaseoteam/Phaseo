// Purpose: Provider-doc compatibility checks for request parameters.
// Why: Keep provider compatibility advisory, not a hard pre-routing gate.
// How: Do not filter providers at preflight; allow executor-level adaptation/retry.

import type { Endpoint } from "@core/types";
import type { ProviderCandidate } from "./types";

type ValidationResult =
	| { ok: true; providers: ProviderCandidate[]; body: any }
	| { ok: false; response: Response };

export function validateProviderDocsCompliance(args: {
	endpoint: Endpoint;
	body: any;
	requestId: string;
	teamId: string;
	model: string;
	providers: ProviderCandidate[];
	requestedParams: string[];
}): ValidationResult {
	void args.endpoint;
	void args.requestId;
	void args.teamId;
	void args.model;
	void args.requestedParams;
	return { ok: true, providers: args.providers, body: args.body };
}
