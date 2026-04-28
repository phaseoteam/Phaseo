import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getLatestModelUpdateCards } from "@/lib/fetchers/updates/getLatestModelUpdates";

export function ExperimentalUpdatesSectionFallback() {
	return (
		<section className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
			<div className="h-40 animate-pulse rounded-[2rem] bg-zinc-100 dark:bg-zinc-900" />
			<div className="grid gap-3">
				{Array.from({ length: 3 }).map((_, index) => (
					<div
						key={index}
						className="h-28 animate-pulse rounded-[1.5rem] bg-zinc-100 dark:bg-zinc-900"
					/>
				))}
			</div>
		</section>
	);
}

export default async function ExperimentalUpdatesSection() {
	const updates = await getLatestModelUpdateCards(3, false);

	return (
		<section className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
			<div className="space-y-4">
				<p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500 dark:text-zinc-400">
					Latest model movement
				</p>
				<h2 className="max-w-md text-4xl font-semibold tracking-[-0.06em] text-zinc-950 dark:text-zinc-50">
					A short market read, not another content block.
				</h2>
				<p className="max-w-md text-sm leading-7 text-zinc-600 dark:text-zinc-300">
					The experimental version ends this section with a tighter update strip so
					the page keeps momentum instead of collapsing into more generic cards.
				</p>
				<Link
					href="/updates"
					className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
				>
					View all model updates
					<ArrowRight className="h-4 w-4" />
				</Link>
			</div>

			<div className="grid gap-3">
				{updates.map((update) => (
					<Link
						key={String(update.id)}
						href={update.link.href}
						className="group rounded-[1.7rem] border border-zinc-200/80 bg-white px-4 py-4 shadow-[0_14px_40px_rgba(24,22,18,0.04)] transition-colors hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-950/78 dark:hover:border-zinc-700"
					>
						<div className="flex items-center gap-4">
							<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-950">
								{update.avatar ? (
									<div className="relative h-5 w-5">
										<Logo
											id={update.avatar.organisationId}
											alt={update.avatar.name ?? update.avatar.organisationId}
											fill
											className="object-contain"
										/>
									</div>
								) : null}
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-center gap-2">
									{update.badges?.[0] ? (
										<span className={update.badges[0].className}>
											{update.badges[0].label}
										</span>
									) : null}
									{update.dateIso ? (
										<span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
											{new Date(update.dateIso).toLocaleDateString(undefined, {
												month: "short",
												day: "numeric",
												year: "numeric",
											})}
										</span>
									) : null}
								</div>
								<h3 className="mt-2 truncate text-lg font-semibold tracking-[-0.03em] text-zinc-950 group-hover:text-zinc-700 dark:text-zinc-50 dark:group-hover:text-zinc-300">
									{update.title}
								</h3>
								<p className="mt-1 truncate text-sm text-zinc-500 dark:text-zinc-400">
									{update.subtitle}
								</p>
							</div>
							<ArrowRight className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-hover:translate-x-0.5 dark:text-zinc-400" />
						</div>
					</Link>
				))}
			</div>
		</section>
	);
}
