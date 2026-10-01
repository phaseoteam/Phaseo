const NANOS_PER_USD = BigInt(1_000_000_000);

export function nanosToUsd(nanos: number): string {
	if (!Number.isSafeInteger(nanos) || nanos < 0) throw new Error("Invalid stored price.");
	const whole = BigInt(nanos) / NANOS_PER_USD;
	const fraction = (BigInt(nanos) % NANOS_PER_USD).toString().padStart(9, "0").replace(/0+$/, "");
	return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function usdToNanos(input: string): number | null {
	const value = input.trim();
	const match = /^(\d+)(?:\.(\d{1,9}))?$/.exec(value);
	if (!match) return null;
	const amount = BigInt(match[1]) * NANOS_PER_USD + BigInt((match[2] ?? "").padEnd(9, "0"));
	return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}
