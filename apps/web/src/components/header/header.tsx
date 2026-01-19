// components/header/Header.tsx  (STATIC)
import Link from "next/link";
import { Suspense } from "react";
import AuthControls from "./AuthControls"; // server island
import MainNav from "./MainNav"; // client-only nav (no data)
import { SearchWrapper } from "./Search/SearchWrapper";
import { ChatIcon } from "./Chat/ChatIcon";
import { HeaderAnnouncements } from "./HeaderAnnouncements";
import { Skeleton } from "@/components/ui/skeleton";

const releaseMessage = "AI Stats Gateway is now the Conduit";
const changelogLink =
	"https://docs.ai-stats.phaseo.app/v1/changelog#ai-stats-gateway-is-now-the-conduit";

export default function Header() {
	return (
		<header className="sticky top-0 z-50 border-b bg-white/80 dark:bg-zinc-950/80 backdrop-blur">
			<div className="container mx-auto px-4">
				<div className="flex h-16 items-center justify-between">
					{/* Brand + Desktop Nav */}
					<div className="flex flex-1 items-center gap-5 overflow-hidden">
						<Link
							href="/"
							className="flex items-center text-2xl font-semibold tracking-tight"
						>
							<img
								src="/wordmark_light.svg"
								alt="AI Stats"
								className="h-10 select-none dark:hidden"
							/>
							<img
								src="/wordmark_dark.svg"
								alt="AI Stats"
								className="h-10 select-none dark:block hidden"
							/>
						</Link>
						<div className="hidden lg:block h-6 w-px bg-zinc-200/70 dark:bg-zinc-800" />
						<div className="hidden lg:block max-w-full">
							<MainNav />
						</div>

						{/* keep space for alignment - Search moved to right actions on desktop */}
						<div className="flex-0" />
					</div>

					{/* Right actions: desktop auth + search */}
					<div className="hidden lg:flex items-center gap-3 shrink-0">
						<div className="flex items-center gap-1">
							<ChatIcon />
							<SearchWrapper />
						</div>
						<Suspense
							fallback={
								<div className="flex items-center gap-2">
									<Skeleton className="h-10 w-32 rounded-lg" />
									<div className="relative">
										<Skeleton className="h-10 w-10 rounded-lg" />
										<Skeleton className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full" />
									</div>
								</div>
							}
						>
							<AuthControls variant="desktop" />
						</Suspense>
					</div>

					{/* Mobile: menu/auth drawer trigger */}
					<div className="lg:hidden">
						<Suspense
							fallback={
								<Skeleton className="h-10 w-10 rounded-lg" />
							}
						>
							<AuthControls variant="mobile" />
						</Suspense>
					</div>
				</div>
			</div>

			<HeaderAnnouncements
				message={releaseMessage}
				href="/conduit"
				secondaryLabel="Read more in the changelog"
				secondaryHref={changelogLink}
				label="New Release"
			/>
		</header>
	);
}
