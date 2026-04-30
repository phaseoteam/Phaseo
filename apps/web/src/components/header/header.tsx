// components/header/Header.tsx  (STATIC)
import Link from "next/link";
import Image from "next/image";
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
		<div className="flex h-[var(--site-header-height,4rem)] items-center justify-between gap-[var(--site-header-gap,1.5rem)]">
			<div className="flex min-w-0 flex-1 items-center gap-[var(--site-header-left-gap,1.25rem)] overflow-hidden">
				<Link
					href="/"
					className="flex shrink-0 items-center text-2xl font-semibold tracking-tight"
				>
					<Image
						src="/wordmark_light.svg"
						alt="AI Stats"
						width={154}
						height={40}
						className="h-[var(--site-header-logo-height,2.5rem)] w-auto select-none dark:hidden"
						priority
					/>
					<Image
						src="/wordmark_dark.svg"
						alt="AI Stats"
						width={154}
						height={40}
						className="hidden h-[var(--site-header-logo-height,2.5rem)] w-auto select-none dark:block"
						priority
					/>
				</Link>
				<div className="hidden h-[var(--site-header-divider-height,1.5rem)] w-px bg-zinc-200/70 dark:bg-zinc-800 lg:block" />
				<div className="hidden max-w-full lg:block">
					<Suspense
						fallback={
							<div className="flex items-center gap-1.5">
								<Skeleton className="h-[var(--site-header-control-h,2.5rem)] w-24 rounded-lg" />
								<Skeleton className="h-[var(--site-header-control-h,2.5rem)] w-16 rounded-lg" />
								<Skeleton className="h-[var(--site-header-control-h,2.5rem)] w-24 rounded-lg" />
								<Skeleton className="h-[var(--site-header-control-h,2.5rem)] w-20 rounded-lg" />
								<Skeleton className="h-[var(--site-header-control-h,2.5rem)] w-16 rounded-lg" />
							</div>
						}
					>
						<MainNav />
					</Suspense>
				</div>
			</div>

			<div className="hidden shrink-0 items-center gap-3 lg:flex">
				<Suspense
					fallback={
						<Skeleton className="h-[var(--site-header-control-h,2.5rem)] w-[15rem] rounded-lg" />
					}
				>
					<SearchWrapper className="w-[var(--site-header-search-width,13rem)] xl:w-[var(--site-header-search-width-xl,15rem)]" />
				</Suspense>
				<Suspense
					fallback={
						<div className="flex items-center gap-2">
							<Skeleton className="h-[calc(var(--site-header-control-h,2.5rem)-0.125rem)] w-32 rounded-lg" />
							<Skeleton className="h-[calc(var(--site-header-control-h,2.5rem)-0.25rem)] w-8 rounded-lg" />
						</div>
					}
				>
					<AuthControls variant="desktop" />
				</Suspense>
			</div>

			<div className="lg:hidden">
				<Suspense
					fallback={
						<Skeleton className="h-[var(--site-header-control-h,2.5rem)] w-[var(--site-header-control-h,2.5rem)] rounded-lg" />
					}
				>
					<AuthControls variant="mobile" />
				</Suspense>
			</div>
		</div>
	);

	return (
		<header
			className="sticky z-50 border-b bg-white/80 backdrop-blur dark:bg-zinc-950/80"
			style={{ top: "var(--site-notice-height, 0px)" }}
		>
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
					href="/"
					tertiaryLabel="Read the docs"
					tertiaryHref={docsLink}
					label="New release"
				/>
			) : null}
		</header>
	);
}



