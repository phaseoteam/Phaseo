import { escapeHtml, stringValue } from "@/pipeline/notifications/model-deprecation";

type CreditTopupConfirmationPayload = Record<string, unknown>;

function usd(cents: unknown): string {
	const parsed = Number(cents);
	const dollars = Number.isFinite(parsed) && parsed >= 0 ? parsed / 100 : 0;
	return dollars.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cardLabel(brand: unknown, last4: unknown): string {
	const name = stringValue(brand);
	const digits = stringValue(last4);
	const display = name ? name.charAt(0).toUpperCase() + name.slice(1) : "Card";
	return digits ? `${display} ending ${digits}` : "the saved card";
}

function expiryLabel(value: unknown): string | null {
	const raw = stringValue(value);
	if (!raw) return null;
	const date = new Date(raw);
	if (Number.isNaN(date.getTime())) return null;
	return `${date.toLocaleString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false })} UTC`;
}

/**
 * The email workspace owners and admins get when an agent or script asks to charge the
 * saved card through POST /v1/credits/topups. The link only opens a review page: the
 * charge needs a signed-in owner or admin to press Confirm there, so a mail scanner
 * that follows the link changes nothing.
 */
export function renderCreditTopupConfirmationEmail(payload: CreditTopupConfirmationPayload): { subject: string; html: string; text: string } {
	const amount = usd(payload.amount_cents);
	const workspace = stringValue(payload.workspace_name) ?? "your workspace";
	const requester = stringValue(payload.requested_by_email);
	const card = cardLabel(payload.card_brand, payload.card_last4);
	const confirmUrl = stringValue(payload.confirm_url) ?? "https://phaseo.app/settings/credits";
	const expires = expiryLabel(payload.expires_at);
	const title = `Confirm ${amount} of Phaseo credits`;
	const lead = `${requester ? `${requester} asked` : "Someone asked"}, through the Phaseo CLI or API, to add ${amount} of credits to ${workspace} and charge ${card}.`;
	const action = `Nothing is charged until an owner or admin confirms it. Open the request to confirm or decline it${expires ? ` before ${expires}` : ""}. The link works once and expires after 30 minutes.`;
	const footer = `You're getting this because you're an owner or admin of ${workspace}. If you don't recognise this request, decline it.`;

	return {
		subject: title,
		html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"></head>
<body style="margin:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#18181b;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%;">
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;background-color:#ffffff;"><tr><td align="center" style="padding-top:40px;padding-right:20px;padding-bottom:40px;padding-left:20px;">
		<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;min-width:0;background-color:#ffffff;"><tr><td style="font-family:Arial,Helvetica,sans-serif;color:#18181b;font-size:16px;line-height:26px;">
			<table role="presentation" align="center" width="147" cellpadding="0" cellspacing="0" border="0" bgcolor="#0284c7" style="width:147px;margin-bottom:28px;background-color:#0284c7;border-radius:6px;"><tr><td style="padding-top:14px;padding-right:16px;padding-bottom:14px;padding-left:16px;"><img src="https://phaseo.app/wordmark_dark.svg" width="115" height="24" border="0" alt="Phaseo" style="display:block;width:115px;height:24px;border:0;"></td></tr></table>
			<h1 align="center" style="margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;font-size:28px;line-height:34px;letter-spacing:-.02em;color:#09090b;font-weight:500;">${escapeHtml(title)}</h1>
			<p style="margin-top:0;margin-right:0;margin-bottom:16px;margin-left:0;font-size:16px;line-height:26px;color:#3f3f46;font-weight:400;">${escapeHtml(lead)}</p>
			<p style="margin-top:0;margin-right:0;margin-bottom:26px;margin-left:0;font-size:16px;line-height:26px;color:#3f3f46;font-weight:400;">${escapeHtml(action)}</p>
			<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:6px;background-color:#0369a1;" bgcolor="#0369a1"><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding-top:11px;padding-right:15px;padding-bottom:11px;padding-left:15px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:16px;text-decoration:none;color:#ffffff;font-weight:600;white-space:nowrap;">Review request</a></td></tr></table>
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr><td style="padding-top:18px;padding-right:0;padding-bottom:0;padding-left:0;border-top:1px solid #e4e4e7;"><p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-size:13px;line-height:21px;color:#52525b;font-weight:400;">${escapeHtml(footer)}</p></td></tr></table>
		</td></tr></table>
	</td></tr></table>
</body>
</html>`,
		text: `${title}\n\n${lead}\n\n${action}\n\nReview request: ${confirmUrl}\n\n${footer}`,
	};
}
