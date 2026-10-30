import { useSuspenseQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import SiteNoticeBar from "@/components/site-notice/SiteNoticeBar";
import { shellDataQuery } from "@/components/header/shellData";
import {
	getActiveSiteNotice,
	SITE_NOTICES,
} from "@/lib/siteNotice";

export default function SiteNoticeSlot() {
	if (!SITE_NOTICES.some((notice) => notice.enabled)) return null;
	return <ActiveSiteNotice />;
}

function ActiveSiteNotice() {
	const locale = useLocale();
	const { data } = useSuspenseQuery(shellDataQuery(locale));
	const notice = getActiveSiteNotice(data.account.isLoggedIn === true);
	if (!notice) return null;
	return <SiteNoticeBar notice={notice} />;
}
