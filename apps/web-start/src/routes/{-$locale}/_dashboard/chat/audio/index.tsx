// Next: src/app/[locale]/(dashboard)/chat/audio/page.tsx (a redirect-only page).
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/{-$locale}/_dashboard/chat/audio/")({
	// Redirect before rendering; Next streamed this redirect from the page body.
	beforeLoad: ({ params }) => {
		throw redirect({ href: params.locale ? `/${params.locale}/chat/speech` : "/chat/speech" });
	},
});
