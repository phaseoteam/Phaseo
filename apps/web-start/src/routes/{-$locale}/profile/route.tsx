// Next: src/app/[locale]/profile/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/profile/layout";


export const Route = createFileRoute("/{-$locale}/profile")({
	component: nextLayoutComponent(Layout),
});
