// Build-time compiled blog posts (see phaseo:announcement-mdx in vite/plugins.ts).
import type { ComponentType } from "react";
import { announcementModules } from "virtual:phaseo-announcement-mdx";
import type { BlogTocItem } from "@/lib/content/blogToc";

export type CompiledAnnouncement = {
	default: ComponentType<{ components?: Record<string, unknown> }>;
	toc: BlogTocItem[];
};

const loaded = new Map<string, Promise<CompiledAnnouncement>>();

/** A stable promise per post, safe to pass to React's use(). */
export function loadCompiledAnnouncement(sourceKey: string): Promise<CompiledAnnouncement> {
	let pending = loaded.get(sourceKey);
	if (!pending) {
		const load = (announcementModules as Record<string, () => Promise<CompiledAnnouncement>>)[sourceKey];
		pending = load ? load() : Promise.reject(new Error(`No compiled announcement for ${sourceKey}`));
		loaded.set(sourceKey, pending);
		pending.catch(() => loaded.delete(sourceKey));
	}
	return pending;
}
