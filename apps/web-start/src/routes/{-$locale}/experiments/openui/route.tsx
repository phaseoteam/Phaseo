// Next: src/app/[locale]/experiments/openui/template.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/experiments/openui/template";


export const Route = createFileRoute("/{-$locale}/experiments/openui")({
	component: nextLayoutComponent(Layout),
});
