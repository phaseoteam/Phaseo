import type { LearnCourse } from "../types";

export const conceptsCourse: LearnCourse = {
	slug: "how-language-models-work",
	title: "How language models work",
	summary:
		"A plain-language introduction to language models: how they learn, how tokens and context work, and how to check what they tell you.",
	level: "beginner",
	format: "No code",
	prerequisites: [],
	lessons: [
		{
			slug: "how-models-learn",
			title: "How models learn",
			summary:
				"A language model learns patterns from huge amounts of text, then gets tuned to follow instructions.",
			minutes: 6,
			body: `A language model is a program that reads text and writes the text most likely to come next. It does this one small piece at a time. Ask it a question, and it writes an answer that fits the patterns it has learned.

**Models learn in two main steps.** First comes **pre-training**: the model reads a very large amount of text, such as books, websites and code, and learns to predict the next word. This is where it picks up language, facts and reasoning patterns. Then comes **tuning**: people train it further on examples of good answers, so it follows instructions and behaves like a helpful assistant instead of just continuing your text.

**Models have a knowledge cutoff.** Training stops at some date, and the model knows nothing that happened after it. It doesn't look things up on its own. If you need recent facts, you have to give them to the model, for example by adding a document to your prompt or turning on a web search tool.

**Reasoning models think before they answer.** They spend extra tokens working through the problem first, then write the answer. This helps on hard problems, such as maths, code or planning, but it takes longer and costs more, because those thinking tokens count as output. On Phaseo you choose how much a model thinks with \`reasoning.effort\` (or \`reasoning_effort\` on Chat Completions), from \`none\` to \`max\`. Higher effort helps on hard problems and costs more time and tokens.

**Open-weight and closed models.** Some labs publish a model's weights, the numbers it learned in training, so many providers can host it. Others keep the weights private and serve the model only through their own API or chosen partners. On Phaseo you call both kinds the same way. A model's page shows its licence under **About** and lists every provider that hosts it.`,
			quiz: {
				question:
					"You ask a model about something that happened last week, and it gives an old or made-up answer. Why?",
				options: [
					"The model is broken and needs a different provider.",
					"Your reasoning effort was set too low.",
					"The model only knows what was in its training data, up to its knowledge cutoff.",
				],
				answer: 2,
				explanation:
					"A model learns from text collected up to a certain date. It can't know about later events unless you give it that information, for example in your prompt or with a web search tool.",
			},
			scenario: {
				prompt:
					"You use a reasoning model to answer simple customer questions, such as opening hours. Answers are correct but slow, and cost more than you expected. What could you change?",
				answer:
					"Simple questions rarely need much thinking. Lower `reasoning.effort` (or `reasoning_effort`), or use a model that doesn't reason. The thinking tokens count as output, so less thinking means faster and cheaper answers. Keep higher effort for hard tasks.",
			},
			takeaway:
				"A model predicts text from what it learned in training, knows nothing after its cutoff, and reasoning models trade time and tokens for better answers on hard problems.",
			links: [
				{
					label: "Reasoning parameters",
					href: "https://phaseo.app/docs/v1/api-reference/parameters#parameter-reasoning",
				},
				{
					label: "Exploring models",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
				{ label: "Models", href: "https://phaseo.app/models" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "tokens-and-context",
			title: "Tokens and context",
			summary:
				"Models read and write tokens, and every token you send or receive adds time and cost.",
			minutes: 7,
			body: `Models don't read words the way you do. They split text into **tokens**: short pieces of words, whole short words, spaces and punctuation. A long word may be several tokens. Everything is counted in tokens, from the limits on what a model can read to the price you pay.

**The context window is how much a model can read at once.** It holds everything in one request: your instructions, the conversation so far, any documents or search results, tool definitions, and the answer the model writes. Each provider route has its own **context length**, shown on the model's page.

**Input and output tokens are counted separately:**

| Kind | What it includes |
| --- | --- |
| Input | Instructions, your messages, documents, tool definitions |
| Output | The answer, plus a reasoning model's thinking |

Output usually costs more per token than input, because the model has to write each output token one at a time. On Phaseo, text prices are shown in USD per 1 million tokens, with separate input and output prices. Each response's \`usage\` field reports how many tokens it used.

**Output limits stop answers early.** You can cap output with \`max_tokens\` (Chat Completions and Messages) or \`max_output_tokens\` (Responses). This keeps cost and wait time down. But if the limit is too small, the answer is cut off and the response ends with \`finish_reason: "length"\`. That isn't a model failure: raise the limit, or lower the reasoning effort.

**Prompt caching makes repeated input cheaper.** If the start of your prompt stays the same across requests, such as long instructions or a reference document, the provider can read it from its cache. Those tokens are billed at the lower cache-read rate, and the first token arrives sooner. Most providers cache repeated starts on their own; Claude caches only what you mark with \`cache_control\`.`,
			quiz: {
				question:
					"A response stops in the middle of a sentence, and `finish_reason` is `\"length\"`. What happened?",
				options: [
					"The provider failed, so Phaseo should have retried another one.",
					"The answer reached the output limit, so it was cut off.",
					"The prompt was too long for the model's context window.",
				],
				answer: 1,
				explanation:
					"`finish_reason: \"length\"` means the answer hit the output limit (`max_tokens` or `max_output_tokens`). Raise the limit, or lower the reasoning effort if a reasoning model used it up thinking.",
			},
			scenario: {
				prompt:
					"Your support bot sends the same 20-page policy document at the start of every request, followed by the customer's question. Your bill is mostly input tokens. What can you do?",
				answer:
					"Keep the policy at the start of the prompt, unchanged, so the provider can cache it. Repeated input is then billed at the cache-read rate and answers start sooner. On Claude, mark the end of the policy with `cache_control`. You can also trim the document to the parts that matter.",
			},
			takeaway:
				"Everything is counted in tokens: input and output are priced separately per million, output limits can cut answers short, and caching makes repeated input cheaper.",
			links: [
				{
					label: "Context and token budgeting",
					href: "https://phaseo.app/docs/v1/guides/context-and-token-budgeting",
				},
				{
					label: "Prompt caching",
					href: "https://phaseo.app/docs/v1/guides/prompt-caching",
				},
				{
					label: "Pricing and billing",
					href: "https://phaseo.app/docs/v1/pricing/tiers",
				},
				{
					label: "Glossary",
					href: "https://phaseo.app/docs/v1/glossary",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "check-the-output",
			title: "Check the output",
			summary:
				"Models can sound sure and still be wrong, so ground their answers and test before you rely on them.",
			minutes: 7,
			body: `A model writes the text that is most likely to come next. Most of the time that is also correct. But when it doesn't know something, it can still write a fluent, confident answer that is wrong. This is called **hallucination**. Made-up facts, quotes, links and numbers are common examples.

**Ground answers in real data, and check the sources.** A model is far more reliable when the facts are in front of it. Put your own documents in the prompt and ask it to answer only from them, and to say where each fact comes from. For current information, add the \`phaseo:web_search\` server tool (in Beta): the model searches the web and writes an answer from the results, which include URLs you can open. Do open them, because a model can also invent a link that looks real.

**Get a reliable shape with structured outputs.** If your code needs to read the answer, send a JSON Schema with the request. The model then returns JSON in that shape instead of free text. Your code should still check the result before using it, because the shape can be right while the content is wrong.

**Lower the temperature for consistency.** \`temperature\` controls how much variety the model adds. Lower values give steadier, more repeatable answers. For extraction, classification and JSON, the docs suggest \`0.0\` to \`0.2\`.

**Test on real examples before you ship.** Collect real inputs, including messy and unusual ones, and check the answers by hand. Do it again whenever you change the prompt or the model.`,
			quiz: {
				question:
					"Your app asks a model for a company's founding year, and you need the answer to be right. What is the best approach?",
				options: [
					"Ground the answer in a trusted source, such as web search results or your own data, and check the source.",
					"Set `temperature` to `0`, which makes the model always correct.",
					"Ask the model to say how confident it is, and trust it when it says it's sure.",
				],
				answer: 0,
				explanation:
					"Low temperature makes answers more consistent, not more correct, and a model can sound sure while being wrong. Giving it a trusted source, and checking that source, is what makes the answer reliable.",
			},
			scenario: {
				prompt:
					"You built a tool that pulls the total, date and supplier from invoices. In your demo it worked, but in production your code sometimes crashes because the model replies with a sentence instead of the fields. What do you change?",
				answer:
					"Use structured outputs: send a JSON Schema with the fields you need, so the model returns JSON in that shape. Set a low `temperature`, such as `0.0` to `0.2`. Validate the JSON in your code before using it, and test on a set of real invoices, including messy ones, before you ship.",
			},
			takeaway:
				"Treat model answers as drafts: ground them in real sources, ask for a fixed shape, keep temperature low for consistency, and test on real examples.",
			links: [
				{
					label: "Web search server tool",
					href: "https://phaseo.app/docs/v1/guides/server-tools/web-search",
				},
				{
					label: "Structured outputs",
					href: "https://phaseo.app/docs/v1/guides/structured-outputs",
				},
				{
					label: "Inference parameters",
					href: "https://phaseo.app/docs/v1/guides/inference-parameters",
				},
			],
			updated: "2026-11-17",
		},
	],
};
