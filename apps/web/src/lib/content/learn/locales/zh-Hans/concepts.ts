import type { LearnCourse } from "../../types";

export const conceptsCourse: LearnCourse = {
	slug: "how-language-models-work",
	title: "语言模型如何工作",
	summary: "用通俗的语言介绍语言模型：它们如何学习，token 和上下文如何运作，以及如何核实它们告诉你的内容。",
	level: "beginner",
	format: "无需代码",
	prerequisites: [],
	lessons: [
		{
			slug: "how-models-learn",
			title: "模型如何学习",
			summary: "语言模型从海量文本中学习规律，然后经过调整学会遵循指令。",
			minutes: 6,
			body: `语言模型是一个程序，它读取文本，然后写出最可能接下来出现的文本。它每次只写一小段。向它提一个问题，它就会写出一个符合它所学规律的回答。

**模型的学习主要分两步。** 第一步是 **预训练**：模型阅读大量文本，例如书籍、网站和代码，学习预测下一个词。语言、事实和推理模式都是在这一步学到的。第二步是 **调优**：人们再用优质回答的示例继续训练它，让它遵循指令，表现得像一个乐于助人的助手，而不只是接着你的文本往下写。

**模型有知识截止日期。** 训练会在某个日期停止，模型对之后发生的事情一无所知。它不会自己去查资料。如果你需要最新的事实，就得把它们提供给模型，例如在提示词中加入一份文档，或开启网页搜索工具。

**推理模型会先思考再回答。** 它们先花额外的 token 把问题想清楚，然后再写出回答。这对数学、代码或规划等难题很有帮助，但耗时更长、成本更高，因为这些思考 token 计为输出。在 Phaseo 上，你可以用 \`reasoning.effort\`（在 Chat Completions 上是 \`reasoning_effort\`）选择模型思考的程度，范围从 \`none\` 到 \`max\`。更高的强度有助于解决难题，但会花费更多时间和 token。

**开放权重模型和闭源模型。** 有些实验室会公开模型的权重，也就是它在训练中学到的数值，这样许多提供商都可以托管它。另一些实验室则不公开权重，只通过自己的 API 或指定的合作伙伴提供模型。在 Phaseo 上，两种模型的调用方式完全一样。模型页面会在 **关于** 下显示它的许可证，并列出托管它的每个提供商。`,
			quiz: {
				question: "你问一个模型上周发生的事情，它给出了过时或编造的回答。为什么？",
				options: [
					"模型坏了，需要换一个提供商。",
					"你的推理强度设置得太低。",
					"模型只知道训练数据中的内容，截止到它的知识截止日期。",
				],
				answer: 2,
				explanation:
					"模型从截至某个日期收集的文本中学习。除非你把相关信息提供给它（例如放在提示词中，或通过网页搜索工具），否则它不可能知道之后发生的事情。",
			},
			scenario: {
				prompt: "你用一个推理模型回答简单的客户问题，例如营业时间。回答是正确的，但速度慢，成本也比预期高。你可以改什么？",
				answer:
					"简单问题很少需要多少思考。调低 `reasoning.effort`（或 `reasoning_effort`），或者换用不做推理的模型。思考 token 计为输出，所以思考得少，回答就更快、更便宜。把较高的强度留给困难的任务。",
			},
			takeaway: "模型根据训练中学到的内容预测文本，对截止日期之后的事情一无所知；推理模型用时间和 token 换取难题上更好的回答。",
			links: [
				{
					label: "推理强度参数",
					href: "https://phaseo.app/docs/v1/api-reference/parameters#parameter-reasoning",
				},
				{
					label: "浏览模型",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
				{ label: "模型", href: "https://phaseo.app/models" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "tokens-and-context",
			title: "Token 和上下文",
			summary: "模型以 token 为单位读写，你发送或接收的每个 token 都会增加时间和成本。",
			minutes: 7,
			body: `模型读文字的方式和你不一样。它们把文本切分成 **token**：词的一小部分、完整的短词、空格和标点。一个长词可能是好几个 token。从模型能读取的上限到你支付的价格，一切都以 token 计算。

**上下文窗口是模型一次能读取的内容量。** 它包含一个请求中的所有内容：你的指令、到目前为止的对话、任何文档或搜索结果、工具定义，以及模型写出的回答。每条提供商路由都有自己的 **上下文长度**，显示在模型页面上。

**输入 token 和输出 token 分别计算：**

| 类型 | 包含什么 |
| --- | --- |
| 输入 | 指令、你的消息、文档、工具定义 |
| 输出 | 回答，以及推理模型的思考内容 |

输出的单价通常高于输入，因为模型必须一个一个地写出每个输出 token。在 Phaseo 上，文本价格以每 100 万 token 的美元价格显示，输入和输出分别定价。每个响应的 \`usage\` 字段会报告它使用了多少 token。

**输出上限会让回答提前结束。** 你可以用 \`max_tokens\`（Chat Completions 和 Messages）或 \`max_output_tokens\`（Responses）限制输出。这能降低成本、缩短等待时间。但如果上限太小，回答会被截断，响应以 \`finish_reason: "length"\` 结束。这不是模型故障：调高上限，或降低推理强度即可。

**提示词缓存让重复的输入更便宜。** 如果提示词的开头部分在多个请求之间保持不变（例如很长的指令或参考文档），提供商就可以从缓存中读取它。这些 token 按较低的缓存读取价格计费，第一个 token 也会更快到达。大多数提供商会自动缓存重复的开头部分；Claude 只缓存你用 \`cache_control\` 标记的内容。`,
			quiz: {
				question: "一个响应在句子中间停了下来，`finish_reason` 为 `\"length\"`。发生了什么？",
				options: [
					"提供商失败了，Phaseo 本应换一个提供商重试。",
					"回答达到了输出上限，所以被截断了。",
					"提示词对模型的上下文窗口来说太长了。",
				],
				answer: 1,
				explanation:
					"`finish_reason: \"length\"` 表示回答达到了输出上限（`max_tokens` 或 `max_output_tokens`）。调高上限；如果是推理模型把上限都用在了思考上，就降低推理强度。",
			},
			scenario: {
				prompt: "你的客服机器人在每个请求的开头都发送同一份 20 页的政策文档，后面跟着客户的问题。你的账单大部分是输入 token。你能做什么？",
				answer:
					"把政策文档原样放在提示词开头，这样提供商就能缓存它。重复的输入会按缓存读取价格计费，回答也会更快开始。在 Claude 上，用 `cache_control` 标记政策文档的结尾。你也可以把文档精简到真正相关的部分。",
			},
			takeaway: "一切都以 token 计算：输入和输出按每百万 token 分别定价，输出上限可能截断回答，缓存能让重复的输入更便宜。",
			links: [
				{
					label: "上下文和 token 预算",
					href: "https://phaseo.app/docs/v1/guides/context-and-token-budgeting",
				},
				{
					label: "提示词缓存",
					href: "https://phaseo.app/docs/v1/guides/prompt-caching",
				},
				{
					label: "定价和计费",
					href: "https://phaseo.app/docs/v1/pricing/tiers",
				},
				{
					label: "术语表",
					href: "https://phaseo.app/docs/v1/glossary",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "check-the-output",
			title: "核实输出",
			summary: "模型可能听起来很肯定却依然出错，所以要让它的回答有据可依，并在依赖它之前先测试。",
			minutes: 7,
			body: `模型写出的是最可能接下来出现的文本。大多数时候，这也是正确的。但当它不知道某件事时，它仍然可能写出一个流畅、自信却错误的回答。这被称为 **幻觉**。编造的事实、引文、链接和数字都是常见的例子。

**让回答基于真实数据，并核对来源。** 当事实就摆在模型面前时，它会可靠得多。把你自己的文档放进提示词，要求它只根据这些文档回答，并说明每个事实出自哪里。对于最新信息，可以添加 \`phaseo:web_search\` 服务器工具（Beta 阶段）：模型会搜索网页，并根据结果写出回答，结果中包含你可以打开的 URL。一定要打开看看，因为模型也可能编造一个看起来很真实的链接。

**用结构化输出获得可靠的结构。** 如果你的代码需要读取回答，就随请求发送一个 JSON Schema。模型会返回该结构的 JSON，而不是自由文本。你的代码在使用结果之前仍然应该检查它，因为结构正确不代表内容正确。

**降低 temperature 以获得一致性。** \`temperature\` 控制模型加入多少变化。较低的值会给出更稳定、更可重复的回答。对于提取、分类和 JSON，文档建议使用 \`0.0\` 到 \`0.2\`。

**上线之前用真实示例测试。** 收集真实的输入，包括杂乱和不寻常的输入，并人工检查回答。每次更改提示词或模型时，都要再测一遍。`,
			quiz: {
				question: "你的应用向模型询问一家公司的成立年份，你需要答案准确。最好的做法是什么？",
				options: [
					"让回答基于可信的来源（例如网页搜索结果或你自己的数据），并核对该来源。",
					"把 `temperature` 设为 `0`，这样模型就总是正确的。",
					"让模型说出它有多确定，在它说确定时就相信它。",
				],
				answer: 0,
				explanation:
					"低 temperature 让回答更一致，而不是更正确；模型也可能在出错时听起来很肯定。为它提供可信的来源并核对该来源，才能让回答可靠。",
			},
			scenario: {
				prompt:
					"你构建了一个从发票中提取总额、日期和供应商的工具。演示时一切正常，但在生产环境中，你的代码有时会崩溃，因为模型回复了一句话而不是这些字段。你要改什么？",
				answer:
					"使用结构化输出：发送一个包含所需字段的 JSON Schema，让模型返回该结构的 JSON。把 `temperature` 设得低一些，例如 `0.0` 到 `0.2`。在代码中先验证 JSON 再使用，并在上线之前用一批真实发票（包括杂乱的发票）进行测试。",
			},
			takeaway: "把模型的回答当作草稿：让它基于真实来源，要求固定的结构，保持较低的 temperature 以求一致，并用真实示例测试。",
			links: [
				{
					label: "网页搜索服务器工具",
					href: "https://phaseo.app/docs/v1/guides/server-tools/web-search",
				},
				{
					label: "结构化输出",
					href: "https://phaseo.app/docs/v1/guides/structured-outputs",
				},
				{
					label: "推理参数",
					href: "https://phaseo.app/docs/v1/guides/inference-parameters",
				},
			],
			updated: "2026-11-17",
		},
	],
};
