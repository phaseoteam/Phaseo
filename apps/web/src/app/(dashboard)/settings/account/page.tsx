import { redirect } from "next/navigation";

export const metadata = {
	title: "Account - Settings",
};

export default function AccountSettingsPage() {
	redirect("/settings/account/details");
}
