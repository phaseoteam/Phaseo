import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";



export function FAQ() {
	const tCopy = useTranslations("Site.landingGaps");

	const FAQS = [
	{
		q: tCopy("copy003"),
		a: tCopy("copy004"),
	},
	{
		q: tCopy("copy005"),
		a: tCopy("copy006"),
	},
	{
		q: tCopy("copy007"),
		a: tCopy("copy008"),
	},
	{
		q: tCopy("copy009"),
		a: tCopy("copy010"),
	},
];

	return (
		<section id="faq" className="py-16 sm:py-20 bg-gray-50/20">
			<div className="container mx-auto grid gap-8 lg:grid-cols-[1fr,1.2fr] lg:items-start">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
{tCopy("copy011")}
</p>
					<h2 className="mt-3 text-3xl font-semibold text-slate-950 sm:text-4xl">
{tCopy("copy012")}
</h2>
					<p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600">
{tCopy("copy013")}
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
