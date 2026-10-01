"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

export type ModelFaqAccordionItem = {
	question: string;
	answer: ReactNode;
};

export default function ModelFaqAccordion({
	items,
}: {
	items: ModelFaqAccordionItem[];
}) {
	const [openItems, setOpenItems] = useState<Record<number, boolean>>({});

	const toggleItem = (index: number) => {
		setOpenItems((current) => ({
			...current,
			[index]: !current[index],
		}));
	};

	return (
		<div className="divide-y divide-border/60 border-y border-border/60">
			{items.map((item, index) => {
				const isOpen = Boolean(openItems[index]);
				const triggerId = `model-faq-trigger-${index}`;
				const panelId = `model-faq-panel-${index}`;

				return (
					<div key={item.question}>
						<h3>
							<button
								id={triggerId}
								type="button"
								aria-expanded={isOpen}
								aria-controls={panelId}
								onClick={() => toggleItem(index)}
								className="flex w-full items-center justify-between gap-4 py-3 text-left text-sm font-medium outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
							>
								<span>{item.question}</span>
								<span
									aria-hidden="true"
									className={`shrink-0 text-muted-foreground transition-transform duration-[320ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${isOpen ? "rotate-90" : "rotate-0"}`}
								>
									<ChevronRight className="h-4 w-4" />
								</span>
							</button>
						</h3>
						<div
							id={panelId}
							role="region"
							aria-labelledby={triggerId}
							aria-hidden={!isOpen}
							inert={isOpen ? undefined : true}
							className={`grid transition-[grid-template-rows,opacity] duration-[320ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
						>
							<div className="overflow-hidden">
								<p className="w-full pb-4 pr-8 text-sm leading-6 text-muted-foreground">
									{item.answer}
								</p>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
