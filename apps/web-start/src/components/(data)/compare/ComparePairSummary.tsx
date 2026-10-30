import { useTranslations } from "next-intl";
import Link from "next/link";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { localizePublicPath } from "@/lib/auth/localized-paths";
import type { PublicLocale } from "@/i18n/routing";
import { pairPath } from "./comparePairs";
import { formatUsd, tokenPrice } from "./view/compareViewMath";
import type { ComparePeerBoard, CompareViewModel, CompareViewUsageByModel } from "./view/types";

export type ComparePairLink = { models: [{ id: string; name: string }, { id: string; name: string }] };

type Props = {
	locale: PublicLocale;
	baseUrl: string;
	models: [CompareViewModel, CompareViewModel];
	usage: CompareViewUsageByModel;
	peers: ComparePeerBoard[];
	related: ComparePairLink[];
};

type Faq = { question: string; answer: string };

/**
 * The crawlable half of a pair page: a plain-language summary, an at-a-glance
 * table and answers to the questions people search for, each built only from
 * values the page can show. The interactive comparison sits above it.
 */
export function ComparePairSummary({ locale, baseUrl, models, usage, peers, related }: Props) {
	const t = useTranslations("Catalogue.comparePair");
	const [a, b] = models;
	const count = new Intl.NumberFormat(locale);
	const notListed = t("notListed");
	const input = models.map((model) => tokenPrice(model, "input"));
	const output = models.map((model) => tokenPrice(model, "output"));
	const context = models.map((model) => model.contextWindow?.tokens ?? null);
	const index = peers.find((board) => board.id.startsWith("aa-intelligence-index")) ?? peers[0] ?? null;
	const indexEntries = models.map((model) => index?.entries.find((entry) => entry.modelId === model.id) ?? null);
	const throughput = models.map((model) => usage[model.id]?.throughputP50TokPerSec30m ?? null);
	const routed = models.every((model) => model.providers.length > 0);
	const price = (value: number | null) => (value == null ? notListed : formatUsd(value));
	const tokens = (value: number | null) => (value == null ? notListed : t("tokens", { count: count.format(value) }));

	const describe = (model: CompareViewModel, position: 0 | 1) => {
		const parts = [t("modelFrom", { name: model.name, lab: model.lab.name })];
		if (context[position] != null) parts.push(t("modelContext", { tokens: count.format(context[position]!) }));
		if (input[position] != null && output[position] != null) parts.push(t("modelPrice", { input: formatUsd(input[position]!), output: formatUsd(output[position]!) }));
		return parts.join(" ");
	};

	const faqs: Faq[] = [];
	if (input.every((value) => value != null) && output.every((value) => value != null)) {
		// Each price is compared on its own, so a tie on one never names a winner for it.
		const cheaperIn = input[0] === input[1] ? null : input[0]! < input[1]! ? 0 : 1;
		const cheaperOut = output[0] === output[1] ? null : output[0]! < output[1]! ? 0 : 1;
		const detail = t("faqCheaperDetail", { a: a.name, aIn: formatUsd(input[0]!), aOut: formatUsd(output[0]!), b: b.name, bIn: formatUsd(input[1]!), bOut: formatUsd(output[1]!) });
		const lead = cheaperIn === null && cheaperOut === null
			? t("faqCheaperSame")
			: cheaperIn === null
				? t("faqCheaperOutputOnly", { name: models[cheaperOut!]!.name })
				: cheaperOut === null
					? t("faqCheaperInputOnly", { name: models[cheaperIn]!.name })
					: cheaperIn === cheaperOut
						? t("faqCheaperBoth", { name: models[cheaperIn]!.name })
						: t("faqCheaperSplit", { input: models[cheaperIn]!.name, output: models[cheaperOut]!.name });
		faqs.push({ question: t("faqCheaperQ", { a: a.name, b: b.name }), answer: `${lead} ${detail}` });
	}
	if (context.every((value) => value != null)) {
		const longer = context[0]! >= context[1]! ? 0 : 1;
		faqs.push({
			question: t("faqContextQ", { a: a.name, b: b.name }),
			answer: context[0] === context[1]
				? t("faqContextSame", { tokens: count.format(context[0]!) })
				: t("faqContextA", { longer: models[longer]!.name, long: count.format(context[longer]!), shorter: models[1 - longer]!.name, short: count.format(context[1 - longer]!) }),
		});
	}
	if (index && indexEntries.some(Boolean)) {
		const scored = indexEntries.map((entry, position) => (entry ? { entry, model: models[position]! } : null)).filter((item) => item !== null);
		const ordered = [...scored].sort((left, right) => left.entry.rank - right.entry.rank);
		const describeScore = (item: (typeof ordered)[number]) => t("faqScoreEntry", { name: item.model.name, score: item.entry.score.toFixed(1), rank: item.entry.rank, total: index.total });
		const missing = models.find((model) => !indexEntries[models.indexOf(model)]);
		faqs.push({
			question: t("faqScoreQ", { a: a.name, b: b.name, index: index.name }),
			answer: [
				ordered.length !== 2 ? null
					: ordered[0]!.entry.score === ordered[1]!.entry.score ? t("faqScoreTie", { index: index.name })
					: t("faqScoreLead", { name: ordered[0]!.model.name, index: index.name }),
				ordered.map(describeScore).join(" "),
				missing ? t("faqScoreMissing", { name: missing.name }) : null,
			].filter(Boolean).join(" "),
		});
	}
	// Equal medians have no faster model, so the question is left out.
	if (throughput.every((value) => value != null) && Math.round(throughput[0]!) !== Math.round(throughput[1]!)) {
		const faster = throughput[0]! >= throughput[1]! ? 0 : 1;
		faqs.push({
			question: t("faqSpeedQ", { a: a.name, b: b.name }),
			answer: t("faqSpeedA", { faster: models[faster]!.name, fast: count.format(Math.round(throughput[faster]!)), slower: models[1 - faster]!.name, slow: count.format(Math.round(throughput[1 - faster]!)) }),
		});
	}
	if (routed) faqs.push({ question: t("faqApiQ", { a: a.name, b: b.name }), answer: t("faqApiA") });

	const path = localizePublicPath(locale, pairPath([a.id, b.id]));
	const link = (target: string) => localizePublicPath(locale, target);
	const rows: Array<[string, string, string]> = [
		[t("glanceLab"), a.lab.name, b.lab.name],
		[t("glanceInput"), price(input[0]!), price(input[1]!)],
		[t("glanceOutput"), price(output[0]!), price(output[1]!)],
		[t("glanceContext"), tokens(context[0]!), tokens(context[1]!)],
		[t("glanceMaxOutput"), tokens(a.maxOutput?.tokens ?? null), tokens(b.maxOutput?.tokens ?? null)],
		...(index ? [[index.name, ...indexEntries.map((entry) => (entry ? t("glanceScore", { score: entry.score.toFixed(1), rank: entry.rank }) : notListed))] as [string, string, string]] : []),
	];

	return (
		<section aria-labelledby="pair-summary" className="mx-auto w-full max-w-3xl space-y-10 px-4 pb-16">
			<JsonLdScript
				id="compare-pair-breadcrumbs"
				data={{
					"@context": "https://schema.org",
					"@type": "BreadcrumbList",
					itemListElement: [
						{ "@type": "ListItem", position: 1, name: t("breadcrumbCompare"), item: `${baseUrl}${link("/compare")}` },
						{ "@type": "ListItem", position: 2, name: t("title", { a: a.name, b: b.name }), item: `${baseUrl}${path}` },
					],
				}}
			/>
			{faqs.length ? (
				<JsonLdScript
					id="compare-pair-faq"
					data={{
						"@context": "https://schema.org",
						"@type": "FAQPage",
						mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
					}}
				/>
			) : null}

			<div className="space-y-3 text-sm leading-6 text-muted-foreground">
				<h2 id="pair-summary" className="text-xl font-semibold tracking-tight text-foreground">{t("summaryTitle", { a: a.name, b: b.name })}</h2>
				{routed ? <p>{t("summaryRouted", { a: a.name, b: b.name })}</p> : null}
				<p>{describe(a, 0)}</p>
				<p>{describe(b, 1)}</p>
				<p className="flex flex-wrap gap-x-4">
					<Link href={link(`/models/${a.id}`)} className="text-foreground underline-offset-4 hover:underline">{t("modelLink", { name: a.name })}</Link>
					<Link href={link(`/models/${b.id}`)} className="text-foreground underline-offset-4 hover:underline">{t("modelLink", { name: b.name })}</Link>
				</p>
			</div>

			<div className="space-y-3">
				<h2 className="text-xl font-semibold tracking-tight">{t("glanceTitle", { a: a.name, b: b.name })}</h2>
				<table className="w-full text-left text-sm">
					<caption className="sr-only">{t("glanceCaption", { a: a.name, b: b.name })}</caption>
					<thead className="text-xs text-muted-foreground">
						<tr className="border-b border-border">
							<th scope="col" className="py-2 pr-3 font-normal">{t("glanceAttribute")}</th>
							<th scope="col" className="py-2 pr-3 font-medium text-foreground">{a.name}</th>
							<th scope="col" className="py-2 font-medium text-foreground">{b.name}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map(([label, first, second]) => (
							<tr key={label} className="border-b border-border/60">
								<th scope="row" className="py-2 pr-3 font-normal text-muted-foreground">{label}</th>
								<td className="py-2 pr-3 tabular-nums">{first}</td>
								<td className="py-2 tabular-nums">{second}</td>
							</tr>
						))}
					</tbody>
				</table>
				<p className="text-xs text-muted-foreground">{t("glanceNote")}</p>
			</div>

			{faqs.length ? (
				<div className="space-y-4">
					<h2 className="text-xl font-semibold tracking-tight">{t("faqTitle")}</h2>
					{faqs.map((faq) => (
						<div key={faq.question} className="space-y-1">
							<h3 className="text-sm font-medium">{faq.question}</h3>
							<p className="text-sm leading-6 text-muted-foreground">{faq.answer}</p>
						</div>
					))}
				</div>
			) : null}

			{related.length ? (
				<nav aria-labelledby="pair-related" className="space-y-3">
					<h2 id="pair-related" className="text-xl font-semibold tracking-tight">{t("relatedTitle")}</h2>
					<ul className="grid gap-2 text-sm sm:grid-cols-2">
						{related.map((pair) => (
							<li key={pairPath([pair.models[0].id, pair.models[1].id])}>
								<Link href={link(pairPath([pair.models[0].id, pair.models[1].id]))} className="hover:underline">
									{t("title", { a: pair.models[0].name, b: pair.models[1].name })}
								</Link>
							</li>
						))}
					</ul>
				</nav>
			) : null}
		</section>
	);
}
