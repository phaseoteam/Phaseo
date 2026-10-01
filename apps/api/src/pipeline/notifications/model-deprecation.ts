const SETTINGS_URL = "https://phaseo.app/settings/notifications";

type ModelDeprecationPayload = Record<string, unknown>;

export type ModelDeprecationContent = {
	title: string;
	message: string;
	emailMessage: string;
	replacementModelName: string | null;
	settingsUrl: string;
	modelUrl: string | null;
	replacementModelUrl: string | null;
	comparisonUrl: string | null;
};

function stringValue(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function formatDate(value: unknown): string | null {
	const raw = stringValue(value);
	if (!raw) return null;
	const timestamp = Date.parse(raw);
	if (!Number.isFinite(timestamp)) return raw;
	return new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	}).format(new Date(timestamp));
}

function modelUrl(modelId: string | null): string | null {
	if (!modelId) return null;
	const [organisationId, ...modelSegments] = modelId.split("/");
	if (!organisationId || modelSegments.length === 0) return `https://phaseo.app/models/${encodeURIComponent(modelId)}`;
	return `https://phaseo.app/models/${encodeURIComponent(organisationId)}/${encodeURIComponent(modelSegments.join("/"))}`;
}

function comparisonUrl(modelId: string | null, replacementModelId: string | null): string | null {
	if (!modelId || !replacementModelId) return null;
	const params = new URLSearchParams({ models: modelId });
	params.append("models", replacementModelId);
	return `https://phaseo.app/compare?${params.toString()}`;
}

