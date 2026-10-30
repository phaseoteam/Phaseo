import { useSuspenseQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { shellDataQuery } from "@/components/header/shellData";
import ModelDeprecationNotice from "./ModelDeprecationNotice";

// Signed-in only. Reuses the shell's account data, so public visitors cost
// nothing extra; the notice itself loads in the browser.
export default function ModelDeprecationNoticeSlot() {
	const locale = useLocale();
	const t = useTranslations("Common.deprecationNotice");
	const { data } = useSuspenseQuery(shellDataQuery(locale));
	const account = data.account;
	const userId = account.user?.id;
	const workspaceId = account.currentTeamId ?? account.teams[0]?.id;
	if (!account.isLoggedIn || !userId || !workspaceId) return null;
	return (
		<ModelDeprecationNotice
			key={`${userId}:${workspaceId}`}
			userId={userId}
			workspaceId={workspaceId}
			locale={locale}
			copy={{
				oneModel: t.raw("oneModel") as string,
				manyModels: t.raw("manyModels") as string,
				retiresOn: t.raw("retiresOn") as string,
				firstRetiresOn: t.raw("firstRetiresOn") as string,
				replacement: t.raw("replacement") as string,
				review: t("review"),
				dismiss: t("dismiss"),
			}}
		/>
	);
}
