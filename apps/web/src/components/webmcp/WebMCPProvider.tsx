"use client";

import { useEffect } from "react";
import { createPhaseoWebMCPTools } from "@/lib/webmcp/tools";
import "@/lib/webmcp/types";

export default function WebMCPProvider() {
	useEffect(() => {
		const modelContext = document.modelContext;
		if (!modelContext) return;

		const controller = new AbortController();
		for (const tool of createPhaseoWebMCPTools()) {
			void Promise.resolve(
				modelContext.registerTool(tool, { signal: controller.signal }),
			).catch(() => undefined);
		}

		return () => controller.abort();
	}, []);

	return null;
}
