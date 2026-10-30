// Endpoint for `"use server"` modules (see build/phaseo-plugins.ts).
import { createFileRoute } from "@tanstack/react-router";
import { handleServerAction } from "@/compat/server-actions-server";

export const Route = createFileRoute("/api/server-actions")({
	server: {
		handlers: {
			POST: ({ request }) => handleServerAction(request),
		},
	},
});
