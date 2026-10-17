import { Resend } from "resend";
import type { Env } from "@/env";

function statusCodeOf(error: unknown): number {
	return Number((error as { statusCode?: unknown }).statusCode ?? 0);
}

function resendClient(env: Env): Resend | null {
	const apiKey = String(env.RESEND_API_KEY ?? "").trim();
	if (!apiKey) {
		if (env.ENV === "production") throw new Error("missing_resend_api_key");
		return null;
	}
	return new Resend(apiKey);
}

export async function deleteResendContact(env: Env, email: string | null | undefined): Promise<void> {
	const normalizedEmail = String(email ?? "").trim().toLowerCase();
	if (!normalizedEmail) return;
	const resend = resendClient(env);
	if (!resend) return;

	const { error } = await resend.contacts.remove({ email: normalizedEmail });
	if (!error) return;
	if (statusCodeOf(error) === 404) return;
	throw new Error(`resend_contact_delete_failed:${error.name}:${error.message}`);
}

/**
 * Marks the address unsubscribed in Resend so broadcasts and automations skip it too.
 * An address with no contact yet gets an unsubscribed one, so a later signup or
 * checkout event cannot subscribe it again.
 */
export async function unsubscribeResendContact(env: Env, email: string | null | undefined): Promise<void> {
	const normalizedEmail = String(email ?? "").trim().toLowerCase();
	if (!normalizedEmail) return;
	const resend = resendClient(env);
	if (!resend) return;

	const updated = await resend.contacts.update({ email: normalizedEmail, unsubscribed: true });
	if (!updated.error) return;
	if (statusCodeOf(updated.error) !== 404) {
		throw new Error(`resend_contact_unsubscribe_failed:${updated.error.name}:${updated.error.message}`);
	}

	const created = await resend.contacts.create({ email: normalizedEmail, unsubscribed: true });
	if (!created.error) return;
	// Created concurrently (e.g. a signup event); mark that contact instead.
	if (statusCodeOf(created.error) === 409) {
		const retried = await resend.contacts.update({ email: normalizedEmail, unsubscribed: true });
		if (!retried.error) return;
		throw new Error(`resend_contact_unsubscribe_failed:${retried.error.name}:${retried.error.message}`);
	}
	throw new Error(`resend_contact_unsubscribe_failed:${created.error.name}:${created.error.message}`);
}
