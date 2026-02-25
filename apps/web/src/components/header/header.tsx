// components/header/Header.tsx  (STATIC)
import Link from "next/link";
import { Suspense } from "react";
import AuthControls from "./AuthControls"; // server island
import MainNav from "./MainNav"; // client-only nav (no data)
import { SearchWrapper } from "./Search/SearchWrapper";
import { ChatIcon } from "./Chat/ChatIcon";
import { RankingsIcon } from "./Rankings/RankingsIcon";
import { HeaderAnnouncements } from "./HeaderAnnouncements";
import { Skeleton } from "@/components/ui/skeleton";
import HeaderShell from "./HeaderShell";

const releaseMessage = "Introducing AI Stats Gateway";
const docsLink = "https://docs.ai-stats.phaseo.app/v1";

export default function Header() {
	const headerContent = (
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
					<Suspense
						fallback={
							<div className="flex items-center gap-1.5">
								<Skeleton className="h-10 w-16 rounded-lg" />
								<Skeleton className="h-10 w-24 rounded-lg" />
								<Skeleton className="h-10 w-16 rounded-lg" />
								<Skeleton className="h-10 w-24 rounded-lg" />
								<Skeleton className="h-10 w-28 rounded-lg" />
							</div>
						}
					>
						<MainNav />
					</Suspense>
				</div>

				{/* keep space for alignment - Search moved to right actions on desktop */}
				<div className="flex-0" />
			</div>

			{/* Right actions: desktop auth + search */}
			<div className="hidden lg:flex items-center gap-3 shrink-0">
				<div className="flex items-center gap-1">
					<RankingsIcon />
					<ChatIcon />
					<SearchWrapper />
				</div>
				<Suspense
					fallback={
						<div className="flex items-center gap-2">
							<Skeleton className="h-9 w-32 rounded-lg" />
							<Skeleton className="h-8 w-8 rounded-lg" />
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
	);

	return (
		<header className="sticky top-0 z-50 border-b bg-white/80 dark:bg-zinc-950/80 backdrop-blur">
			<Suspense
				fallback={
					<div className="mx-auto w-full [view-transition-name:site-header-shell] max-w-full px-4 sm:max-w-[640px] md:max-w-[768px] lg:max-w-[1024px] xl:max-w-[1280px] 2xl:max-w-[1536px]">
						{headerContent}
					</div>
				}
			>
				<HeaderShell>{headerContent}</HeaderShell>
			</Suspense>

			<HeaderAnnouncements
				message={releaseMessage}
				href="/gateway"
				tertiaryLabel="Read the docs"
				tertiaryHref={docsLink}
				label="New Release"
			/>
		</header>
	);
}
