import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import ContactPage from "../contact/page";

export const metadata: Metadata = buildMetadata({
	title: "Support",
	description:
		"Contact Phaseo support for account, billing, and product questions, with direct human responses from the founder plus docs, community resources, and current support availability.",
	path: "/support",
	keywords: [
		"Phaseo support",
		"contact Phaseo",
		"AI gateway support",
		"AI model database help",
	],
});

export default ContactPage;
