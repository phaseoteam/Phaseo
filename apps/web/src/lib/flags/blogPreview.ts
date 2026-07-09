import "server-only";

import { connection } from "next/server";
import { isAdminViewer } from "@/lib/auth/getViewerRole";

export async function canPreviewFutureBlogPosts(): Promise<boolean> {
	await connection();

	const vercelEnv = process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV;
	if (process.env.NODE_ENV === "development" || vercelEnv === "preview") {
		return true;
	}

	return isAdminViewer().catch(() => false);
}
