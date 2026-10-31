// Sign-in, sign-up and the other account flows are never indexed.
import { createFileRoute } from "@tanstack/react-router";
import { metadataToHead } from "@/lib/start/metadataToHead";

export const Route = createFileRoute("/{-$locale}/_auth")({
	head: () => metadataToHead({ robots: { index: false, follow: false } }),
});
