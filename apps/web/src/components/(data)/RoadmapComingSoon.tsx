// components/common/RoadmapComingSoon.tsx
"use client";

import ComingSoon, { type ComingSoonProps } from "./ComingSoon";
import { getMilestone } from "@/lib/roadmap";
import { Infinity as InfinityIcon } from "lucide-react";

type RoadmapComingSoonProps = {
	milestoneKey: string;
	overrides?: Partial<ComingSoonProps>; // optional tweaks per page
};

export default function RoadmapComingSoon({
	milestoneKey,
	overrides,
}: RoadmapComingSoonProps) {
	const m = getMilestone(milestoneKey);

	if (!m) {
		// Fallback if unknown key (keeps page from breaking)
		return (
			<ComingSoon
				title="Coming soon"
				subtitle="This page is under active development."
				description="We’re shipping fast. Check back shortly or see the full roadmap."
				primaryAction={{ label: "View roadmap", href: "/roadmap" }}
				align="center"
				{...overrides}
			/>
		);
	}

	// Adapt roadmap fields to ComingSoon props
	const base: ComingSoonProps = {
		title: m.title,
		subtitle:
			m.status === "Ongoing"
				? "Continuous improvements ahead"
				: m.status === "In Progress"
				? "Currently being built"
				: m.status === "Beta"
				? "Available in beta"
				: "Planned feature",
		description: m.description,
		eta: m.due, // strings like "Nov 2025" render nicely in ComingSoon
		icon:
			m.icon === "Infinity" ? (
				<InfinityIcon className="h-5 w-5" />
			) : undefined,
		// Optional extras if you add them in the roadmap data later:
		// featureList: m.featureList,
		// tags: m.tags,
		breadcrumb: [
			{ label: "Phaseo", href: "/" },
			{ label: "Roadmap", href: "/roadmap" },
			{ label: m.title },
		],
		primaryAction: {
			label: "See roadmap item",
			href: `/roadmap#milestone-${m.key}`,
		},
		secondaryAction: { label: "Go Home", href: "/" },
		align: "center",
		variant: "minimal",
	};

	return <ComingSoon {...base} {...overrides} />;
}
