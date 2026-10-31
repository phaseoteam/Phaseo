// Next: src/app/[locale]/share/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/share/layout";


export const Route = createFileRoute("/{-$locale}/share")({
	component: nextLayoutComponent(Layout),
});
