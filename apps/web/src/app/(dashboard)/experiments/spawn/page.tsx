import type { Metadata } from "next";
import SpawnClient from "@/components/(experiments)/SpawnClient";
import ShowFooterStyle from "@/components/layout/ShowFooterStyle";

export const metadata: Metadata = {
	title: "Experiments Spawn+ (BYOC) - AI Stats",
	description:
		"Configure Spawn+ BYOC workflows, generate CLI commands, and run bootstrap setup scripts without using a provisioning API.",
	keywords: ["Experiments Spawn+", "BYOC", "CLI", "AI Stats"],
	alternates: {
		canonical: "/experiments/spawn",
	},
};

export default function SpawnPage() {
	return (
		<>
			<ShowFooterStyle />
			<SpawnClient />
		</>
	);
}
