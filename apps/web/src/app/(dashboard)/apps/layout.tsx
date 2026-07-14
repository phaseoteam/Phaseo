import type { Metadata } from "next";

// The public app leaderboard and usage pages are not search landing pages.
// Curated integration discovery is handled by /works-with instead.
export const metadata: Metadata = {
	robots: {
		index: false,
		follow: true,
	},
};

export default function AppsLayout({ children }: LayoutProps<"/apps">) {
	return <>{children}</>;
}
