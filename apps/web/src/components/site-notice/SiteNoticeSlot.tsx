import SiteNoticeBar from "@/components/site-notice/SiteNoticeBar";
import {
	getActiveSiteNotice,
} from "@/lib/siteNotice";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";

export default async function SiteNoticeSlot() {
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
