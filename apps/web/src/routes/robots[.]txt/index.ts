import { createFileRoute } from "@tanstack/react-router";
import { robotsTxtResponse } from "@/lib/seo/robots";

export const Route = createFileRoute("/robots.txt/")({
	server: {
		handlers: {
			GET: () => robotsTxtResponse(),
		},
	},
});
