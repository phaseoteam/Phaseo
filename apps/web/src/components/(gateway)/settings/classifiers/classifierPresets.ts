import type { ClassifierDimension } from "./requestClassifiers";

// Starting taxonomies. Keys, values and descriptions are what the classifier
// model reads, so they stay in English; only the preset's title and summary
// are translated (SettingsUI.classifiers.presets.<id>).

export type ClassifierPresetId = "department" | "audience" | "task_type" | "engineering_work" | "agent_complexity" | "compliance";

export type ClassifierPreset = {
	id: ClassifierPresetId;
	dimensions: ClassifierDimension[];
	instructions?: string;
};

function values(entries: Array<[string, string]>) {
	return entries.map(([value, description]) => ({ value, description }));
}

export const CLASSIFIER_PRESETS: ClassifierPreset[] = [
	{
		id: "department",
		dimensions: [{
			key: "department", name: "Department", description: "The business function the request is for.", multiple: false, allow_other: true,
			values: values([
				["engineering", "Software development, infrastructure, data engineering"],
				["sales", "Prospecting, deals, proposals, account management"],
				["marketing", "Campaigns, copy, brand, market research"],
				["legal", "Contracts, policies, regulatory questions"],
				["hr", "Hiring, people operations, internal policies"],
				["finance", "Accounting, budgets, forecasting, invoices"],
				["operations", "Logistics, procurement, internal processes"],
				["support", "Helping customers with questions or problems"],
			]),
		}],
	},
	{
		id: "audience",
		dimensions: [{
			key: "audience", name: "Audience", description: "Who will read or act on the output.", multiple: false, allow_other: false,
			values: values([
				["internal", "Colleagues inside the organisation"],
				["customer_facing", "Customers or users of the product"],
				["regulator", "Regulators, auditors or authorities"],
				["public", "Anyone, for example a published article or post"],
			]),
		}],
	},
	{
		id: "task_type",
		dimensions: [{
			key: "task_type", name: "Task type", description: "The kind of work the model is asked to do.", multiple: false, allow_other: false,
			values: values([
				["coding", "Writing, reviewing or explaining code"],
				["agent_workflow", "A step in a multi-step agent or tool-using workflow"],
				["data_processing", "Extracting, transforming or classifying data"],
				["content_writing", "Drafting or editing prose"],
				["analysis", "Reasoning about information to reach a conclusion"],
				["translation", "Converting text between languages"],
				["support", "Answering a customer or user question"],
				["other", "None of the above"],
			]),
		}],
	},
	{
		id: "engineering_work",
		dimensions: [{
			key: "engineering_work", name: "Engineering work", description: "The kind of software engineering task.", multiple: false, allow_other: true,
			values: values([
				["feature", "Building new functionality"],
				["bug_fix", "Finding or fixing a defect"],
				["refactor", "Restructuring code without changing behaviour"],
				["docs", "Writing or updating documentation"],
				["code_review", "Reviewing someone else's change"],
				["testing", "Writing or running tests"],
				["devops", "Builds, deployment, infrastructure, CI"],
			]),
		}],
	},
	{
		id: "agent_complexity",
		dimensions: [
			{
				key: "difficulty", name: "Difficulty", description: "How hard the task is for a capable model.", multiple: false, allow_other: false,
				values: values([
					["trivial", "A lookup or one-line answer"],
					["simple", "A short, well-defined task"],
					["moderate", "Several steps or some judgement"],
					["complex", "Many steps, ambiguity or deep domain knowledge"],
					["expert", "Frontier-level reasoning or long autonomous work"],
				]),
			},
			{
				key: "task_family", name: "Task family", description: "The broad family of the task.", multiple: false, allow_other: true,
				values: values([
					["coding", "Software engineering"],
					["research", "Finding and synthesising information"],
					["data_analysis", "Working with numbers, tables or datasets"],
					["writing", "Producing prose"],
					["planning", "Breaking down goals or scheduling work"],
					["tool_use", "Calling tools or APIs to act on something"],
				]),
			},
		],
	},
	{
		id: "compliance",
		dimensions: [
			{
				key: "pii_present", name: "Personal data present", description: "Whether the request contains personal data about an identifiable person.", multiple: false, allow_other: false,
				values: values([
					["yes", "Names with contact details, IDs, health or financial records about a person"],
					["no", "No personal data about an identifiable person"],
				]),
			},
			{
				key: "regulated_topic", name: "Regulated topic", description: "Whether the request is about a regulated area.", multiple: false, allow_other: false,
				values: values([
					["none", "Not about a regulated area"],
					["health", "Medical or health information"],
					["finance", "Financial advice, credit or payments"],
					["legal", "Legal advice or proceedings"],
					["children", "Concerns children or minors"],
				]),
			},
		],
		instructions: "Answer yes for personal data only when the transcript itself contains it, not when it merely mentions the topic.",
	},
];

export function getClassifierPreset(id: string): ClassifierPreset | undefined {
	return CLASSIFIER_PRESETS.find((preset) => preset.id === id);
}
