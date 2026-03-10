// components/header/Header.tsx  (STATIC)
import Link from "next/link";
import { Suspense } from "react";
import AuthControls from "./AuthControls";
import MainNav from "./MainNav";
import { SearchWrapper } from "./Search/SearchWrapper";
import { HeaderAnnouncements } from "./HeaderAnnouncements";
import { Skeleton } from "@/components/ui/skeleton";
import HeaderShell from "./HeaderShell";

const releaseMessage = "Introducing AI Stats Gateway";
const docsLink = "https://docs.ai-stats.phaseo.app/v1";
const showHeaderAnnouncement = false;

export default function Header() {
	const headerContent = (
		<div className="flex h-16 items-center justify-between gap-6">
			<div className="flex min-w-0 flex-1 items-center gap-5 overflow-hidden">
				<Link
					href="/"
					className="flex shrink-0 items-center text-2xl font-semibold tracking-tight"
				>
					<img
						src="/wordmark_light.svg"
						alt="AI Stats"
						className="h-10 select-none dark:hidden"
					/>
					<img
						src="/wordmark_dark.svg"
						alt="AI Stats"
						className="hidden h-10 select-none dark:block"
					/>
				</Link>
				<div className="hidden h-6 w-px bg-zinc-200/70 dark:bg-zinc-800 lg:block" />
				<div className="hidden max-w-full lg:block">
					<Suspense
						fallback={
							<div className="flex items-center gap-1.5">
								<Skeleton className="h-10 w-24 rounded-lg" />
								<Skeleton className="h-10 w-16 rounded-lg" />
								<Skeleton className="h-10 w-24 rounded-lg" />
								<Skeleton className="h-10 w-20 rounded-lg" />
								<Skeleton className="h-10 w-16 rounded-lg" />
							</div>
						}
					>
						<MainNav />
					</Suspense>
				</div>
			</div>

			<div className="hidden shrink-0 items-center gap-3 lg:flex">
				<Suspense
					fallback={<Skeleton className="h-10 w-[15rem] rounded-lg" />}
				>
					<SearchWrapper className="w-[13rem] xl:w-[15rem]" />
				</Suspense>
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

			<div className="lg:hidden">
				<Suspense fallback={<Skeleton className="h-10 w-10 rounded-lg" />}>
					<AuthControls variant="mobile" />
				</Suspense>
			</div>
		</div>
	);

	return (
		<header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur dark:bg-zinc-950/80">
			<Suspense
				fallback={
					<div className="mx-auto w-full max-w-full px-4 [view-transition-name:site-header-shell] sm:max-w-[640px] md:max-w-[768px] lg:max-w-[1024px] xl:max-w-[1280px] 2xl:max-w-[1536px]">
						{headerContent}
					</div>
				}
			>
				<HeaderShell>{headerContent}</HeaderShell>
			</Suspense>

			{showHeaderAnnouncement ? (
				<HeaderAnnouncements
					message={releaseMessage}
					href="/gateway"
					tertiaryLabel="Read the docs"
					tertiaryHref={docsLink}
					label="New release"
				/>
			) : null}
		</header>
	);
}



