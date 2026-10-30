// Next: src/app/[locale]/(legal)/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(legal)/layout";


export const Route = createFileRoute("/{-$locale}/_legal")({
	component: nextLayoutComponent(Layout),
});
