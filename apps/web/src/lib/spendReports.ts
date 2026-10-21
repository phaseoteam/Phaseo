// The unsubscribe link in spend report emails: /spend-reports/<token>/unsubscribe. The token names
// one person and one workspace (workspace_spend_report_recipients.unsubscribe_token).

export type SpendReportSubscriptionView = {
	workspaceName: string;
	subscribed: boolean;
};

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSpendReportToken(value: string): boolean {
	return TOKEN_PATTERN.test(value);
}

export function spendReportApiPath(token: string, action?: "unsubscribe" | "subscribe"): `/api/_web/${string}` {
	return `/api/_web/spend-reports/${encodeURIComponent(token)}${action ? `/${action}` : ""}`;
}
