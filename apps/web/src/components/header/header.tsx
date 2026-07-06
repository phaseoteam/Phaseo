// components/header/Header.tsx  (STATIC)
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { BookOpenText } from "lucide-react";
import AuthControls from "./AuthControls";
import MainNav from "./MainNav";
import { SearchWrapper } from "./Search/SearchWrapper";
import { HeaderAnnouncements } from "./HeaderAnnouncements";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import HeaderShell from "./HeaderShell";

const releaseMessage = "Introducing Phaseo Gateway";
const docsLink = "https://docs.phaseo.ai/v1";
const showHeaderAnnouncement = false;

export default function Header() {
	const headerContent = (
		<div className="flex h-[var(--site-header-height,4rem)] items-center justify-between gap-[var(--site-header-gap,1.5rem)]">
			<div className="flex min-w-0 flex-1 items-center gap-[var(--site-header-left-gap,1.25rem)] overflow-hidden">
				<Link
					href="/"
					aria-label="Phaseo home"
					className="inline-flex h-[var(--site-header-control-h,2.25rem)] shrink-0 items-center rounded-lg px-[var(--site-header-nav-px,0.75rem)] transition-colors hover:bg-zinc-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:hover:bg-zinc-900/60 dark:focus-visible:ring-zinc-600/50"
				>
					<Image
						src="/wordmark_light.svg"
						alt="Phaseo"
						width={154}
						height={40}
						className="h-[var(--site-header-logo-height,2.5rem)] w-auto select-none dark:hidden"
						style={{ width: "auto" }}
						priority
					/>
					<Image
						src="/wordmark_dark.svg"
						alt="Phaseo"
						width={154}
						height={40}
						className="hidden h-[var(--site-header-logo-height,2.5rem)] w-auto select-none dark:block"
						style={{ width: "auto" }}
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
						<Skeleton className="h-[var(--site-header-control-h,2.5rem)] w-16 rounded-lg" />
					}
				>
					<Link href={docsLink} target="_blank" rel="noreferrer" prefetch={false}>
						<Button
							variant="ghost"
							className="h-[var(--site-header-control-h,2.25rem)] rounded-lg px-2 text-[13px] font-medium text-zinc-600 shadow-none hover:bg-zinc-100/70 xl:px-2.5 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
						>
							<BookOpenText className="h-3.5 w-3.5" />
							Docs
						</Button>
					</Link>
				</Suspense>
				<Suspense
					fallback={
						<Skeleton className="h-[var(--site-header-control-h,2.5rem)] w-[var(--site-header-control-h,2.25rem)] rounded-lg xl:w-[15rem]" />
					}
				>
					<SearchWrapper className="w-[var(--site-header-control-h,2.25rem)] xl:w-[var(--site-header-search-width-xl,15rem)]" />
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
					<div className="w-full max-w-full px-4 lg:px-5 xl:px-6">
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



