import { connection } from "next/server";
import SiteNoticeBar from "@/components/site-notice/SiteNoticeBar";
import {
	getActiveSiteNotice,
	SITE_NOTICES,
} from "@/lib/siteNotice";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";

export default async function SiteNoticeSlot() {
	if (!SITE_NOTICES.some((notice) => notice.enabled)) return null;
	// Supabase Auth checks token expiry with Date.now() during client
	// initialization. Make that indirect runtime access explicit to Cache
	// Components before the client is constructed.
	await connection();
	let isAuthenticated = false;
	try {
		const status = await fetchInternalAuthStatus();
		isAuthenticated = status.signedIn;
	} catch {
		isAuthenticated = false;
	}
	const notice = getActiveSiteNotice(isAuthenticated);
	if (!notice) return null;

	return <SiteNoticeBar notice={notice} />;
}
