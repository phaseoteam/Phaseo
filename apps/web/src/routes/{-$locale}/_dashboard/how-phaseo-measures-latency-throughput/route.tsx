// Next: src/app/[locale]/(dashboard)/how-phaseo-measures-latency-throughput/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/how-phaseo-measures-latency-throughput/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/how-phaseo-measures-latency-throughput")({
	component: nextLayoutComponent(Layout),
});
