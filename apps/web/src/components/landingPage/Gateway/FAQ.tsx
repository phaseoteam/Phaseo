import { Card, CardContent } from "@/components/ui/card";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
	{
		q: "Is Gateway a replacement for the Conduit?",
		a: "Yes. AI Stats Gateway is the new name and positioning of the Conduit, focused on being the single API for every model while keeping compatibility commitments.",
	},
	{
		q: "Can I bring my existing OpenAI or Anthropic SDK?",
		a: "Yes. Gateway preserves OpenAI- and Anthropic-compatible endpoints, so most migrations are a base URL + key change.",
	},
	{
		q: "How do I monitor deprecations and rollouts?",
		a: "Gateway centralises model status and retirement signals so you can proactively migrate before changes impact production.",
	},
	{
		q: "What about compliance and key security?",
		a: "Scoped keys, audit logging, and encrypted BYOK workflows are supported. Enterprise can add custom routing policies and controls.",
	},
];

export function FAQ() {
	return (
		<section id="faq" className="py-16 sm:py-20 bg-gray-50/20">
			<div className="container mx-auto grid gap-8 lg:grid-cols-[1fr,1.2fr] lg:items-start">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
						FAQ
					</p>
					<h2 className="mt-3 text-3xl font-semibold text-slate-950 sm:text-4xl">
						Answers for teams migrating today.
					</h2>
					<p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600">
						Clear guidance for production rollouts, compatibility,
						and governance.
					</p>
				</div>
				<Card className="shadow-sm border border-slate-200/70 bg-slate-50/80">
					<CardContent className="p-6">
						<Accordion type="single" collapsible className="w-full">
							{FAQS.map((item, idx) => (
								<AccordionItem key={idx} value={`faq-${idx}`}>
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
		</section>
	);
}
