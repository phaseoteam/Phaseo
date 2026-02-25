// app/(dashboard)/layout.tsx
import { Suspense } from "react";
import Header from "@/components/header/header";
import Footer from "@/components/footer";
import { createClient } from "@/utils/supabase/server";

function DashboardFrame({
	children,
	obfuscateInfo,
}: {
	children: React.ReactNode;
	obfuscateInfo: boolean;
}) {
	return (
		<div
			id="dashboard-shell"
			data-obfuscate-pii={obfuscateInfo ? "true" : "false"}
			className="flex min-h-dvh flex-col"
		>
			<Header />
			<main className="flex-1 flex flex-col">{children}</main>
			<Footer />
		</div>
	);
}

async function DashboardFrameWithObfuscation({
	children,
}: {
	children: React.ReactNode;
}) {
	const supabase = await createClient();
	const { data: authData } = await supabase.auth.getUser();
	const authUser = authData.user;

	let obfuscateInfo = false;
	if (authUser?.id) {
		const { data } = await supabase
			.from("users")
			.select("obfuscate_info")
			.eq("user_id", authUser.id)
			.maybeSingle();
		obfuscateInfo = Boolean(data?.obfuscate_info);
	}

	return <DashboardFrame obfuscateInfo={obfuscateInfo}>{children}</DashboardFrame>;
}

export default function SiteTemplate({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<Suspense fallback={<DashboardFrame obfuscateInfo={false}>{children}</DashboardFrame>}>
			<DashboardFrameWithObfuscation>{children}</DashboardFrameWithObfuscation>
		</Suspense>
	);
}
