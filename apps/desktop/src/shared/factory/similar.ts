import type { SimilarItem, WorkItem } from "./types";

/**
 * Finds issues that read like another one by comparing their words, weighted so rare words count for
 * more than common ones (TF-IDF with cosine similarity). It needs no agent, so it runs whenever an
 * issue is opened, and Triage gets the closest few to judge.
 */

const STOP = new Set("a an and are as at be but by can do does for from has have how i if in into is it its me my no not of on or our so than that the their them then there these they this to too up us was we were what when where which while who why will with you your should would could just only also get got use used using after before again still".split(" "));

/** "tokens" and "token" are the same word here. Short words and ones like "class" keep their s. */
const singular = (word: string) => (word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);

/** Words worth comparing: lower case and singular, without links, comments, or very short or common words. */
export function words(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/https?:\/\/\S+/g, " ")
		.split(/[^a-z0-9_.$]+/)
		.map((word) => word.replace(/^[.$]+|[.$]+$/g, ""))
		.filter((word) => word.length > 2 && word.length < 40 && !STOP.has(word) && !/^\d+$/.test(word))
		.map(singular);
}

/** The title says what the issue is about, so its words count three times. */
function document(item: Pick<WorkItem, "title" | "body">): string[] {
	const title = words(item.title);
	return [...title, ...title, ...title, ...words(item.body.slice(0, 4_000))];
}

/** Below this, issues usually only share an area of the code, not a problem: shown to people only above it. */
export const SIMILAR_THRESHOLD = 0.25;

/**
 * Triage reads meaning, not words, so it gets a wider shortlist: a duplicate told in other words
 * ("$10.5 on receipts" for "prices drop the trailing zero") scores about 0.1.
 */
export const TRIAGE_THRESHOLD = 0.05;

/** Issues in the same repository that read like `item`, most alike first. */
export function similarIssues(item: WorkItem, items: WorkItem[], limit = 5, threshold = SIMILAR_THRESHOLD): SimilarItem[] {
	const others = items.filter((candidate) => candidate.kind === "issue" && candidate.repo === item.repo && candidate.id !== item.id);
	if (!others.length) return [];
	const docs = [item, ...others].map((entry) => document(entry));
	// How many issues each word appears in: a word in every issue says nothing.
	const seen = new Map<string, number>();
	for (const doc of docs) for (const word of new Set(doc)) seen.set(word, (seen.get(word) ?? 0) + 1);
	const weigh = (doc: string[]) => {
		const counts = new Map<string, number>();
		for (const word of doc) counts.set(word, (counts.get(word) ?? 0) + 1);
		const vector = new Map<string, number>();
		let norm = 0;
		for (const [word, count] of counts) {
			const weight = (1 + Math.log(count)) * Math.log((docs.length + 1) / (seen.get(word) ?? 1));
			vector.set(word, weight);
			norm += weight * weight;
		}
		return { vector, norm: Math.sqrt(norm) };
	};
	const target = weigh(docs[0]!);
	if (!target.norm) return [];
	return others
		.map((other, index) => {
			const { vector, norm } = weigh(docs[index + 1]!);
			let dot = 0;
			for (const [word, weight] of target.vector) dot += weight * (vector.get(word) ?? 0);
			return { id: other.id, number: other.number, title: other.title, state: other.state, score: norm ? dot / (target.norm * norm) : 0 };
		})
		.filter((entry) => entry.score >= threshold)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}
