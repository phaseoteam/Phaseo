import type { Metadata } from "next";
import NotifierClient from "./NotifierClient";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";

export const metadata: Metadata = {
	title: "Internal Model Discovery Notifier",
	description:
		"Internal admin tool for testing Discord embed notifications used by model discovery workflows.",
	robots: {
		index: false,
		follow: false,
	},
};

export default async function InternalModelDiscoveryNotifierPage() {
	await requireInternalAdmin();

	return <NotifierClient />;
}
