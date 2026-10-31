import type { Metadata } from "@/lib/seo/metadataTypes";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Internal",
	robots: {
		index: false,
		follow: false,
	},
};

export default function InternalLayout({ children }: { children: ReactNode }) {
	return <>{children}</>;
}
