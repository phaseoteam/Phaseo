function normalize(value: string | null | undefined): string {
	return String(value ?? "").trim();
}

export function resolveActiveKeyPepper(): string {
	const active = normalize(process.env.KEY_PEPPER_ACTIVE);
	if (active) return active;
	throw new Error("KEY_PEPPER_ACTIVE not set");
}