export function getModelDeprecationContent(
	payload: ModelDeprecationPayload,
	now = new Date(),
): ModelDeprecationContent {
	const modelId = stringValue(payload.model_id);
	const modelName = stringValue(payload.model_name) ?? modelId ?? "A model used by your workspace";
	const replacementModelId = stringValue(payload.replacement_model_id);
	const replacementModelName = stringValue(payload.replacement_model_name) ?? replacementModelId;
	const deprecationTimestamp = Date.parse(stringValue(payload.deprecation_date) ?? "");
	const deprecationDate = formatDate(payload.deprecation_date);
	const retirementDate = formatDate(payload.retirement_date);
	const upcoming = Number.isFinite(deprecationTimestamp) && deprecationTimestamp > now.getTime();

	const title = `Model deprecation: ${modelName}`;
	const status = upcoming
		? `${modelName} is scheduled for deprecation on ${deprecationDate}.`
		: `${modelName} has been deprecated${deprecationDate ? ` as of ${deprecationDate}.` : "."}`;
	const replacement = replacementModelName
		? `Recommended replacement: ${replacementModelName}${replacementModelId && replacementModelId !== replacementModelName ? ` (${replacementModelId})` : "."}`
		: "Review your integration and choose a supported replacement before making further requests.";
	const retirement = retirementDate ? `The model is scheduled to retire on ${retirementDate}.` : "";

	return {
		title,
		message: [status, replacement, retirement].filter(Boolean).join(" "),
		emailMessage: [status, retirement].filter(Boolean).join(" "),
		replacementModelName,
		settingsUrl: SETTINGS_URL,
		modelUrl: modelUrl(modelId),
		replacementModelUrl: modelUrl(replacementModelId),
		comparisonUrl: comparisonUrl(modelId, replacementModelId),
	};
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

export function getModelDeprecationTemplateVariables(
	payload: ModelDeprecationPayload,
	now = new Date(),
): Record<string, string> {
	const content = getModelDeprecationContent(payload, now);
	const modelName = stringValue(payload.model_name) ?? stringValue(payload.model_id) ?? "A model used by your workspace";
	const replacementName = stringValue(payload.replacement_model_name) ?? stringValue(payload.replacement_model_id) ?? "a supported replacement";
	const userName = stringValue(payload.user_name) ?? "there";

	return {
		user_name: escapeHtml(userName),
		model_name: escapeHtml(modelName),
		message: escapeHtml(content.emailMessage),
		replacement_model_name: escapeHtml(replacementName),
		settings_url: content.settingsUrl,
		replacement_model_url: content.replacementModelUrl ?? "https://phaseo.app/models",
		compare_url: content.comparisonUrl ?? "https://phaseo.app/models",
	};
}

export function renderModelDeprecationEmail(
	payload: ModelDeprecationPayload,
	now = new Date(),
): { subject: string; html: string; text: string } {
	const content = getModelDeprecationContent(payload, now);
	const actionButtons = [
		content.comparisonUrl ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:6px;background-color:#0369a1;" bgcolor="#0369a1"><a href="${escapeHtml(content.comparisonUrl)}" style="display:inline-block;padding-top:11px;padding-right:15px;padding-bottom:11px;padding-left:15px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:16px;text-decoration:none;color:#ffffff;font-weight:600;white-space:nowrap;">Compare models</a></td></tr></table>` : "",
		content.replacementModelUrl ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td style="border:1px solid #bae6fd;border-radius:6px;background-color:#ffffff;" bgcolor="#ffffff"><a href="${escapeHtml(content.replacementModelUrl)}" style="display:inline-block;padding-top:10px;padding-right:14px;padding-bottom:10px;padding-left:14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:16px;text-decoration:none;color:#0369a1;font-weight:600;white-space:nowrap;">View recommended model</a></td></tr></table>` : "",
	].filter(Boolean).join('<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td height="8" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr></table>');
	const replacementCallout = content.replacementModelName
		? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f7f8" style="margin-bottom:22px;background-color:#f6f7f8;border:1px solid #e4e4e7;border-radius:10px;"><tr><td style="padding-top:14px;padding-right:16px;padding-bottom:14px;padding-left:16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#3f3f46;font-weight:600;">Recommended successor: ${escapeHtml(content.replacementModelName)}</td></tr></table>`
		: "";

	return {
		subject: content.title,
		html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"></head>
<body style="margin:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#18181b;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%;">
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;background-color:#ffffff;"><tr><td align="center" style="padding-top:40px;padding-right:20px;padding-bottom:40px;padding-left:20px;">
		<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;min-width:0;background-color:#ffffff;"><tr><td style="font-family:Arial,Helvetica,sans-serif;color:#18181b;font-size:16px;line-height:26px;">
			<table role="presentation" align="center" width="147" cellpadding="0" cellspacing="0" border="0" bgcolor="#0284c7" style="width:147px;margin-bottom:28px;background-color:#0284c7;border-radius:8px;"><tr><td style="padding-top:14px;padding-right:16px;padding-bottom:14px;padding-left:16px;"><img src="https://phaseo.app/wordmark_dark.svg" width="115" height="24" border="0" alt="Phaseo" style="display:block;width:115px;height:24px;border:0;"></td></tr></table>
			<h1 align="center" style="margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;font-size:28px;line-height:34px;letter-spacing:-.02em;color:#09090b;font-weight:500;">${escapeHtml(content.title)}</h1>
			<p style="margin-top:0;margin-right:0;margin-bottom:26px;margin-left:0;font-size:16px;line-height:26px;color:#3f3f46;font-weight:400;">${escapeHtml(content.emailMessage)}</p>
			${replacementCallout}
			${actionButtons}
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr><td style="padding-top:18px;padding-right:0;padding-bottom:0;padding-left:0;border-top:1px solid #e4e4e7;"><p style="margin-top:0;margin-right:0;margin-bottom:4px;margin-left:0;font-size:12px;line-height:18px;color:#71717a;font-weight:600;">Need help?</p><p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-size:13px;line-height:21px;color:#52525b;font-weight:400;">Reply to this email if you have questions about this model change.</p></td></tr></table>
			<p align="center" style="margin-top:26px;margin-right:0;margin-bottom:0;margin-left:0;font-size:13px;line-height:20px;color:#71717a;font-weight:400;"><a href="${escapeHtml(content.settingsUrl)}" style="font-size:13px;line-height:20px;color:#52525b;text-decoration:underline;font-weight:400;">Manage notifications</a></p>
		</td></tr></table>
	</td></tr></table>
</body>
</html>`,
		text: `${content.title}\n\n${content.emailMessage}${content.replacementModelName ? `\n\nRecommended successor: ${content.replacementModelName}` : ""}\n\n${content.comparisonUrl ? `Compare models: ${content.comparisonUrl}\n` : ""}${content.replacementModelUrl ? `View recommended model: ${content.replacementModelUrl}\n` : ""}Manage notifications: ${content.settingsUrl}`,
	};
}

export function renderNotificationTestEmail(): { subject: string; html: string; text: string } {
	const subject = "Phaseo test notification";
	const settingsUrl = SETTINGS_URL;
	return {
		subject,
		html: `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#18181b;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%;">
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;background-color:#ffffff;">
		<tr><td align="center" style="padding-top:40px;padding-right:20px;padding-bottom:40px;padding-left:20px;">
			<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;min-width:0;background-color:#ffffff;">
				<tr><td style="padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;font-family:Arial,Helvetica,sans-serif;color:#18181b;font-size:16px;line-height:26px;">
					<table role="presentation" align="center" width="147" cellpadding="0" cellspacing="0" border="0" bgcolor="#0284c7" style="width:147px;margin-bottom:28px;background-color:#0284c7;border-radius:8px;"><tr>
						<td style="padding-top:14px;padding-right:16px;padding-bottom:14px;padding-left:16px;vertical-align:middle;"><img src="https://phaseo.app/wordmark_dark.svg" width="115" height="24" border="0" alt="Phaseo" style="display:block;width:115px;height:24px;border:0;"></td>
					</tr></table>
					<h1 align="center" style="margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;font-size:28px;line-height:34px;letter-spacing:-.02em;color:#09090b;font-weight:500;">Your destination is connected</h1>
					<p align="center" style="margin-top:0;margin-right:0;margin-bottom:10px;margin-left:0;font-size:15px;line-height:26px;color:#18181b;font-weight:600;">Hi there,</p>
					<p align="center" style="margin-top:0;margin-right:0;margin-bottom:26px;margin-left:0;font-size:16px;line-height:26px;color:#3f3f46;font-weight:400;">Your Phaseo notification destination is connected and ready to receive workspace alerts.</p>
					<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:6px;background-color:#0369a1;" bgcolor="#0369a1"><a href="${settingsUrl}" style="display:inline-block;padding-top:11px;padding-right:15px;padding-bottom:11px;padding-left:15px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:16px;text-decoration:none;color:#ffffff;font-weight:600;">Manage notifications</a></td></tr></table>
					<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr><td style="padding-top:18px;padding-right:0;padding-bottom:0;padding-left:0;border-top:1px solid #e4e4e7;">
						<p style="margin-top:0;margin-right:0;margin-bottom:4px;margin-left:0;font-size:12px;line-height:18px;color:#71717a;font-weight:600;">Need help?</p>
						<p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-size:13px;line-height:21px;color:#52525b;font-weight:400;">Reply to this email if you have questions about notifications.</p>
					</td></tr></table>
				</td></tr>
			</table>
		</td></tr>
	</table>
</body>
</html>`,
		text: `${subject}

Your Phaseo notification destination is connected and ready to receive workspace alerts.

Need help? Reply to this email if you have questions about notifications.

Manage notifications: ${settingsUrl}`,
	};
}
