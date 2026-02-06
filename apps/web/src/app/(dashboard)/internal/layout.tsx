import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Internal",
	robots: {
		index: false,
		follow: false,
	},
};

export default function InternalLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <>{children}</>;
}
