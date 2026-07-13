import type { Metadata } from "next";
import type { ReactNode } from "react";

// The public app leaderboard and usage pages are not search landing pages.
// Curated integration discovery is handled by /works-with instead.
export const metadata: Metadata = {
	robots: {
		index: false,
		follow: true,
	},
};

export default function AppsLayout({ children }: { children: ReactNode }) {
	return children;
}
