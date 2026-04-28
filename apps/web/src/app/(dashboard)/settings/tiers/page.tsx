import { redirect } from "next/navigation";

export const metadata = {
	title: "Tiers - Settings",
};

export default function TiersPage() {
	redirect("/settings/credits");
}
