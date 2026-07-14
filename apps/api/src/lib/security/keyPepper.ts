import type { GatewayBindings } from "@/runtime/env.types";

type PepperBindings = Pick<
	GatewayBindings,
	"KEY_PEPPER_ACTIVE" | "KEY_PEPPER_PREVIOUS"
>;

export type KeyPepperCandidateSource = "active" | "previous";

export type KeyPepperCandidate = {
	value: string;
	source: KeyPepperCandidateSource;
};

function normalize(value: string | null | undefined): string {
	return String(value ?? "").trim();
}

export function resolveActiveKeyPepper(bindings: PepperBindings): string | null {
	const active = normalize(bindings.KEY_PEPPER_ACTIVE);
	return active || null;
}

export function resolveKeyPepperCandidates(bindings: PepperBindings): KeyPepperCandidate[] {
	const active = resolveActiveKeyPepper(bindings);
	const previous = normalize(bindings.KEY_PEPPER_PREVIOUS);

	const out: KeyPepperCandidate[] = [];
	if (active) {
		out.push({ value: active, source: "active" });
	}
	if (previous && previous !== active) {
		out.push({ value: previous, source: "previous" });
	}
	return out;
}
