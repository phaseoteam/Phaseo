"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import SummarySection from "@/components/wrapped/summary-section";
import ShowcaseModal from "@/components/wrapped/showcase-modal";
import { SlideLayout } from "@/components/wrapped/slide-layout";
import { SummaryCard } from "@/components/wrapped/summary-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Sparkles,
	ArrowRight,
	Loader2,
	CheckCircle2,
	ArrowLeft,
	X,
	Download,
	Share2,
	MessageSquare,
	FileText,
	Calendar,
	Clock,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
	PROVIDERS,
	DAY_NAMES,
	aggregateSummary,
	formatNumber,
} from "@/components/wrapped/utils";
import type {
	ProviderKey,
	ProviderConfig,
	ProviderMetrics,
	ProviderState,
	Summary,
	Slide,
} from "@/components/wrapped/types";

// Stub for Supabase RPC call
const fetchUserStats = async (): Promise<Summary | null> => {
	// TODO: Replace with actual Supabase RPC call
	// const { data, error } = await supabase.rpc('get_user_ai_stats');
	// if (error) throw error;
	// return data;

	// For now, return mock data
	return {
		totalTokens: 125000,
		totalMessages: 2500,
		totalWords: 50000,
		totalMinutes: 120,
		averageResponseSeconds: 2.5,
		topHour: 14,
		topDay: "Wednesday",
		providersBreakdown: [
			{ key: "chatgpt", name: "ChatGPT", tokens: 75000, messages: 1500, responseMinutes: 75, accent: "from-green-500 to-emerald-500", description: "OpenAI's ChatGPT" },
			{ key: "claude", name: "Claude", tokens: 35000, messages: 800, responseMinutes: 35, accent: "from-orange-500 to-red-500", description: "Anthropic's Claude" },
			{ key: "gemini", name: "Gemini", tokens: 15000, messages: 200, responseMinutes: 10, accent: "from-blue-500 to-cyan-500", description: "Google's Gemini" },
		],
		longestThread: { messages: 45, provider: "chatgpt" },
		largestPrompt: { words: 1250, provider: "claude" },
		bestStreak: { days: 7, provider: "chatgpt" },
		topWords: ["help", "create", "analyze", "explain", "generate"],
		funFact: "You asked more questions than you gave answers this year!",
		emojiMood: "🤖",
	};
};

