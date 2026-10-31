// The locale's full message catalogue for RootIntlProvider. The URL carries
// the build ID, so responses are immutable for a deployment.
import { createFileRoute } from "@tanstack/react-router";
import { getPublicMessages } from "@/i18n/messages";
import { isPublicLocale } from "@/i18n/locales";

export const Route = createFileRoute("/api/i18n-full/$locale")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!isPublicLocale(params.locale)) return new Response("Not found", { status: 404 });
				const messages = await getPublicMessages(params.locale);
				return new Response(JSON.stringify(messages), {
					headers: {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "public, max-age=31536000, immutable",
					},
				});
			},
		},
	},
});
