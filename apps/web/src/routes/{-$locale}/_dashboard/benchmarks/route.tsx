// Next: src/app/[locale]/(dashboard)/benchmarks/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/benchmarks/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/benchmarks")({
	component: nextLayoutComponent(Layout),
});
