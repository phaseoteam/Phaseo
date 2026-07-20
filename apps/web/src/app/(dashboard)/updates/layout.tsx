"use client";

import { ReactNode } from "react";
import UpdateTabs from "@/components/updates/UpdateTabs";

export default function UpdatesLayout({ children }: { children: ReactNode }) {
	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto flex-1 px-4 py-4">
				<div className="mt-6 space-y-3">
					<h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-4xl">
						Stay on top of the latest in AI
					</h1>
				</div>

				<UpdateTabs />

				<div className="my-4">{children}</div>
			</div>
		</main>
	);
}
