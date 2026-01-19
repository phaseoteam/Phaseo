import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { ProviderLogoRow } from "@/components/landingPage/Conduit/ProviderLogoRow";

const FAQS = [
	{
		q: "Is Conduit a replacement for the Gateway?",
		a: "Yes. AI Stats Conduit is the new name and positioning of the Gateway, focused on being the single API for every model while keeping compatibility commitments.",
	},
	{
		q: "Can I bring my existing OpenAI or Anthropic SDK?",
		a: "Yes. Conduit preserves OpenAI- and Anthropic-compatible endpoints, so most migrations are a base URL + key change.",
	},
	{
		q: "How do I monitor deprecations and rollouts?",
		a: "Conduit centralises model status and retirement signals so you can proactively migrate before changes impact production.",
	},
	{
		q: "What about compliance and key security?",
		a: "Scoped keys, audit logging, and encrypted BYOK workflows are supported. Enterprise can add custom routing policies and controls.",
	},
];

export function FAQ() {
	return (
		<section id="faq" className="py-16 sm:py-20">
			<div className="container mx-auto flex flex-col items-center">
				<h2 className="mb-8 text-3xl font-bold text-center text-slate-900">
					Answers for teams migrating today.
				</h2>
				<p className="mb-8 max-w-2xl text-base leading-relaxed text-center text-slate-600">
					If you're mid-migration or planning a switch, this is the
					practical stuff.
				</p>
				<div className="w-full flex justify-center">
					<Card
						className="shadow-sm border-t-2"
						style={{ borderTopColor: "#0ea5e9" }}
					>
						<CardContent className="p-6">
							<Accordion
								type="single"
								collapsible
								className="w-full"
							>
								{FAQS.map((item, idx) => (
									<AccordionItem
										key={idx}
										value={`faq-${idx}`}
									>
										<AccordionTrigger className="text-left">
											{item.q}
										</AccordionTrigger>
										<AccordionContent className="text-slate-600">
											{item.a}
										</AccordionContent>
									</AccordionItem>
								))}
							</Accordion>
						</CardContent>
					</Card>
				</div>
			</div>
		</section>
	);
}
