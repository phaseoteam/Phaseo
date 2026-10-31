import { createFileRoute } from "@tanstack/react-router";
import { logoManifestResponse } from "@/lib/logos/manifest";

export const Route = createFileRoute("/logos/manifest.json/")({
	server: {
		handlers: {
			GET: () => logoManifestResponse(),
		},
	},
});
