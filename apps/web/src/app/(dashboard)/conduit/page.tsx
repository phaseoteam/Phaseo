import type { Metadata } from "next";

import { Separator } from "@/components/ui/separator";

import { Hero } from "@/components/landingPage/Conduit/Hero";
import { Features } from "@/components/landingPage/Conduit/Features";
import { Integrations } from "@/components/landingPage/Conduit/Integrations";
import { FAQ } from "@/components/landingPage/Conduit/FAQ";
import { CTA } from "@/components/landingPage/Conduit/CTA";

export const metadata: Metadata = {
	title: "AI Stats Conduit - Single API for Every Model",
	description:
		"AI Stats Conduit standardises provider quirks behind one surface, with routing, reliability, observability, and security for production workloads.",
	alternates: { canonical: "/conduit" },
	openGraph: {
		type: "website",
		title: "AI Stats Conduit -- Single API for Every Model",
		description:
			"Unify providers behind one API surface. Route intelligently. Observe everything. Ship without rewrites.",
	},
};

export default function ConduitMarketingPage() {
	return (
		<main>
			<Hero />

			<Separator className="my-8" />

			<Features />

			<Separator className="my-8" />

			<Integrations />

			<Separator className="my-8" />

			<FAQ />

			<CTA />
		</main>
	);
}
