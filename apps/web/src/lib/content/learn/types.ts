export type LearnLevel = "beginner" | "developer" | "admin";

export type LearnQuiz = {
	question: string;
	options: string[];
	/** Index into `options`. */
	answer: number;
	/** Shown after the learner checks their answer, whichever option they picked. */
	explanation: string;
};

export type LearnScenario = {
	/** A short, realistic situation the learner has to reason about. */
	prompt: string;
	/** Revealed on request. */
	answer: string;
};

export type LearnLink = {
	label: string;
	/** Absolute https://phaseo.app/... URL, or a site path such as /settings/keys. */
	href: string;
};

export type LearnLesson = {
	slug: string;
	title: string;
	/** One sentence shown under the title and in course outlines. */
	summary: string;
	minutes: number;
	/** Markdown. Short: two to five paragraphs, lists and code blocks allowed. */
	body: string;
	/** Set when the lesson teaches an Alpha or Beta feature. */
	stage?: "alpha" | "beta";
	quiz: LearnQuiz;
	scenario: LearnScenario;
	takeaway: string;
	links: LearnLink[];
	/** ISO date the content was last checked against the product. */
	updated: string;
};

export type LearnCourse = {
	slug: string;
	title: string;
	summary: string;
	level: LearnLevel;
	/** e.g. "No code" or "Any language". */
	format: string;
	prerequisites: string[];
	lessons: LearnLesson[];
};

export type LearnPath = {
	slug: string;
	title: string;
	/** Who it's for, one sentence. */
	audience: string;
	/** Ordered lesson references as "course-slug/lesson-slug". */
	lessons: string[];
};
