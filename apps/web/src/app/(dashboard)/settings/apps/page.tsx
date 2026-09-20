import AppsSettingsContent from "./AppsSettingsContent";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";

const ATTRIBUTION_DOCS_HREF =
	"https://phaseo.app/docs/v1/guides/app-attribution";

export const metadata = {
	title: "Apps - Settings",
};

export default function AppsSettingsPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Apps"
				description="Manage application metadata and public visibility for your workspace."
				actions={
					<Button
						asChild
						variant="outline"
						size="sm"
						className="h-10 rounded-md"
					>
						<Link
							href={ATTRIBUTION_DOCS_HREF}
							target="_blank"
							rel="noreferrer"
						>
							Request Attribution Docs
							<ArrowUpRight className="ml-1 h-4 w-4" />
						</Link>
					</Button>
				}
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AppsSettingsContent />
			</Suspense>
		</div>
	);
}
