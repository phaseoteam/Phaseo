import * as React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { SummaryCard } from "./summary-card";
import { formatNumber } from "./utils";
import type { Summary } from "./types";

interface SummarySectionProps {
	summary: Summary | null;
	onGenerateWrapped: () => void;
}

export default function SummarySection({
	summary,
	onGenerateWrapped,
}: SummarySectionProps) {
	const canGenerate = summary !== null;

	return (
		<section className="space-y-6">
			<div className="flex flex-col items-center justify-center gap-6 py-12">
				<h2 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 text-center">
					Ready to relive your AI year?
				</h2>
				<Button
					size="lg"
					disabled={!canGenerate}
					className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500 px-8 py-6 text-white shadow-lg shadow-purple-500/30 transition hover:shadow-xl hover:shadow-purple-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
					onClick={onGenerateWrapped}
				>
					<span>View my AI Stats Wrapped</span>
					<ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
				</Button>
			</div>
		</section>
	);
}
