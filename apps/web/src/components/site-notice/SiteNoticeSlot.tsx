import SiteNoticeBar from "@/components/site-notice/SiteNoticeBar";
import {
	getActiveSiteNotice,
} from "@/lib/siteNotice";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export default async function SiteNoticeSlot() {
	const headerStore = await headers();
	const requestedPath =
		headerStore.get("x-invoke-path") ??
		headerStore.get("next-url") ??
		"/";
	if (requestedPath.startsWith("/chat")) {
		return null;
	}

	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	const isAuthenticated = Boolean(user);
	const notice = getActiveSiteNotice(isAuthenticated);
	if (!notice) return null;

	return <SiteNoticeBar notice={notice} />;
}
