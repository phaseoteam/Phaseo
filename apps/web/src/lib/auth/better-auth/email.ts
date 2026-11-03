import { Resend } from "resend";

/**
 * Auth emails (verify address, reset password, confirm email change). Supabase Auth sends these today from its
 * own templates; Better Auth only hands over the link, so Phaseo sends them through Resend, which it already uses.
 * Copy is deliberately plain; the owner may want the Supabase templates ported (MIGRATION-NOTES.md, open items).
 */

type Env = Record<string, string | undefined>;

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

export function renderAuthEmail(input: { intro: string; action: string; url: string; outro: string }): string {
	return [
		`<p>${escapeHtml(input.intro)}</p>`,
		`<p><a href="${escapeHtml(input.url)}">${escapeHtml(input.action)}</a></p>`,
		`<p>${escapeHtml(input.outro)}</p>`,
	].join("");
}

export async function sendAuthEmail(
	message: { to: string; subject: string; html: string },
	env: Env = process.env,
): Promise<void> {
	const apiKey = env.RESEND_API_KEY?.trim();
	if (!apiKey) throw new Error("RESEND_API_KEY is required to send authentication email");
	const from = env.AUTH_EMAIL_FROM?.trim() || env.RESEND_FROM_EMAIL?.trim() || "Phaseo <support@phaseo.app>";
	const { error } = await new Resend(apiKey).emails.send({ from, ...message });
	if (error) throw new Error(`Resend rejected the auth email: ${error.message}`);
}
