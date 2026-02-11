// src/runtime/types.ts
// Purpose: Runtime binding type definitions for the Worker environment.
// Why: Makes env access explicit and type-safe across the codebase.
// How: Declares binding shapes used by runtime/env for type-safe access.

import type { GatewayBindings } from "@/runtime/env";

export type AuthContext = {
	teamId?: string;
	userId?: string;
	apiKeyId?: string;
	apiKeyRef?: string | null;
	apiKeyKid?: string | null;
	internal?: boolean;
	[key: string]: unknown;
};

export type HonoBindings = GatewayBindings;

export type Env = {
	Bindings: HonoBindings;
	Variables: {
		ctx?: AuthContext;
	};
};










