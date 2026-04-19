import SiteNoticeBar from "@/components/site-notice/SiteNoticeBar";
import {
	getActiveSiteNotice,
	shouldShowSiteNotice,
} from "@/lib/siteNotice";
import { createClient } from "@/utils/supabase/server";

export default async function SiteNoticeSlot() {
	const notice = getActiveSiteNotice();
	if (!notice) return null;

	if (notice.audience === "all") {
		return <SiteNoticeBar notice={notice} />;
	}

	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	const isAuthenticated = Boolean(user);
	if (!shouldShowSiteNotice(notice, isAuthenticated)) {
		return null;
	}

	return <SiteNoticeBar notice={notice} />;
}

