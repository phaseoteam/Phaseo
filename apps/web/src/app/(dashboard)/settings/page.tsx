import { redirect } from "next/navigation";
import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";

export const metadata = {
	title: "Settings",
};

export default async function SettingsIndexPage() {
	const account = await fetchInternalAuthHeaderData();
	redirect(account.providerMode ? "/settings/account/providers" : "/settings/credits");
}
