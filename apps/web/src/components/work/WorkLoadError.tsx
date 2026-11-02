import { getTranslations } from "next-intl/server";
import { Callout } from "@/components/ui/callout";

/** Shown in place of a work page whose data couldn't load. */
export async function WorkLoadError({ status, message }: { status: number | null; message: string | null }) {
	const t = await getTranslations("Work.common");
	if (status === 400 && !message) return <Callout tone="info">{t("selectWorkspace")}</Callout>;
	if (status === 403) return <Callout tone="warning">{t("forbidden")}</Callout>;
	return <Callout tone="critical" role="alert">{t("loadFailed", { message: message ?? (status ? `HTTP ${status}` : "") })}</Callout>;
}
