import Link from "next/link";
import LegalHeaderShell from "@/components/header/LegalHeaderShell";
import LegalBackButton from "@/components/header/LegalBackButton";

export default function LegalLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="min-h-screen bg-background">
			<header className="sticky top-0 z-50 border-b bg-white/80 dark:bg-zinc-950/80 backdrop-blur">
				<LegalHeaderShell>
					<div className="flex w-full items-center justify-between gap-3">
						<LegalBackButton />
						<Link
							href="/"
							aria-label="AI Stats home"
							className="inline-flex items-center transition-opacity hover:opacity-80"
						>
							<img
								src="/wordmark_light.svg"
								alt="AI Stats"
								className="h-8 w-auto select-none dark:hidden"
							/>
							<img
								src="/wordmark_dark.svg"
								alt="AI Stats"
								className="hidden h-8 w-auto select-none dark:block"
							/>
						</Link>
					</div>
				</LegalHeaderShell>
			</header>
			{children}
		</div>
	);
}
