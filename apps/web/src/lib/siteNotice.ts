export type SiteNoticeAudience = "all" | "authenticated" | "unauthenticated";
export type SiteNoticeTone = "info" | "warning" | "critical";

export type SiteNotice = {
	id: string;
	enabled: boolean;
	audience: SiteNoticeAudience;
	tone: SiteNoticeTone;
	message: string;
	showTiming?: boolean;
	cta?: {
		label: string;
		href: string;
	};
	startsAt?: string;
	endsAt?: string;
};

export const VERCEL_SECURITY_NOTICE_HREF =
	"/blog/security-notice-key-rotation-vercel-2026-04-19";

export const SITE_NOTICES: SiteNotice[] = [
	{
		id: "maintenance-2026-07-09",
		enabled: true,
		audience: "all",
		tone: "warning",
		message:
			"Maintenance is in progress. Some features may be temporarily unavailable. Please try again shortly if something is not working.",
		showTiming: true,
		endsAt: "2026-07-09T16:00:00.000Z",
	},
	{
		id: "vercel-april-2026-security-incident",
		enabled: false,
		audience: "authenticated",
		tone: "warning",
		message:
			"Security Notice: Third-Party Breach. Please read how you're protected.",
		cta: {
			label: "How you're protected",
			href: VERCEL_SECURITY_NOTICE_HREF,
		},
		startsAt: "2026-04-19T00:00:00.000Z",
		endsAt: "2026-04-23T23:59:59.999Z",
	},
];

function isActiveAt(notice: SiteNotice, now: Date): boolean {
	const startTs = notice.startsAt ? Date.parse(notice.startsAt) : null;
	const endTs = notice.endsAt ? Date.parse(notice.endsAt) : null;
	const nowTs = now.getTime();
	if (startTs !== null && !Number.isFinite(startTs)) return false;
	if (endTs !== null && !Number.isFinite(endTs)) return false;
	if (startTs !== null && nowTs < startTs) return false;
	if (endTs !== null && nowTs > endTs) return false;
	return true;
}

export function getActiveSiteNotice(
	isAuthenticated: boolean,
	now: Date = new Date()
): SiteNotice | null {
	for (const notice of SITE_NOTICES) {
		if (!notice.enabled) continue;
		if (!isActiveAt(notice, now)) continue;
		if (!shouldShowSiteNotice(notice, isAuthenticated)) continue;
		return notice;
	}
	return null;
}

export function shouldShowSiteNotice(
	notice: SiteNotice,
	isAuthenticated: boolean
): boolean {
	if (notice.audience === "all") return true;
	if (notice.audience === "authenticated") return isAuthenticated;
	return !isAuthenticated;
}
