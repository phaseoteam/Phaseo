import { isAdminViewer } from "@/lib/auth/getViewerRole";
import { readPhaseoEnv } from "@/lib/deployEnv";

export async function canPreviewFutureBlogPosts(): Promise<boolean> {
	if (process.env.NODE_ENV === "development" || readPhaseoEnv() === "preview") {
		return true;
	}

	return isAdminViewer().catch(() => false);
}
