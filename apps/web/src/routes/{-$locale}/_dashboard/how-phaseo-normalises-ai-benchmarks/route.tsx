// Next: src/app/[locale]/(dashboard)/how-phaseo-normalises-ai-benchmarks/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/how-phaseo-normalises-ai-benchmarks/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/how-phaseo-normalises-ai-benchmarks")({
	component: nextLayoutComponent(Layout),
});
