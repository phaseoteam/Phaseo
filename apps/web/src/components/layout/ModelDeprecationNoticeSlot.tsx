import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { getHeaderAccountData } from "@/components/header/getHeaderAccountData";
import ModelDeprecationNotice from "./ModelDeprecationNotice";

// Signed-in only. Reuses the header's per-request account lookup, so public
// visitors cost nothing extra; the notice itself loads in the browser.
export default async function ModelDeprecationNoticeSlot() {
	await connection();
	const account = await getHeaderAccountData();
	const userId = account.user?.id;
	const workspaceId = account.currentTeamId ?? account.teams[0]?.id;
	if (!account.isLoggedIn || !userId || !workspaceId) return null;
	const [t, locale] = await Promise.all([getTranslations("Common.deprecationNotice"), getLocale()]);
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
				replacement: t.raw("replacement") as string,
				review: t("review"),
				dismiss: t("dismiss"),
			}}
		/>
	);
}
