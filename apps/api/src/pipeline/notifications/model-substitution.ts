import { escapeHtml, modelUrl, stringValue } from "@/pipeline/notifications/model-deprecation";

const ROUTING_SETTINGS_URL = "https://phaseo.app/settings/routing";

type ModelSubstitutionPayload = Record<string, unknown>;

export type ModelSubstitutionContent = {
	title: string;
	message: string;
	settingsUrl: string;
	replacementModelUrl: string | null;
};

/**
 * The one-off notice sent the first time a workspace's requests for a model no
 * provider serves are answered by a replacement.
 */
export function getModelSubstitutionContent(payload: ModelSubstitutionPayload): ModelSubstitutionContent {
	const modelId = stringValue(payload.model_id);
	const modelName = stringValue(payload.model_name) ?? modelId ?? "A model used by your workspace";
	const replacementModelId = stringValue(payload.replacement_model_id);
	const replacementName = stringValue(payload.replacement_model_name) ?? replacementModelId ?? "its replacement";
	const replacementLabel = replacementModelId && replacementModelId !== replacementName ? `${replacementName} (${replacementModelId})` : replacementName;
	const workspaceName = stringValue(payload.workspace_name) ?? "your workspace";
	const chosenBy = payload.source === "workspace"
		? "the replacement your workspace chose"
		: "the replacement approved for it";

	return {
		title: stringValue(payload.title) ?? `Model replaced: ${modelName}`,
		message: [
			`No provider serves ${modelName} any more, so requests for it from ${workspaceName} are now answered by ${replacementLabel}, ${chosenBy}.`,
			"These responses include the X-Phaseo-Model-Substitution header.",
			"To choose a different replacement or stop redirecting this model, change your retired model routing settings.",
		].join(" "),
		settingsUrl: ROUTING_SETTINGS_URL,
		replacementModelUrl: modelUrl(replacementModelId),
	};
}

export function renderModelSubstitutionEmail(payload: ModelSubstitutionPayload): { subject: string; html: string; text: string } {
	const content = getModelSubstitutionContent(payload);
	const button = (href: string, label: string, primary: boolean) => primary
		? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:6px;background-color:#0369a1;" bgcolor="#0369a1"><a href="${escapeHtml(href)}" style="display:inline-block;padding-top:11px;padding-right:15px;padding-bottom:11px;padding-left:15px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:16px;text-decoration:none;color:#ffffff;font-weight:600;white-space:nowrap;">${label}</a></td></tr></table>`
		: `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td style="border:1px solid #bae6fd;border-radius:6px;background-color:#ffffff;" bgcolor="#ffffff"><a href="${escapeHtml(href)}" style="display:inline-block;padding-top:10px;padding-right:14px;padding-bottom:10px;padding-left:14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:16px;text-decoration:none;color:#0369a1;font-weight:600;white-space:nowrap;">${label}</a></td></tr></table>`;
	const actionButtons = [
		button(content.settingsUrl, "Review routing settings", true),
		content.replacementModelUrl ? button(content.replacementModelUrl, "View replacement model", false) : "",
	].filter(Boolean).join('<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td height="8" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr></table>');

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
			<p style="margin-top:0;margin-right:0;margin-bottom:26px;margin-left:0;font-size:16px;line-height:26px;color:#3f3f46;font-weight:400;">${escapeHtml(content.message)}</p>
			${actionButtons}
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr><td style="padding-top:18px;padding-right:0;padding-bottom:0;padding-left:0;border-top:1px solid #e4e4e7;"><p style="margin-top:0;margin-right:0;margin-bottom:4px;margin-left:0;font-size:12px;line-height:18px;color:#71717a;font-weight:600;">Need help?</p><p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-size:13px;line-height:21px;color:#52525b;font-weight:400;">Reply to this email if you have questions about this model change.</p></td></tr></table>
			<p align="center" style="margin-top:26px;margin-right:0;margin-bottom:0;margin-left:0;font-size:13px;line-height:20px;color:#71717a;font-weight:400;"><a href="https://phaseo.app/settings/notifications" style="font-size:13px;line-height:20px;color:#52525b;text-decoration:underline;font-weight:400;">Manage notifications</a></p>
		</td></tr></table>
	</td></tr></table>
</body>
</html>`,
		text: `${content.title}\n\n${content.message}\n\nReview routing settings: ${content.settingsUrl}\n${content.replacementModelUrl ? `View replacement model: ${content.replacementModelUrl}\n` : ""}Manage notifications: https://phaseo.app/settings/notifications`,
	};
}
