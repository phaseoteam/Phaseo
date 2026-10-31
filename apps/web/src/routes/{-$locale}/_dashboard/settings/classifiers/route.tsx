// Next: src/app/[locale]/(dashboard)/settings/classifiers/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/settings/classifiers/layout";
import { notFound } from "next/navigation";
import { settingsFlagQuery } from "@/app/[locale]/(dashboard)/settings/settings.functions";


export const Route = createFileRoute("/{-$locale}/_dashboard/settings/classifiers")({
	beforeLoad: async ({ context }) => {
		if (!(await context.queryClient.ensureQueryData(settingsFlagQuery("requestClassifiers", { safe: true })))) notFound();
	},
	component: nextLayoutComponent(Layout),
});
