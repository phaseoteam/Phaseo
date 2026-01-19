"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface FAQItemProps {
	question: string;
	answer: string;
}

function FAQItem({ question, answer }: FAQItemProps) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<div className="rounded-xl border border-slate-200">
			<Button
				onClick={() => setIsOpen(!isOpen)}
				variant="ghost"
				className="flex w-full items-start justify-between gap-3 p-4 h-auto text-left hover:bg-slate-50 whitespace-normal"
			>
				<span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
					{question}
				</span>
				<ChevronDown
					className={`h-4 w-4 text-slate-500 dark:text-slate-300 transition-transform duration-200 ${
						isOpen ? "rotate-180" : ""
					}`}
				/>
			</Button>
			{isOpen && (
				<div className="border-t border-slate-100 px-4 pb-4">
					<p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
						{answer}
					</p>
				</div>
			)}
		</div>
	);
}

export function FAQSection() {
	return (
		<section
			id="faq"
			className="container mx-auto w-full px-4 py-16 sm:px-6 lg:px-8"
		>
			<div className="space-y-6">
				<h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
					Frequently asked questions
				</h2>

				<div className="grid gap-4 md:grid-cols-2">
					{/* 1. BYOK */}
					<FAQItem
						question="Can I use my own provider keys?"
						answer="Yes - bring your own keys (BYOK) for any provider and enforce limits per key. Managed keys are also available if you prefer not to handle credentials yourself."
					/>

					{/* 2. Modalities */}
					<FAQItem
						question="What model modalities does the Conduit support?"
						answer="We currently support chat completions, embeddings, and moderations, each with consistent schemas across all providers. Support for audio, image, and video models is in active development."
					/>

					{/* 3. Model updates */}
					<FAQItem
						question="How quickly are new models added?"
						answer="New provider models and community submissions are reviewed and added on a rolling basis. Once approved, they're available instantly in the Conduit and the SDKs."
					/>

					{/* 4. Telemetry */}
					<FAQItem
						question="Where do latency, token, and reliability metrics come from?"
						answer="All telemetry comes from live Conduit traffic. The dashboards display a range of real world token usage, latency, and provider health."
					/>

					{/* 5. Multi-provider usage */}
					<FAQItem
						question="Can I mix different providers in one application?"
						answer="Yes — choose the provider or model per request while keeping a single unified API. Switching providers requires only changing the model name."
					/>

					{/* 6. Routing behaviour */}
					<FAQItem
						question="How does Conduit route requests?"
						answer="Routing is done on a request by request basis, depending on the latest provider health and performance. You are in control, and can disable or enable providers. You stay fully in control of provider behaviour."
					/>

					{/* 7. Rate limits */}
					<FAQItem
						question="Does AI Stats apply any rate limits or usage quotas?"
						answer="No - we do not apply any rate limits. Upstream providers may apply rate limits, however, we will work with providers to get you the best limits. You can apply limits per API key to limit spend or usage."
					/>

					{/* 8. Support */}
					<FAQItem
						question="Where can I get help or request new features?"
						answer="You can open issues on GitHub for public discussion, or submit a private support ticket from the dashboard, also you can hop into Discord for community support. All issues and feature requests are welcome!"
					/>
				</div>
			</div>
		</section>
	);
}