export default function WrappedClient() {
	const [summary, setSummary] = useState<Summary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [showcaseOpen, setShowcaseOpen] = useState(false);
	const [showcaseStep, setShowcaseStep] = useState(0);

	useEffect(() => {
		const loadStats = async () => {
			try {
				setLoading(true);
				const stats = await fetchUserStats();
				setSummary(stats);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load stats");
			} finally {
				setLoading(false);
			}
		};

		loadStats();
	}, []);

	useEffect(() => {
		if (showcaseOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}

		return () => {
			document.body.style.overflow = "";
		};
	}, [showcaseOpen]);

	const slides: Slide[] = useMemo(() => {
		if (!summary) return [];

		const topProvider = summary.providersBreakdown[0];
		const topHourFormatted = `${
			summary.topHour === 0
				? "12"
				: summary.topHour > 12
				? summary.topHour - 12
				: summary.topHour
		}${summary.topHour >= 12 ? "PM" : "AM"}`;

		return [
			{
				title: "Your AI Year In Numbers",
				subtitle: `A ${summary.emojiMood} story told across every conversation.`,
				accent: "from-indigo-500/80 via-purple-500/60 to-rose-500/80",
				content: (
					<div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
						<SummaryCard
							title="Tokens traded"
							value={formatNumber(summary.totalTokens)}
							icon={<Sparkles className="h-5 w-5" />}
							footnote="All models combined"
						/>
						<SummaryCard
							title="Messages sent"
							value={formatNumber(summary.totalMessages)}
							icon={<ArrowRight className="h-5 w-5" />}
							footnote={`~${summary.totalWords.toLocaleString()} words`}
						/>
						<SummaryCard
							title="Time invested"
							value={`${summary.totalMinutes.toLocaleString()} min`}
							icon={<Loader2 className="h-5 w-5" />}
							footnote={`${summary.averageResponseSeconds}s avg response`}
						/>
						<SummaryCard
							title="Top collaborator"
							value={topProvider?.name ?? "--"}
							icon={<CheckCircle2 className="h-5 w-5" />}
							footnote={`${formatNumber(
								topProvider?.tokens ?? 0
							)} tokens shared`}
						/>
					</div>
				),
			},
			{
				title: "How You Split The Work",
				subtitle: "Who you called on, and how often they showed up.",
				accent: "from-emerald-500/80 via-sky-500/60 to-indigo-500/70",
				content: (
					<div className="grid gap-6 md:grid-cols-2">
						<div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-inner backdrop-blur dark:border-zinc-800/60 dark:bg-zinc-900/60">
							<h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
								Tokens by provider
							</h3>
							<div className="mt-4 space-y-4">
								{summary.providersBreakdown.map(
									({ key, name, tokens, accent }) => {
										const percent =
											(tokens /
												Math.max(
													summary.totalTokens,
													1
												)) *
											100;
										return (
											<div key={key}>
												<div className="flex justify-between text-sm font-medium text-zinc-700 dark:text-zinc-200">
													<span>{name}</span>
													<span>
														{percent.toFixed(1)}%
													</span>
												</div>
												<div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-zinc-200/60 dark:bg-zinc-800/60">
													<div
														className={cn(
															"h-full rounded-full bg-gradient-to-r",
															accent
														)}
														style={{
															width: `${Math.max(
																percent,
																4
															)}%`,
														}}
													/>
												</div>
											</div>
										);
									}
								)}
							</div>
						</div>
						<div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-inner backdrop-blur dark:border-zinc-800/60 dark:bg-zinc-900/60">
							<h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
								Fun facts
							</h3>
							<ul className="mt-4 space-y-4 text-sm text-zinc-600 dark:text-zinc-300">
								<li>
									<span className="font-semibold text-zinc-900 dark:text-zinc-100">
										Longest thread
									</span>{" "}
									went{" "}
									{summary.longestThread.messages.toLocaleString()}{" "}
									messages with{" "}
									{
										PROVIDERS.find(
											(p) =>
												p.key ===
												summary.longestThread.provider
										)?.name
									}
									.
								</li>
								<li>
									<span className="font-semibold text-zinc-900 dark:text-zinc-100">
										Boldest prompt
									</span>{" "}
									clocked{" "}
									{summary.largestPrompt.words.toLocaleString()}{" "}
									words with{" "}
									{
										PROVIDERS.find(
											(p) =>
												p.key ===
												summary.largestPrompt.provider
										)?.name
									}
									.
								</li>
								<li>
									<span className="font-semibold text-zinc-900 dark:text-zinc-100">
										Streak legend
									</span>{" "}
									spent {summary.bestStreak.days} straight
									days with{" "}
									{
										PROVIDERS.find(
											(p) =>
												p.key ===
												summary.bestStreak.provider
										)?.name
									}
									.
								</li>
							</ul>
						</div>
					</div>
				),
			},
			{
				title: "When Inspiration Struck",
				subtitle: `Most active on ${summary.topDay}, especially around ${topHourFormatted}.`,
				accent: "from-rose-500/80 via-orange-400/60 to-amber-300/70",
				content: (
					<div className="grid gap-6 lg:grid-cols-2">
						<div className="rounded-3xl border border-white/70 bg-white/80 p-6 backdrop-blur dark:border-zinc-800/60 dark:bg-zinc-900/60">
							<h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
								Schedule heat
							</h3>
							<div className="mt-6 grid grid-cols-2 gap-4">
								<div className="rounded-2xl bg-gradient-to-br from-violet-500/30 via-violet-500/20 to-transparent p-4 text-zinc-900 dark:text-zinc-100">
									<div className="text-xs uppercase tracking-wide text-violet-900/70 dark:text-violet-200">
										Prime day
									</div>
									<div className="mt-2 text-2xl font-semibold">
										{summary.topDay}
									</div>
									<p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
										{formatNumber(
											summary.totalMessages / 7
										)}{" "}
										avg messages that day
									</p>
								</div>
								<div className="rounded-2xl bg-gradient-to-br from-orange-500/20 via-orange-400/20 to-transparent p-4 text-zinc-900 dark:text-zinc-100">
									<div className="text-xs uppercase tracking-wide text-orange-900/70 dark:text-orange-200">
										Power hour
									</div>
									<div className="mt-2 text-2xl font-semibold">
										{topHourFormatted}
									</div>
									<p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
										Responses typically in ~
										{summary.averageResponseSeconds}s
									</p>
								</div>
							</div>
						</div>
						<div className="rounded-3xl border border-white/70 bg-white/80 p-6 backdrop-blur dark:border-zinc-800/60 dark:bg-zinc-900/60">
							<h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
								Favorite vocabulary
							</h3>
							<div className="mt-4 flex flex-wrap gap-2">
								{summary.topWords.map((word) => (
									<Badge
										key={word}
										className="bg-gradient-to-r from-zinc-800 to-zinc-600 text-zinc-50 shadow-md dark:from-zinc-200 dark:to-zinc-400 dark:text-zinc-900"
									>
										#{word}
									</Badge>
								))}
							</div>
							<p className="mt-6 text-sm text-zinc-600 dark:text-zinc-300">
								"You turned {summary.topWords[0]} into your
								trademark. Keep it in the mix for next year's
								prompts."
							</p>
						</div>
					</div>
				),
			},
			{
				title: "Your Favorite Words",
				subtitle:
					"The words that defined your AI conversations this year.",
				accent: "from-purple-500/80 via-pink-500/60 to-rose-500/80",
				content: (
					<div className="grid gap-6 md:grid-cols-2">
						<div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-inner backdrop-blur dark:border-zinc-800/60 dark:bg-zinc-900/60">
							<h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
								Top words
							</h3>
							<div className="mt-4 space-y-3">
								{summary.topWords
									.slice(0, 10)
									.map((word, i) => (
										<div
											key={word}
											className="flex items-center justify-between"
										>
											<span className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
												{word}
											</span>
											<span className="text-sm text-zinc-500 dark:text-zinc-400">
												#{i + 1}
											</span>
										</div>
									))}
							</div>
						</div>
						<div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-inner backdrop-blur dark:border-zinc-800/60 dark:bg-zinc-900/60">
							<h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
								Word insights
							</h3>
							<p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
								Your most used word "{summary.topWords[0]}"
								appeared in conversations with{" "}
								{summary.providersBreakdown[0]?.name}. It seems
								to be a key part of your AI interactions.
							</p>
							<div className="mt-6 flex flex-wrap gap-2">
								{summary.topWords.slice(0, 5).map((word) => (
									<Badge
										key={word}
										className="bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md"
									>
										{word}
									</Badge>
								))}
							</div>
						</div>
					</div>
				),
			},
			{
				title: "Streaks and Records",
				subtitle: "Your most impressive AI achievements this year.",
				accent: "from-blue-500/80 via-cyan-500/60 to-teal-500/80",
				content: (
					<div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
						<SummaryCard
							title="Longest thread"
							value={`${formatNumber(
								summary.longestThread.messages
							)} messages`}
							icon={<MessageSquare className="h-5 w-5" />}
							footnote={`with ${
								PROVIDERS.find(
									(p) =>
										p.key === summary.longestThread.provider
								)?.name
							}`}
						/>
						<SummaryCard
							title="Largest prompt"
							value={`${formatNumber(
								summary.largestPrompt.words
							)} words`}
							icon={<FileText className="h-5 w-5" />}
							footnote={`with ${
								PROVIDERS.find(
									(p) =>
										p.key === summary.largestPrompt.provider
								)?.name
							}`}
						/>
						<SummaryCard
							title="Best streak"
							value={`${summary.bestStreak.days} days`}
							icon={<Calendar className="h-5 w-5" />}
							footnote={`with ${
								PROVIDERS.find(
									(p) => p.key === summary.bestStreak.provider
								)?.name
							}`}
						/>
						<SummaryCard
							title="Avg response time"
							value={`${summary.averageResponseSeconds}s`}
							icon={<Clock className="h-5 w-5" />}
							footnote="Across all conversations"
						/>
					</div>
				),
			},
			{
				title: "Ready To Share Your Story?",
				subtitle: summary.funFact,
				accent: "from-indigo-500/80 via-emerald-500/60 to-sky-500/80",
				content: (
					<div className="grid gap-6 md:grid-cols-2">
						<div className="rounded-3xl border border-white/60 bg-white/70 p-6 text-zinc-800 shadow-inner dark:border-zinc-800/60 dark:bg-zinc-900/60 dark:text-zinc-200">
							<h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
								Share-ready caption
							</h3>
							<p className="mt-3 text-sm leading-relaxed">
								"In {new Date().getFullYear()}, I traded{" "}
								{formatNumber(summary.totalTokens)} tokens
								across {formatNumber(summary.totalMessages)}{" "}
								messages with{" "}
								{summary.providersBreakdown.length} AI copilots.
								We moved fastest around {topHourFormatted}, and
								my go-to muse was {summary.topWords[0]}. What
								did your AI year look like?"
							</p>
						</div>
						<div className="rounded-3xl border border-dashed border-white/60 bg-white/40 p-6 text-sm text-zinc-600 backdrop-blur dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:text-zinc-300">
							<h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
								Tips
							</h3>
							<ul className="mt-3 space-y-2">
								<li>
									- Download assets to keep and share across
									socials.
								</li>
								<li>
									- Use the share button to send a quick recap
									to friends.
								</li>
								<li>
									- Re-run with fresh exports anytime for
									updated insights.
								</li>
							</ul>
						</div>
					</div>
				),
			},
		];
	}, [summary]);

	return (
		<main className="relative mx-auto max-w-6xl space-y-12 px-4 sm:px-6 lg:px-8">
			{loading && (
				<div className="flex items-center justify-center py-12">
					<div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
						<Loader2 className="h-5 w-5 animate-spin" />
						Loading your AI stats...
					</div>
				</div>
			)}

			{error && (
				<div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
					<p className="text-red-800 dark:text-red-200">Error: {error}</p>
				</div>
			)}

			{!loading && !error && summary && (
				<SummarySection
					summary={summary}
					onGenerateWrapped={() => {
						setShowcaseStep(0);
						setShowcaseOpen(true);
					}}
				/>
			)}

			<ShowcaseModal
				isOpen={showcaseOpen}
				step={showcaseStep}
				summary={summary}
				slides={slides}
				onClose={() => setShowcaseOpen(false)}
				onStepChange={setShowcaseStep}
			/>
		</main>
	);
}
