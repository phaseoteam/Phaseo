// Email to a workspace's owners and admins after Phaseo revoked or paused
// their API keys because a platform they said stores those keys was breached.
import { keyStorageLocation } from "@/core/key-storage-locations";

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("\"", "&quot;")
		.replaceAll("'", "&#39;");
}

function text(value: unknown, fallback: string) {
	return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function renderStorageIncidentEmail(payload: Record<string, unknown> | null) {
	const locationId = text(payload?.location_id, "");
	const platform = keyStorageLocation(locationId)?.name ?? (locationId || "a platform you use");
	const workspaceName = text(payload?.workspace_name, "your workspace");
	const keys = typeof payload?.keys === "number" && payload.keys > 0 ? Math.floor(payload.keys) : null;
	const revoked = payload?.action !== "pause";
	const message = text(payload?.message, "");
	const sourceUrl = typeof payload?.source_url === "string" && /^https:\/\//.test(payload.source_url) ? payload.source_url : null;
	const keyCount = keys === null ? "API keys" : keys === 1 ? "1 API key" : `${keys} API keys`;

	const subject = revoked
		? `Security alert: ${keyCount} revoked after a ${platform} breach`
		: `Security alert: ${keyCount} paused after a ${platform} breach`;
	const lead = revoked
		? `${platform} reported a security incident. Phaseo has revoked ${keyCount} in ${workspaceName} that you recorded as stored in ${platform}. Revoked keys can't be turned back on.`
		: `${platform} reported a security incident. Phaseo has paused ${keyCount} in ${workspaceName} that you recorded as stored in ${platform}.`;
	const steps = revoked
		? "Create replacement keys, store them where they are safe, and update anything that used the revoked keys. Then check your request logs for traffic you don't recognise."
		: "Rotate these keys before resuming them, then check your request logs for traffic you don't recognise.";
	const link = "https://phaseo.app/settings/security";

	return {
		subject,
		html: [
			"<div style=\"font-family: ui-sans-serif, system-ui; line-height: 1.5;\">",
			`<h2 style="margin: 0 0 12px;">${escapeHtml(subject)}</h2>`,
			`<p style="margin: 0 0 12px;">${escapeHtml(lead)}</p>`,
			message ? `<p style="margin: 0 0 12px;">${escapeHtml(message)}</p>` : "",
			sourceUrl ? `<p style="margin: 0 0 12px;"><a href="${escapeHtml(sourceUrl)}">${escapeHtml(platform)}'s disclosure</a></p>` : "",
			`<p style="margin: 0 0 12px;">${escapeHtml(steps)}</p>`,
			`<p style="margin: 0;"><a href="${link}">Review your keys in Key security</a></p>`,
			"</div>",
		].join(""),
		text: [subject, "", lead, message || null, sourceUrl ? `${platform}'s disclosure: ${sourceUrl}` : null, "", steps, "", `Review your keys: ${link}`]
			.filter((line) => line !== null)
			.join("\n"),
	};
}
