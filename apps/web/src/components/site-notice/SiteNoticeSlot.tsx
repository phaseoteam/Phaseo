import SiteNoticeBar from "@/components/site-notice/SiteNoticeBar";
import {
	getActiveSiteNotice,
} from "@/lib/siteNotice";
import { createClient } from "@/utils/supabase/server";

export default async function SiteNoticeSlot() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	const isAuthenticated = Boolean(user);
	const notice = getActiveSiteNotice(isAuthenticated);
	if (!notice) return null;

	return <SiteNoticeBar notice={notice} />;
}
