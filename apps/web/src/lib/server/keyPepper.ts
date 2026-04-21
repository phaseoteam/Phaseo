function normalize(value: string | null | undefined): string {
	return String(value ?? "").trim();
}

export function resolveActiveKeyPepper(): string {
	const active = normalize(process.env.KEY_PEPPER_ACTIVE);
	if (active) return active;
	const legacy = normalize(process.env.KEY_PEPPER);
	if (legacy) return legacy;
	throw new Error("KEY_PEPPER_ACTIVE (or KEY_PEPPER) not set");
}
