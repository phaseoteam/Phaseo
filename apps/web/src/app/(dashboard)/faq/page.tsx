import type { Metadata } from "next";

import { FAQSection } from "@/components/(gateway)/sections/FAQSection";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
	title: "Gateway FAQ",
	description:
		"Common questions about Phaseo Gateway, including billing, BYOK, routing, model support, logging, and getting started.",
	path: "/faq",
	keywords: [
		"AI gateway FAQ",
		"BYOK FAQ",
		"OpenAI compatible API FAQ",
		"model routing FAQ",
		"Phaseo support",
	],
});

export default function FAQPage() {
	return (
		<div className="container mx-auto pt-16 sm:pt-20">
			<div className="px-4 sm:px-6 lg:px-8">
				<FAQSection />
			</div>
		</div>
	);
}
