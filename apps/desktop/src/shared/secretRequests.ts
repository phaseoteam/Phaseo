/**
 * T3's secret requests: the agent asks for a secret with `request_secret`, the person types it into a masked field in
 * the chat, and the value goes into the app's credential vault. The agent gets a reference (or, for shell tools of
 * other harnesses, an owner-only file), never the value; the chat keeps only the request and its outcome.
 */
export type SecretDelivery = "secretRef" | "file";
export type SecretRequest = { id: string; label: string; reason: string; placeholder?: string; delivery: SecretDelivery; status: "pending" | "saved" | "declined" | "cancelled" | "timed_out"; createdAt: string; answeredAt?: string };
/** Without a delivery, Phaseo chats get a secretRef (run_command takes it) and other harnesses a file. */
export type SecretRequestInput = { label: string; reason: string; placeholder?: string; delivery?: SecretDelivery; timeoutMs: number };
export type SecretRequestResult = { status: "saved"; secretRef: string; expiresAt: string } | { status: "saved"; file: string; expiresAt: string } | { status: "declined" | "cancelled" | "timed_out" };

export const secretRequestTimeout = { default: 10 * 60_000, minimum: 1_000, maximum: 60 * 60_000 };
/** How long a saved secret stays usable. */
export const secretLifetimeMs = 24 * 60 * 60_000;
export const secretRefPattern = /^secret-ref:([0-9a-f]{32})$/;
export const environmentNamePattern = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
export const secretRef = (id: string) => `secret-ref:${id}`;

const line = (value: unknown, key: string, maximum: number, optional = false) => {
	if (optional && value === undefined) return undefined;
	if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\0\r]/.test(value)) throw new Error(`Invalid ${key}.`);
	return value.trim();
};

export function validateSecretRequest(raw: unknown): SecretRequestInput {
	const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
	if (input.delivery !== undefined && input.delivery !== "secretRef" && input.delivery !== "file") throw new Error("delivery is secretRef or file.");
	const timeout = input.timeoutMs ?? secretRequestTimeout.default;
	if (typeof timeout !== "number" || !Number.isInteger(timeout) || timeout < secretRequestTimeout.minimum || timeout > secretRequestTimeout.maximum) throw new Error("timeoutMs must be from 1000 to 3600000.");
	return { label: line(input.label, "label", 100)!, reason: line(input.reason, "reason", 1000)!, placeholder: line(input.placeholder, "placeholder", 200, true), delivery: input.delivery as SecretDelivery | undefined, timeoutMs: timeout };
}

export function validateSecretAnswer(value: unknown): string | null {
	if (value === null) return null;
	if (typeof value !== "string" || !value.length || value.length > 20_000 || value.includes("\0")) throw new Error("Enter the secret, up to 20,000 characters.");
	return value;
}

/** Replaces every copy of a secret in command output, so a stray echo never reaches the transcript. */
export function redactSecrets(text: string, values: readonly string[]) {
	let output = text;
	for (const value of values) if (value.length >= 4) output = output.split(value).join("[secret]");
	return output;
}
