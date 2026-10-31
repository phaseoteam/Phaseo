import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/{-$locale}/_dashboard/chat/audio/")({
	// Audio moved to Speech; redirect before rendering.
	beforeLoad: ({ params }) => {
		throw redirect({ href: params.locale ? `/${params.locale}/chat/speech` : "/chat/speech" });
	},
});
